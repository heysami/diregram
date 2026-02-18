import { NexusNode } from '@/types/nexus';
import * as Y from 'yjs';
import { calculateTreeLayout } from '@/lib/layout-engine';
import { addHubVariantsImpl, toggleCommonNodeImpl } from '@/hooks/use-conditions-structure';
import { toggleFlowNodeImpl } from '@/lib/flow-node-logic';
import { setNodeTags as persistNodeTags } from '@/lib/node-tags';
import { stripDoAttrsFromLine, upsertDoAttrsInLine } from '@/lib/node-data-object-attribute-links';

export function useNexusStructure(doc: Y.Doc, roots: NexusNode[]) {
  
  const updateYText = (newText: string) => {
    const yText = doc.getText('nexus');
    if (yText.toString() !== newText) {
       doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, newText);
       });
    }
  };

  const createSibling = (node: NexusNode, nodeMap: Map<string, NexusNode>, activeVariantId?: string | null) => {
      // If Hub, use active variant line
      let targetNode = node;
      if (node.isHub && activeVariantId) {
          const v = node.variants?.find(v => v.id === activeVariantId);
          if (v) targetNode = v;
      }

      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      
      let insertAfterLine = targetNode.lineIndex;
      const findEnd = (n: NexusNode) => {
          insertAfterLine = Math.max(insertAfterLine, n.lineIndex);
          n.children.forEach(findEnd);
      }
      findEnd(targetNode);
      
      const indent = ' '.repeat(targetNode.level * 2);
      
      // Check for duplicate sibling content and add number suffix if needed
      const parentNode = targetNode.parentId ? nodeMap.get(targetNode.parentId) : null;
      const siblings = parentNode ? parentNode.children : roots;
      const baseName = 'New Node';
      let newNodeName = baseName;
      let counter = 2;
      
      // Check if base name already exists
      while (siblings.some(s => {
          // Extract content without conditions/tags for comparison
          const contentMatch = s.content.match(/^([^#]+)/);
          const siblingContent = contentMatch ? contentMatch[1].trim() : s.content.trim();
          return siblingContent === newNodeName;
      })) {
          newNodeName = `${baseName}-${counter}`;
          counter++;
      }
      
      // If this is within a process-flow context, keep #flow# on the new node too.
      // - parentNode.isFlowNode covers normal "create sibling under a flow root"
      // - targetNode.isFlowNode covers edge cases like creating a sibling of a flow root itself
      const shouldFlow = !!(parentNode?.isFlowNode || targetNode.isFlowNode);
      const newLineContent = shouldFlow ? `${indent}${newNodeName} #flow#` : `${indent}${newNodeName}`;
      
      lines.splice(insertAfterLine + 1, 0, newLineContent);
      const newText = lines.join('\n');
      updateYText(newText);
      
      return { lineIndex: insertAfterLine + 1, type: 'edit' as const, selectAll: true };
  };

  const createChild = (node: NexusNode, nodeMap: Map<string, NexusNode>, activeVariantId?: string | null) => {
      // If Hub, use active variant line
      let targetNode = node;
      if (node.isHub && activeVariantId) {
          const v = node.variants?.find(v => v.id === activeVariantId);
          if (v) targetNode = v;
      }

      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      
      const indent = ' '.repeat((targetNode.level + 1) * 2);
      
      // Check for duplicate sibling content and add number suffix if needed
      const siblings = targetNode.children;
      const baseName = 'New Child';
      let newNodeName = baseName;
      let counter = 2;
      
      // Check if base name already exists
      while (siblings.some(s => {
          // Extract content without conditions/tags for comparison
          const contentMatch = s.content.match(/^([^#]+)/);
          const siblingContent = contentMatch ? contentMatch[1].trim() : s.content.trim();
          return siblingContent === newNodeName;
      })) {
          newNodeName = `${baseName}-${counter}`;
          counter++;
      }
      
      // If parent is a process node, automatically add #flow# tag to new child
      const newLineContent = targetNode.isFlowNode 
        ? `${indent}${newNodeName} #flow#`
        : `${indent}${newNodeName}`;
      
      lines.splice(targetNode.lineIndex + 1, 0, newLineContent);
      const newText = lines.join('\n');
      updateYText(newText);
      
      return { lineIndex: targetNode.lineIndex + 1, type: 'edit' as const, selectAll: true };
  };

  const deleteNode = (node: NexusNode) => {
      // If Hub, delete ALL variants
      if (node.isHub && node.variants) {
           const sortedVariants = [...node.variants].sort((a, b) => b.lineIndex - a.lineIndex);
           const yText = doc.getText('nexus');
           const lines = yText.toString().split('\n');
           
           doc.transact(() => {
               sortedVariants.forEach(v => {
                    lines.splice(v.lineIndex, 1);
               });
               
               yText.delete(0, yText.length);
               yText.insert(0, lines.join('\n'));
           });
           
           return { type: 'select' as const, targetId: null };
      } else {
            const yText = doc.getText('nexus');
            const lines = yText.toString().split('\n');
            
            lines.splice(node.lineIndex, 1);
            updateYText(lines.join('\n'));
            
            return { type: 'select' as const, targetId: null };
      }
  };

  const moveNodeStructure = (node: NexusNode, direction: 'up' | 'down' | 'indent' | 'unindent', nodeMap: Map<string, NexusNode>) => {
       const yText = doc.getText('nexus');
       const lines = yText.toString().split('\n');
       
       const getIndent = (line: string) => {
           const m = line.match(/^(\s*)/);
           return m ? m[1].length : 0;
       };
       const findBlockEndByIndent = (startLineIndex: number): number => {
           if (startLineIndex < 0 || startLineIndex >= lines.length) return startLineIndex;
           const baseIndent = getIndent(lines[startLineIndex]);
           let end = startLineIndex;
           for (let i = startLineIndex + 1; i < lines.length; i++) {
               const l = lines[i];
               const trimmed = l.trim();
               if (trimmed === '---') break; // never cross metadata separator
               if (trimmed.startsWith('```')) break; // never cross code blocks
               if (trimmed === '') {
                   // Preserve blank lines that are part of the block region.
                   end = i;
                   continue;
               }
               const indent = getIndent(l);
               if (indent <= baseIndent) break;
               end = i;
           }
           return end;
       };
       
       const nodeBlockEnd = findBlockEndByIndent(node.lineIndex);
       const nodeBlockLines = lines.slice(node.lineIndex, nodeBlockEnd + 1);
       
       if (direction === 'indent') {
           const line = lines[node.lineIndex];
           const match = line.match(/^(\s*)(.*)/);
           if (match) {
               const indent = match[1];
               const content = match[2];
               lines[node.lineIndex] = `${indent}>> ${content}`;
               updateYText(lines.join('\n'));
               return { lineIndex: node.lineIndex, type: 'select' as const };
           }
       } else if (direction === 'unindent') {
           const line = lines[node.lineIndex];
           if (line.includes('>> ')) {
               lines[node.lineIndex] = line.replace('>> ', '');
               updateYText(lines.join('\n'));
               return { lineIndex: node.lineIndex, type: 'select' as const };
           } else {
               // Standard unindent:
               // If we just remove indentation "in place", any following siblings of the original parent
               // may become children of this newly-outdented node (because they remain indented and follow it).
               // To prevent that, we promote the node + its subtree and move the whole block to after
               // the parent's subtree.
               const newBlock = nodeBlockLines.map((l) => (l.startsWith('  ') ? l.substring(2) : l));

               // If no parent, fall back to in-place unindent.
               if (!node.parentId) {
                   lines.splice(node.lineIndex, nodeBlockLines.length, ...newBlock);
                   updateYText(lines.join('\n'));
                   return { lineIndex: node.lineIndex, type: 'select' as const };
               }

               const parent = nodeMap.get(node.parentId);
               if (!parent) {
                   lines.splice(node.lineIndex, nodeBlockLines.length, ...newBlock);
                   updateYText(lines.join('\n'));
                   return { lineIndex: node.lineIndex, type: 'select' as const };
               }

               const parentBlockEnd = findBlockEndByIndent(parent.lineIndex);

               // Remove the node block first.
               lines.splice(node.lineIndex, nodeBlockLines.length);

               // Insert after the parent's subtree (in the original document).
               // After removal, the insertion index shifts if the node was above the insert point.
               const insertIndexOriginal = parentBlockEnd + 1;
               const insertIndex = node.lineIndex < insertIndexOriginal
                   ? insertIndexOriginal - nodeBlockLines.length
                   : insertIndexOriginal;

               lines.splice(insertIndex, 0, ...newBlock);
               updateYText(lines.join('\n'));
               return { lineIndex: insertIndex, type: 'select' as const };
           }
       } else if (direction === 'up' || direction === 'down') {
           // Swap Logic
           const siblings = node.parentId ? nodeMap.get(node.parentId)!.children : roots;
           const currentIndex = siblings.findIndex(s => s.id === node.id);
           
           if (direction === 'up' && currentIndex > 0) {
               const prevSibling = siblings[currentIndex - 1];
               lines.splice(node.lineIndex, nodeBlockLines.length);
               lines.splice(prevSibling.lineIndex, 0, ...nodeBlockLines);
               updateYText(lines.join('\n'));
               return { lineIndex: prevSibling.lineIndex, type: 'select' as const };
           }
           else if (direction === 'down' && currentIndex < siblings.length - 1) {
               const nextSibling = siblings[currentIndex + 1];
               const nextMaxLine = findBlockEndByIndent(nextSibling.lineIndex);
               
               lines.splice(node.lineIndex, nodeBlockLines.length);
               const insertIndex = nextMaxLine + 1 - nodeBlockLines.length;
               lines.splice(insertIndex, 0, ...nodeBlockLines);
               updateYText(lines.join('\n'));
               return { lineIndex: insertIndex, type: 'select' as const };
           }
       }
       return null;
  };

  const addHubVariants = (
    node: NexusNode,
    activeVariantId: string | null,
    variantsToAdd: Record<string, string>[],
  ) => {
    addHubVariantsImpl(doc, node, activeVariantId, variantsToAdd);
  };

  const toggleCommonNode = (node: NexusNode, activeVariantId: string | null) => {
    toggleCommonNodeImpl(doc, roots, node, activeVariantId);
  };

  const toggleFlowNode = (node: NexusNode) => {
    toggleFlowNodeImpl(doc, node, roots);
  };

  const setNodeIcon = (node: NexusNode, icon: string | null) => {
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');

    const sanitize = (raw: string): string => {
      // Keep it single-line and prevent breaking the HTML comment wrapper.
      // This is intentionally conservative; we just need emoji/ascii.
      return raw
        .replace(/\r?\n/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/--/g, '')
        .replace(/<!--/g, '')
        .replace(/-->/g, '')
        .trim();
    };

    const normalized = icon ? sanitize(icon) : '';
    const nextIcon = normalized.length ? normalized.slice(0, 40) : ''; // soft cap

    const targetLineIndices = (() => {
      if (node.isHub && node.variants && node.variants.length > 0) {
        return node.variants.map((v) => v.lineIndex);
      }
      return [node.lineIndex];
    })();

    const ICON_COMMENT_RE = /\s*<!--\s*icon:[\s\S]*?\s*-->\s*/g;

    let changed = false;
    targetLineIndices.forEach((lineIndex) => {
      if (lineIndex < 0 || lineIndex >= lines.length) return;
      const original = lines[lineIndex];
      const withoutIcon = original.replace(ICON_COMMENT_RE, ' ').replace(/\s+$/g, '');
      const withIcon = nextIcon ? `${withoutIcon} <!-- icon:${nextIcon} -->` : withoutIcon;
      if (withIcon !== original) {
        lines[lineIndex] = withIcon;
        changed = true;
      }
    });

    if (changed) {
      updateYText(lines.join('\n'));
    }
  };

  const setNodeDataObjectId = (node: NexusNode, dataObjectId: string | null) => {
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');

    const sanitize = (raw: string): string => {
      return raw
        .replace(/\r?\n/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/--/g, '')
        .replace(/<!--/g, '')
        .replace(/-->/g, '')
        .trim();
    };

    const normalized = dataObjectId ? sanitize(dataObjectId) : '';
    const nextId = normalized.length ? normalized.slice(0, 64) : '';

    const targetLineIndices = (() => {
      if (node.isHub && node.variants && node.variants.length > 0) {
        return node.variants.map((v) => v.lineIndex);
      }
      return [node.lineIndex];
    })();

    const DO_COMMENT_RE = /\s*<!--\s*do:[\s\S]*?\s*-->\s*/g;

    let changed = false;
    targetLineIndices.forEach((lineIndex) => {
      if (lineIndex < 0 || lineIndex >= lines.length) return;
      const original = lines[lineIndex];
      const without = original.replace(DO_COMMENT_RE, ' ').replace(/\s+$/g, '');
      // If do: is cleared, also clear doattrs (attributes are meaningless without an object).
      const withoutAttrs = nextId ? without : stripDoAttrsFromLine(without);
      const withId = nextId ? `${withoutAttrs} <!-- do:${nextId} -->` : withoutAttrs;
      if (withId !== original) {
        lines[lineIndex] = withId;
        changed = true;
      }
    });

    if (changed) {
      updateYText(lines.join('\n'));
    }
  };

  const setNodeDataObjectAttributeIds = (node: NexusNode, attributeIds: string[]) => {
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');

    const targetLineIndices = (() => {
      if (node.isHub && node.variants && node.variants.length > 0) {
        return node.variants.map((v) => v.lineIndex);
      }
      return [node.lineIndex];
    })();

    let changed = false;
    targetLineIndices.forEach((lineIndex) => {
      if (lineIndex < 0 || lineIndex >= lines.length) return;
      const original = lines[lineIndex];
      const withIds = upsertDoAttrsInLine(original, attributeIds);
      if (withIds !== original) {
        lines[lineIndex] = withIds;
        changed = true;
      }
    });

    if (changed) {
      updateYText(lines.join('\n'));
    }
  };

  const setNodeTags = (node: NexusNode, tagIds: string[]) => {
    persistNodeTags(doc, node, tagIds);
  };

  function resolveHubTarget(node: NexusNode, nodeMap: Map<string, NexusNode>, activeVariantId?: string | null): NexusNode {
    if (!node.isHub) return node;
    const id = activeVariantId || '';
    if (!id) return node;
    const v = node.variants?.find((vv) => vv.id === id) || nodeMap.get(id) || null;
    return v || node;
  }

  function getIndentLen(line: string): number {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function findBlockEndByIndent(lines: string[], startLineIndex: number): number {
    if (startLineIndex < 0 || startLineIndex >= lines.length) return startLineIndex;
    const baseIndent = getIndentLen(lines[startLineIndex] || '');
    let end = startLineIndex;
    for (let i = startLineIndex + 1; i < lines.length; i++) {
      const l = lines[i] ?? '';
      const trimmed = l.trim();
      if (trimmed === '---') break; // never cross metadata separator
      if (trimmed.startsWith('```')) break; // never cross code blocks
      if (trimmed === '') {
        // Preserve blank lines that are part of the block region.
        end = i;
        continue;
      }
      const indent = getIndentLen(l);
      if (indent <= baseIndent) break;
      end = i;
    }
    return end;
  }

  function normalizeSnippetIndent(lines: string[]): string[] {
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length === 0) return [];
    const minIndent = nonEmpty.reduce((min, l) => Math.min(min, getIndentLen(l)), Infinity);
    if (!Number.isFinite(minIndent) || minIndent <= 0) return lines.slice();
    return lines.map((l) => {
      if (l.trim() === '') return '';
      // Only strip if it actually has that much leading whitespace.
      return l.startsWith(' '.repeat(minIndent)) ? l.slice(minIndent) : l.replace(/^\s+/, '');
    });
  }

  const extractSubtreeMarkdown = (node: NexusNode, nodeMap: Map<string, NexusNode>, activeVariantId?: string | null): string => {
    const targetNode = resolveHubTarget(node, nodeMap, activeVariantId);
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const start = targetNode.lineIndex;
    const end = findBlockEndByIndent(lines, start);
    const block = lines.slice(start, end + 1);
    const normalized = normalizeSnippetIndent(block);
    return normalized.join('\n').trimEnd() + '\n';
  };

  const insertSubtreeMarkdownAsChild = (
    node: NexusNode,
    nodeMap: Map<string, NexusNode>,
    snippetMarkdown: string,
    activeVariantId?: string | null,
  ) => {
    const targetNode = resolveHubTarget(node, nodeMap, activeVariantId);
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const insertAfterLine = findBlockEndByIndent(lines, targetNode.lineIndex);

    const rawSnippetLines = String(snippetMarkdown || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/g, ''));

    // Trim leading/trailing blank lines for clean insertion.
    while (rawSnippetLines.length && rawSnippetLines[0].trim() === '') rawSnippetLines.shift();
    while (rawSnippetLines.length && rawSnippetLines[rawSnippetLines.length - 1].trim() === '') rawSnippetLines.pop();
    if (rawSnippetLines.length === 0) return null;

    const normalized = normalizeSnippetIndent(rawSnippetLines);
    const indentPrefix = ' '.repeat((targetNode.level + 1) * 2);
    const insertedLines = normalized.map((l) => (l.trim() === '' ? '' : indentPrefix + l));

    lines.splice(insertAfterLine + 1, 0, ...insertedLines);
    updateYText(lines.join('\n'));
    return { lineIndex: insertAfterLine + 1, type: 'select' as const };
  };

  const insertSubtreeMarkdownAsSiblingAfter = (
    node: NexusNode,
    nodeMap: Map<string, NexusNode>,
    snippetMarkdown: string,
    activeVariantId?: string | null,
  ) => {
    const targetNode = resolveHubTarget(node, nodeMap, activeVariantId);
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const insertAfterLine = findBlockEndByIndent(lines, targetNode.lineIndex);

    const rawSnippetLines = String(snippetMarkdown || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/g, ''));
    while (rawSnippetLines.length && rawSnippetLines[0].trim() === '') rawSnippetLines.shift();
    while (rawSnippetLines.length && rawSnippetLines[rawSnippetLines.length - 1].trim() === '') rawSnippetLines.pop();
    if (rawSnippetLines.length === 0) return null;

    const normalized = normalizeSnippetIndent(rawSnippetLines);
    const indentPrefix = ' '.repeat(targetNode.level * 2);
    const insertedLines = normalized.map((l) => (l.trim() === '' ? '' : indentPrefix + l));

    lines.splice(insertAfterLine + 1, 0, ...insertedLines);
    updateYText(lines.join('\n'));
    return { lineIndex: insertAfterLine + 1, type: 'select' as const };
  };

  return {
    createSibling,
    createChild,
    deleteNode,
    moveNodeStructure,
    addHubVariants,
    toggleCommonNode,
    toggleFlowNode,
    setNodeIcon,
    setNodeDataObjectId,
    setNodeDataObjectAttributeIds,
    setNodeTags,
    extractSubtreeMarkdown,
    insertSubtreeMarkdownAsChild,
    insertSubtreeMarkdownAsSiblingAfter,
  };
}
