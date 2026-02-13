import { NexusNode } from '@/types/nexus';
import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { parseDoAttrsFromLine, stripDoAttrsFromLine } from '@/lib/node-data-object-attribute-links';

// Generate IDs based on ORIGINAL markdown line index for simplicity.
// Note: IDs may change when lines are added/removed, but stable anchors (<!-- rn:N --> etc.) are used for persistence.
const generateId = (originalLineIndex: number) => `node-${originalLineIndex}`;

function findSeparatorIndexOutsideFences(lines: string[]): number {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim() === '---') return i;
  }
  return -1;
}

/**
 * If the entire input is wrapped in a single outer fenced code block (common when users copy/paste),
 * unwrap it so the parser can still detect nodes.
 *
 * Example:
 * ```md
 * Root
 *   Child
 * ---
 * ```tag-store
 * {...}
 * ```
 * ```
 */
function maybeUnwrapSingleOuterFence(rawText: string): string {
  const text = normalizeMarkdownNewlines(rawText || '');
  const lines = text.split('\n');
  // Find first/last non-empty lines.
  let first = 0;
  while (first < lines.length && !lines[first].trim()) first++;
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  if (first >= last) return text;

  const firstLine = lines[first].trim();
  const lastLine = lines[last].trim();
  if (!firstLine.startsWith('```') || lastLine !== '```') return text;

  // Ensure there is no non-empty content outside the outer fence block.
  for (let i = 0; i < first; i++) {
    if (lines[i].trim()) return text;
  }
  for (let i = last + 1; i < lines.length; i++) {
    if (lines[i].trim()) return text;
  }

  // Unwrap.
  return lines.slice(first + 1, last).join('\n');
}

export function parseNexusMarkdown(text: string): NexusNode[] {
  const unwrapped = maybeUnwrapSingleOuterFence(text);
  const lines = normalizeMarkdownNewlines(unwrapped).split('\n');
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  let contentLines = separatorIndex === -1 ? lines : lines.slice(0, separatorIndex);
  
  // Filter out code blocks (custom-connections, flowjson, tablejson, etc.)
  const filteredLines: Array<{ line: string; originalIndex: number }> = [];
  let inCodeBlock = false;
  let codeBlockType = '';
  
  // IMPORTANT: keep ORIGINAL markdown line indices so editing operations can splice into the real text correctly.
  // contentLines is taken from the original `lines` array, so `i` is the original line index.
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    const codeBlockMatch = line.match(/^```(\w+)?/);
    
    if (codeBlockMatch) {
      if (!inCodeBlock) {
        // Starting a code block
        inCodeBlock = true;
        codeBlockType = codeBlockMatch[1] || '';
      } else {
        // Ending a code block
        inCodeBlock = false;
        codeBlockType = '';
      }
      continue; // Skip the code block markers
    }
    
    if (!inCodeBlock) {
      filteredLines.push({ line, originalIndex: i });
    }
    // If inCodeBlock is true, skip the line (it's inside a code block)
  }
  
  // We now parse from filtered lines but preserve original indices.
  const rootNodes: NexusNode[] = [];
  const stack: { node: NexusNode; level: number }[] = [];

  // Pass 1: Parse structure and basic attributes
  filteredLines.forEach(({ line, originalIndex }) => {
    // Extract icon annotation (if any) before stripping comments
    // Format: <!-- icon:🙂 --> (any printable content, single-line)
    const iconMatch = line.match(/<!--\s*icon:([\s\S]*?)\s*-->/);
    const icon = iconMatch ? iconMatch[1].trim() : undefined;

    // Extract linked data object annotation (if any)
    // Format: <!-- do:do-1 -->
    const doMatch = line.match(/<!--\s*do:([^>]+)\s*-->/);
    const dataObjectId = doMatch ? doMatch[1].trim() : undefined;

    // Extract linked data object attribute ids (if any)
    // Format: <!-- doattrs:__objectName__,attr-abc,attr-def -->
    const dataObjectAttributeIds = parseDoAttrsFromLine(line);

    // Extract node tags (if any). Stored as IDs, and not shown on canvas.
    // Format: <!-- tags:tag-1,tag-2 -->
    const tagsMatch = line.match(/<!--\s*tags:([^>]*)\s*-->/);
    const tags = tagsMatch
      ? tagsMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    // Extract annotation (if any). Stored URL-encoded, with newlines escaped as \n.
    // Format: <!-- ann:... -->
    const annMatch = line.match(/<!--\s*ann:([^>]*)\s*-->/);
    let annotation: string | undefined = undefined;
    if (annMatch) {
      try {
        const decoded = decodeURIComponent((annMatch[1] || '').trim());
        annotation = decoded.replace(/\\n/g, '\n');
      } catch {
        // Fallback: treat raw as literal, still decode newline escapes.
        annotation = (annMatch[1] || '').trim().replace(/\\n/g, '\n');
      }
      if (annotation && !annotation.trim()) annotation = undefined;
    }

    // UI type is stored as a tag (tg-uiType) now.
    // We still strip `<!-- uiType:... -->` for backward compatibility so it never appears as text.

    // Extract stable Flow Tab ID (if any). Used to identify flows across edits.
    // Format: <!-- fid:flowtab-1 -->
    const fidMatch = line.match(/<!--\s*fid:([^>]+)\s*-->/);
    const fid = fidMatch ? fidMatch[1].trim() : undefined;

    // Extract stable System Flow ID (if any). Used to identify system flows across edits.
    // Format: <!-- sfid:systemflow-1 -->
    const sfidMatch = line.match(/<!--\s*sfid:([^>]+)\s*-->/);
    const sfid = sfidMatch ? sfidMatch[1].trim() : undefined;

    // Extract linked Data Object status attribute ids (if any).
    // Format: <!-- dostatus:attr-1,attr-2 -->
    const doStatusMatch = line.match(/<!--\s*dostatus:([^>]*)\s*-->/i);
    const doStatusAttrIds =
      doStatusMatch?.[1]
        ? doStatusMatch[1]
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : undefined;

    // Remove annotation comments before parsing (these should never be visible as node content)
    let cleanedLine = line.replace(/<!--\s*expanded:\d+\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*desc:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*ann:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*rn:\d+\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*expid:\d+\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*icon:[\s\S]*?\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*do:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*dostatus:[^>]*\s*-->/i, '');
    cleanedLine = stripDoAttrsFromLine(cleanedLine);
    cleanedLine = cleanedLine.replace(/<!--\s*tags:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*uiType:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*fid:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*sfid:[^>]*\s*-->/, '');
    cleanedLine = cleanedLine.replace(/<!--\s*hubnote:\d+\s*-->/, '');
    
    // 2 spaces = 1 level
    const match = cleanedLine.match(/^(\s*)(.*)/);
    if (!match) return;

    const spaces = match[1].length;
    const rawContent = match[2].trim();
    
    if (!rawContent.trim()) return;

    // Detect Visual Indent (>> )
    let visualLevel = 0;
    let contentForProcessing = rawContent;
    while (contentForProcessing.startsWith('>>')) {
        visualLevel++;
        contentForProcessing = contentForProcessing.substring(2).trimStart();
    }

    // Standard indent: 2 spaces or 1 tab
    const level = Math.floor(spaces / 2); 

    // Parse Attributes
    let displayContent = contentForProcessing;
    const conditions: Record<string, string> = {};
    let isCommon = false;

    // Parse Condition: (key=value, key2=value2)
    // Regex to find parens that contain =
    // Loop to handle multiple groups (though typically one group with commas)
    // Actually, let's just extract all parens first.
    
    let activeContent = displayContent;
    const parenMatches = activeContent.matchAll(/\(([^)]+)\)/g);
    
    // We need to be careful not to replace text if we iterate.
    // Simpler approach: Iteratively find and replace
    
    while (true) {
        const match = /\(([^)]+)\)/.exec(activeContent);
        if (!match) break;
        
        const inner = match[1];
        const fullMatch = match[0];
        
        // Check if it looks like attributes
        if (inner.includes('=')) {
            // Split by comma
            const pairs = inner.split(',');
            pairs.forEach(pair => {
                const [k, v] = pair.split('=').map(s => s.trim());
                if (k && v) {
                    conditions[k] = v;
                }
            });
            activeContent = activeContent.replace(fullMatch, '');
        } else {
            // Just parens text? leave it? or remove?
            // "Student Application (draft)" -> might not be a condition.
            // Requirement says "Condition: (key=value)".
            // Let's assume non-equals parens are part of content unless strictly 'common'
            break; // Stop loop to avoid infinite if we don't remove it
        }
    }
    
    // Check for #common# tag (more specific than (common) to avoid conflicts)
    let isFlowNode = false;
    let isFlowTabRoot = false;
    let isSystemFlowRoot = false;
    if (activeContent.includes('#common#')) {
        isCommon = true;
        activeContent = activeContent.replace(/#common#/g, '').trim();
    }
    
    // Check for #flow# tag
    if (activeContent.includes('#flow#')) {
        isFlowNode = true;
        activeContent = activeContent.replace(/#flow#/g, '').trim();
    }

    // Flow tab root marker (used to hide from main canvas but show under Flow tab)
    if (activeContent.includes('#flowtab#')) {
        isFlowTabRoot = true;
        activeContent = activeContent.replace(/#flowtab#/g, '').trim();
    }

    // System flow root marker (used to hide from main canvas but show under System Flow tab)
    if (activeContent.includes('#systemflow#')) {
        isSystemFlowRoot = true;
        activeContent = activeContent.replace(/#systemflow#/g, '').trim();
    }
    
    displayContent = activeContent.trim();
    // Guard: lines that only contain markers (e.g. "#flow#" / "#flowtab#") should not create blank nodes.
    if (!displayContent) return;
    
    // Decode newlines in content (convert \\n to actual \n)
    // In markdown, \\n is stored as literal backslash followed by n (two characters)
    // We need to replace the literal sequence \n (backslash + n) with actual newline character
    // The regex /\\n/g matches a backslash followed by n
    let decodedContent = displayContent;
    // Replace all occurrences of \n (backslash + n) with actual newline
    decodedContent = decodedContent.replace(/\\n/g, '\n');

    const newNode: NexusNode = {
      id: generateId(originalIndex),
      content: decodedContent,
      rawContent: rawContent, // Keep original line content (without indentation)
      level: level,
      visualLevel: visualLevel,
      lineIndex: originalIndex,
      parentId: null,
      children: [], 
      icon: icon || undefined,
      annotation,
      dataObjectId: dataObjectId || undefined,
      dataObjectAttributeIds: dataObjectAttributeIds.length ? dataObjectAttributeIds : undefined,
      conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
      isCommon,
      tags: tags && tags.length > 0 ? tags : undefined,
      isFlowNode: isFlowNode || undefined,
      metadata:
        isFlowTabRoot || fid || isSystemFlowRoot || sfid || (doStatusAttrIds && doStatusAttrIds.length)
          ? ({
              ...(isFlowTabRoot ? { flowTab: true } : {}),
              ...(fid ? { fid } : {}),
              ...(isSystemFlowRoot ? { systemFlow: true } : {}),
              ...(sfid ? { sfid } : {}),
              ...(doStatusAttrIds && doStatusAttrIds.length ? { doStatusAttrIds } : {}),
            } as Record<string, unknown>)
          : undefined,
    };

    if (level === 0) {
      rootNodes.push(newNode);
      stack.length = 0; 
      stack.push({ node: newNode, level });
    } else {
      // Find parent
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        const parent = stack[stack.length - 1].node;
        newNode.parentId = parent.id;
        parent.children.push(newNode); 
        stack.push({ node: newNode, level });
      } else {
        // Fallback for detached nodes (shouldn't happen with strict indent)
        rootNodes.push(newNode);
        stack.push({ node: newNode, level });
      }
    }
  });

  // Pass 2: Grouping Variants
  const processGrouping = (nodes: NexusNode[]): NexusNode[] => {
      // Grouping Logic:
      // 1. Traverse children first
      // 2. Identify siblings with same content name
      // 3. ONLY collapse them into a Hub if at least one of them has a condition.
      // 4. If no conditions in group, keep as separate siblings.

      const processedNodes: NexusNode[] = [];
      const contentMap = new Map<string, NexusNode[]>();
      
      // Pre-process children recursively
      nodes.forEach(node => {
          if (node.children.length > 0) {
              node.children = processGrouping(node.children);
          }
      });

      // Group siblings by content AND tags (#flow#, #common#)
      // This ensures nodes with different tags are not grouped together
      nodes.forEach(node => {
        // Include tags in the grouping key to distinguish nodes with different metadata
        const tags: string[] = [];
        if (node.isFlowNode) tags.push('#flow#');
        if (node.isCommon) tags.push('#common#');
        const meta = node.metadata as Record<string, unknown> | undefined;
        if (meta?.flowTab) tags.push('#flowtab#');
        if (typeof meta?.fid === 'string' && meta.fid) tags.push(`fid:${meta.fid}`);
        if (meta?.systemFlow) tags.push('#systemflow#');
        if (typeof meta?.sfid === 'string' && meta.sfid) tags.push(`sfid:${meta.sfid}`);
        const key = node.content
          + (node.icon ? `|icon:${node.icon}` : '')
          + (tags.length > 0 ? ' ' + tags.sort().join(' ') : '');
        if (!contentMap.has(key)) {
          contentMap.set(key, []);
        }
        contentMap.get(key)!.push(node);
      });
      
      const handledIds = new Set<string>();
      
      nodes.forEach(node => {
        if (handledIds.has(node.id)) return;

        // Recompute the same key used when building contentMap (content + tags)
        const tags: string[] = [];
        if (node.isFlowNode) tags.push('#flow#');
        if (node.isCommon) tags.push('#common#');
        const meta = node.metadata as Record<string, unknown> | undefined;
        if (meta?.flowTab) tags.push('#flowtab#');
        if (typeof meta?.fid === 'string' && meta.fid) tags.push(`fid:${meta.fid}`);
        if (meta?.systemFlow) tags.push('#systemflow#');
        if (typeof meta?.sfid === 'string' && meta.sfid) tags.push(`sfid:${meta.sfid}`);
        const key = node.content
          + (node.icon ? `|icon:${node.icon}` : '')
          + (tags.length > 0 ? ' ' + tags.sort().join(' ') : '');

        const group = contentMap.get(key);
        if (!group || group.length === 0) {
          // Fallback: if grouping information is missing, just keep the node as-is
          processedNodes.push(node);
          return;
        }

        // Check if this group should be a hub
        const hasCondition = group.some(n => n.conditions && Object.keys(n.conditions).length > 0);
        const shouldCollapse = hasCondition;

        if (shouldCollapse) {
          // Create Hub from the first node (this node)
          // Mark all variants as handled
          group.forEach(n => handledIds.add(n.id));

          node.isHub = true;
          node.variants = group;
          processedNodes.push(node);
        } else {
          // Do NOT collapse. Just add this node.
          // Do not mark others as handled, they will be processed in order.
          processedNodes.push(node);
        }
      });

      return processedNodes;
  };

  return processGrouping(rootNodes);
}
