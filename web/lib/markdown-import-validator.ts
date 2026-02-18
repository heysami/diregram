import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';
import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { loadDataObjectAttributes } from '@/lib/data-object-attributes';
import { OBJECT_NAME_ATTR_ID } from '@/lib/data-object-attribute-ids';

export type ImportValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
};

export type ImportValidationResult = {
  errors: ImportValidationIssue[];
  warnings: ImportValidationIssue[];
  aiFriendlyReport: string;
};

type FencedBlock = {
  type: string;
  startLine: number; // index in full markdown lines
  endLine: number; // index in full markdown lines
  body: string; // without fences
};

const REQUIRED_TAG_GROUPS = {
  actors: 'tg-actors',
  uiSurface: 'tg-uiSurface',
} as const;

function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

function stripInlineMarkers(s: string): string {
  // Remove known inline markers that should not be considered part of a title.
  return s.replace(/#flowtab#|#flow#|#common#|#systemflow#/g, ' ');
}

function nodeTitleForPrefixChecks(rawLine: string): string {
  // Best-effort “node title” for prefix checks:
  // - remove indentation
  // - remove inline HTML comments
  // - remove known markers
  // - trim/collapse whitespace
  const noIndent = rawLine.replace(/^\s+/, '');
  const noComments = stripHtmlComments(noIndent);
  const noMarkers = stripInlineMarkers(noComments);
  return noMarkers.replace(/\s+/g, ' ').trim();
}

function add(out: ImportValidationIssue[], severity: 'error' | 'warning', code: string, message: string) {
  out.push({ severity, code, message });
}

function traverseAllParsedNodes(roots: NexusNode[], visit: (n: NexusNode) => void) {
  const walk = (nodes: NexusNode[]) => {
    nodes.forEach((n) => {
      visit(n);
      if (n.isHub && n.variants) {
        n.variants.forEach((v) => {
          visit(v);
          walk(v.children);
        });
      } else {
        walk(n.children);
      }
    });
  };
  walk(roots);
}

function scanFencedCodeBlocks(markdown: string): { blocks: FencedBlock[]; fenceErrors: string[] } {
  const lines = markdown.split('\n');
  const blocks: FencedBlock[] = [];
  const fenceErrors: string[] = [];

  let open: { type: string; startLine: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^```([^\s]+)?\s*$/);
    if (!m) continue;
    const blockType = (m[1] || '').trim();
    if (!open) {
      open = { type: blockType, startLine: i };
    } else {
      const startLine = open.startLine;
      const endLine = i;
      const body = lines.slice(startLine + 1, endLine).join('\n');
      blocks.push({ type: open.type, startLine, endLine, body });
      open = null;
    }
  }

  if (open) {
    fenceErrors.push(`Unclosed fenced code block starting at line ${open.startLine + 1} (type: "${open.type || 'unknown'}").`);
  }

  return { blocks, fenceErrors };
}

function tryParseJson(raw: string): { value: any; repaired: boolean } | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    return { value: JSON.parse(trimmed), repaired: false };
  } catch {
    // Best-effort repair: remove JS comments, trailing commas, quote unquoted keys.
    let s = trimmed;
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.replace(/(^|\s)\/\/.*$/gm, '');
    s = s.replace(/,\s*([}\]])/g, '$1');
    s = s.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, '$1"$2":');
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return { value: JSON.parse(s), repaired: s !== trimmed };
    } catch {
      return null;
    }
  }
}

function parseNumberFromComment(re: RegExp, line: string): number | null {
  const m = line.match(re);
  if (!m) return null;
  const n = Number.parseInt(String(m[1]), 10);
  return Number.isFinite(n) ? n : null;
}

function extractAllCommentNumbers(lines: string[], re: RegExp): Map<number, number> {
  const lineIndexToNumber = new Map<number, number>();
  lines.forEach((line, idx) => {
    const n = parseNumberFromComment(re, line);
    if (n === null) return;
    lineIndexToNumber.set(idx, n);
  });
  return lineIndexToNumber;
}

function buildLineIndexToNode(roots: NexusNode[]): Map<number, NexusNode> {
  const m = new Map<number, NexusNode>();
  traverseAllParsedNodes(roots, (n) => {
    if (typeof n.lineIndex === 'number') m.set(n.lineIndex, n);
  });
  return m;
}

function summarizeIssues(errors: ImportValidationIssue[], warnings: ImportValidationIssue[]): string {
  const lines: string[] = [];
  lines.push('NexusMap markdown import validation report');
  lines.push('');
  if (!errors.length && !warnings.length) {
    lines.push('No issues found.');
    return lines.join('\n');
  }

  if (errors.length) {
    lines.push(`Errors (${errors.length})`);
    errors.forEach((e) => lines.push(`- ${e.code}: ${e.message}`));
    lines.push('');
  }
  if (warnings.length) {
    lines.push(`Warnings (${warnings.length})`);
    warnings.forEach((w) => lines.push(`- ${w.code}: ${w.message}`));
    lines.push('');
  }

  lines.push('If an error mentions a missing/duplicate running number, fix the markdown so each running number is unique and every reference points to an existing node/block.');
  return lines.join('\n').trimEnd();
}

export function validateNexusMarkdownImport(markdown: string): ImportValidationResult {
  const errors: ImportValidationIssue[] = [];
  const warnings: ImportValidationIssue[] = [];

  const rawText = markdown ?? '';
  const text = normalizeMarkdownNewlines(rawText);
  if (!text.trim()) {
    add(errors, 'error', 'EMPTY_MARKDOWN', 'Markdown is empty.');
    return { errors, warnings, aiFriendlyReport: summarizeIssues(errors, warnings) };
  }

  if (rawText.includes('\r')) {
    add(
      warnings,
      'warning',
      'CRLF_NORMALIZED',
      'Windows/CRLF newlines were detected. NexusMap normalizes all newlines to UNIX (\\n) on import to avoid separator/metadata placement bugs.',
    );
  }

  const lines = text.split('\n');
  const separatorLineIndex = lines.findIndex((l) => l.trim() === '---');
  if (separatorLineIndex === -1) {
    add(
      warnings,
      'warning',
      'MISSING_SEPARATOR',
      "No '---' separator found. This is allowed, but recommended so metadata blocks don’t mix with node lines.",
    );
  }

  const fenced = scanFencedCodeBlocks(text);
  fenced.fenceErrors.forEach((msg) => add(errors, 'error', 'UNCLOSED_CODE_BLOCK', msg));

  // Basic indent sanity checks (best-effort, do not try to fully validate markdown)
  // Only consider the node section (before ---), but allow missing separator.
  const nodeSectionEnd = separatorLineIndex === -1 ? lines.length : separatorLineIndex;
  let inFence = false;
  for (let i = 0; i < nodeSectionEnd; i++) {
    const line = lines[i];
    const fence = line.match(/^```/);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line.trim()) continue;
    if (line.trim() === '---') continue;
    if (line.startsWith('\t')) {
      add(warnings, 'warning', 'TAB_INDENT', `Line ${i + 1} starts with a tab. Use 2 spaces per level (no tabs).`);
    }
    const leadingSpaces = (line.match(/^ */)?.[0] ?? '').length;
    if (leadingSpaces % 2 !== 0) {
      add(
        warnings,
        'warning',
        'ODD_INDENT',
        `Line ${i + 1} has ${leadingSpaces} leading spaces. Indentation should be a multiple of 2 spaces.`,
      );
    }
  }
  if (inFence) {
    // Already covered by UNCLOSED_CODE_BLOCK, but keep a user-friendly warning too.
    add(warnings, 'warning', 'FENCE_TOGGLE_MISMATCH', 'A fenced code block appears to start in the node section and does not cleanly close.');
  }

  // Parse nodes using the app’s real parser.
  let roots: NexusNode[] = [];
  try {
    roots = parseNexusMarkdown(text);
  } catch (e) {
    add(errors, 'error', 'PARSE_FAILED', 'Failed to parse nodes from markdown. Ensure it is valid UTF-8 text and uses indentation for hierarchy.');
    return { errors, warnings, aiFriendlyReport: summarizeIssues(errors, warnings) };
  }

  if (!roots.length) {
    add(errors, 'error', 'NO_NODES', 'No nodes were detected in the markdown (before the --- separator). Add at least one node line.');
  }

  const lineIndexToNode = buildLineIndexToNode(roots);
  const nodeById = new Map<string, NexusNode>();
  traverseAllParsedNodes(roots, (n) => {
    nodeById.set(n.id, n);
  });

  // System Flow recommendation: technical-diagram language should map to System Flow tab.
  const hasSystemFlowRoot = (() => {
    let found = false;
    traverseAllParsedNodes(roots, (n) => {
      const meta = n.metadata as Record<string, unknown> | undefined;
      if (meta?.systemFlow) found = true;
    });
    return found;
  })();
  const technicalDiagramSignalsRe =
    /\b(sequence\s+diagram|use\s+case\s+diagram|architecture\s+diagram|system\s+context\s+diagram|system\s+context|integration\s+diagram|component\s+diagram|service\s+diagram|technical\s+diagram)\b/i;
  if (technicalDiagramSignalsRe.test(text) && !hasSystemFlowRoot) {
    add(
      warnings,
      'warning',
      'SUGGEST_SYSTEM_FLOW',
      'Detected technical-diagram language (sequence/use case/architecture/integration/etc.) but no System Flow root was found. Create a System Flow root using `#systemflow# <!-- sfid:systemflow-N -->` and store diagram state in a fenced `systemflow-<sfid>` block.',
    );
  }

  // Comment anchors
  const rnByLine = extractAllCommentNumbers(lines, /<!--\s*rn:(\d+)\s*-->/);
  const expidByLine = extractAllCommentNumbers(lines, /<!--\s*expid:(\d+)\s*-->/);
  const expandedByLine = extractAllCommentNumbers(lines, /<!--\s*expanded:(\d+)\s*-->/);
  const hubnoteByLine = extractAllCommentNumbers(lines, /<!--\s*hubnote:(\d+)\s*-->/);

  // Uniqueness checks: running numbers should be unique per namespace.
  const ensureUnique = (name: string, byLine: Map<number, number>, code: string) => {
    const seen = new Map<number, number>(); // number -> first line
    byLine.forEach((n, lineIndex) => {
      const first = seen.get(n);
      if (first !== undefined) {
        add(
          errors,
          'error',
          code,
          `${name} number ${n} is used on multiple lines (${first + 1} and ${lineIndex + 1}). Each ${name} number must be unique.`,
        );
      } else {
        seen.set(n, lineIndex);
      }
    });
  };
  ensureUnique('rn', rnByLine, 'DUPLICATE_RN');
  ensureUnique('expid', expidByLine, 'DUPLICATE_EXPID');
  ensureUnique('expanded', expandedByLine, 'DUPLICATE_EXPANDED');
  ensureUnique('hubnote', hubnoteByLine, 'DUPLICATE_HUBNOTE');

  // If expanded:N exists without expid:N, that’s almost always a mistake.
  expandedByLine.forEach((n, lineIndex) => {
    const expid = expidByLine.get(lineIndex);
    if (expid === undefined) {
      add(
        warnings,
        'warning',
        'EXPANDED_MISSING_EXPID',
        `Line ${lineIndex + 1} has <!-- expanded:${n} --> but no <!-- expid:${n} -->. Add expid so expanded data can remain stable.`,
      );
    }
  });

  // If any expanded-ish features exist, ensure expanded-states block parses and has the needed entries.
  const blockByType = new Map<string, FencedBlock[]>();
  fenced.blocks.forEach((b) => {
    const key = b.type || 'unknown';
    if (!blockByType.has(key)) blockByType.set(key, []);
    blockByType.get(key)!.push(b);
  });

  const getSingleJsonBlock = (type: string): { block: FencedBlock; json: any; repaired: boolean } | null => {
    const blocks = blockByType.get(type) || [];
    if (!blocks.length) return null;
    if (blocks.length > 1) {
      add(errors, 'error', 'DUPLICATE_BLOCK', `Multiple \`\`\`${type}\`\`\` blocks found. Keep only one.`);
      return null;
    }
    const parsed = tryParseJson(blocks[0].body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_JSON', `\`\`\`${type}\`\`\` block is not valid JSON.`);
      return null;
    }
    if (parsed.repaired) add(warnings, 'warning', 'JSON_REPAIRED', `\`\`\`${type}\`\`\` block is not strict JSON; it was auto-repaired for validation.`);
    return { block: blocks[0], json: parsed.value, repaired: parsed.repaired };
  };

  // Expanded states validation
  const hasAnyExpandedAnchors = expidByLine.size > 0 || expandedByLine.size > 0;
  const expandedStates = getSingleJsonBlock('expanded-states');
  if (hasAnyExpandedAnchors) {
    if (!expandedStates) {
      add(
        errors,
        'error',
        'MISSING_EXPANDED_STATES_BLOCK',
        'Found expanded markers (expid/expanded) but no ```expanded-states``` JSON block.',
      );
    }
  }
  const expandedEntriesByRn = new Map<number, any>();
  if (expandedStates) {
    const parsed = expandedStates.json;
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
    entries.forEach((e: any) => {
      const rn = typeof e?.runningNumber === 'number' ? e.runningNumber : null;
      if (!rn || !Number.isFinite(rn)) {
        add(warnings, 'warning', 'BAD_EXPANDED_ENTRY', 'An expanded-states entry is missing a valid runningNumber.');
        return;
      }
      if (expandedEntriesByRn.has(rn)) {
        add(errors, 'error', 'DUPLICATE_EXPANDED_ENTRY_RN', `expanded-states contains duplicate runningNumber ${rn}.`);
        return;
      }
      expandedEntriesByRn.set(rn, e);

      const lineIndex = typeof e?.lineIndex === 'number' ? e.lineIndex : null;
      if (lineIndex === null || !Number.isFinite(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
        add(errors, 'error', 'EXPANDED_ENTRY_BAD_LINE', `expanded-states entry rn=${rn} has an invalid lineIndex (${String(e?.lineIndex)}).`);
        return;
      }

      const node = lineIndexToNode.get(lineIndex);
      if (!node) {
        add(
          warnings,
          'warning',
          'EXPANDED_ENTRY_NO_NODE',
          `expanded-states entry rn=${rn} points to line ${lineIndex + 1}, but no node was parsed on that line.`,
        );
        return;
      }
      if (typeof e?.content === 'string' && e.content.trim() && e.content.trim() !== node.content.trim()) {
        add(
          warnings,
          'warning',
          'EXPANDED_ENTRY_CONTENT_MISMATCH',
          `expanded-states entry rn=${rn} content does not match the node at line ${lineIndex + 1}. The app may drop or remap this entry.`,
        );
      }
    });
  }

  // Ensure every expid references an expanded-states entry (if block exists)
  if (expandedStates) {
    expidByLine.forEach((rn, lineIndex) => {
      if (!expandedEntriesByRn.has(rn)) {
        add(
          warnings,
          'warning',
          'EXPID_MISSING_ENTRY',
          `Line ${lineIndex + 1} has <!-- expid:${rn} --> but expanded-states has no entry for runningNumber ${rn}.`,
        );
      }
    });
  }

  // Expanded-grid-* blocks must correspond to an expid or a legacy node id
  const expandedGridBlocks: Array<{ key: string; block: FencedBlock }> = [];
  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^expanded-grid-(.+)$/);
    if (!m) return;
    expandedGridBlocks.push({ key: m[1], block: b });
  });
  expandedGridBlocks.forEach(({ key, block }) => {
    const parsed = tryParseJson(block.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_EXPANDED_GRID_JSON', `\`\`\`${block.type}\`\`\` is not valid JSON.`);
      return;
    }
    if (!Array.isArray(parsed.value)) {
      add(errors, 'error', 'EXPANDED_GRID_NOT_ARRAY', `\`\`\`${block.type}\`\`\` must be a JSON array of grid nodes.`);
      return;
    }
    // Validate dataObjectAttributeIds linkage inside grid nodes.
    (parsed.value as any[]).forEach((n, idx) => {
      if (!n || typeof n !== 'object') return;
      const doId = typeof (n as any).dataObjectId === 'string' ? String((n as any).dataObjectId).trim() : '';
      const attrIds = Array.isArray((n as any).dataObjectAttributeIds)
        ? ((n as any).dataObjectAttributeIds as unknown[])
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter(Boolean)
        : [];
      if (attrIds.length && !doId) {
        add(errors, 'error', 'DOATTRS_WITHOUT_DO', `\`\`\`${block.type}\`\`\` grid node #${idx + 1} includes dataObjectAttributeIds but has no dataObjectId.`);
        return;
      }
      if (attrIds.length && doId && dataObjects) {
        const allowed = dataObjectAttrIdsByObjectId.get(doId);
        if (!allowed) return;
        attrIds.forEach((id) => {
          if (!allowed.has(id)) {
            add(
              warnings,
              'warning',
              'UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID',
              `\`\`\`${block.type}\`\`\` grid node #${idx + 1} references unknown data object attribute "${id}" for ${doId}.`,
            );
          }
        });
      }
    });
    // If key is numeric, we expect it to be an expanded running number.
    const maybeRn = Number.parseInt(key, 10);
    if (Number.isFinite(maybeRn) && String(maybeRn) === key) {
      const hasAnchor = Array.from(expidByLine.values()).includes(maybeRn) || expandedEntriesByRn.has(maybeRn);
      if (!hasAnchor) {
        add(
          warnings,
          'warning',
          'ORPHAN_EXPANDED_GRID_BLOCK',
          `\`\`\`${block.type}\`\`\` exists but no node has <!-- expid:${maybeRn} --> and expanded-states has no entry for ${maybeRn}.`,
        );
      }
    } else {
      // legacy node-id based block: expanded-grid-node-123 etc will be handled elsewhere; here we just warn.
      add(
        warnings,
        'warning',
        'LEGACY_EXPANDED_GRID_KEY',
        `\`\`\`${block.type}\`\`\` uses a non-numeric key ("${key}"). Prefer numeric running numbers via <!-- expid:N -->.`,
      );
    }
  });

  // Expanded-metadata-* blocks
  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^expanded-metadata-(\d+)$/);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    const parsed = tryParseJson(b.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_EXPANDED_METADATA_JSON', `\`\`\`${b.type}\`\`\` is not valid JSON.`);
      return;
    }
    if (!parsed.value || typeof parsed.value !== 'object') {
      add(errors, 'error', 'EXPANDED_METADATA_NOT_OBJECT', `\`\`\`${b.type}\`\`\` must be a JSON object.`);
    }
    const meta = parsed.value as any;
    const metaDoId = typeof meta?.dataObjectId === 'string' ? meta.dataObjectId.trim() : '';
    const metaAttrIds = Array.isArray(meta?.dataObjectAttributeIds)
      ? (meta.dataObjectAttributeIds as unknown[]).map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
      : [];
    if (metaAttrIds.length && !metaDoId) {
      add(errors, 'error', 'DOATTRS_WITHOUT_DO', `\`\`\`${b.type}\`\`\` includes dataObjectAttributeIds but has no dataObjectId.`);
    }
    if (metaAttrIds.length && metaDoId && dataObjects) {
      const allowed = dataObjectAttrIdsByObjectId.get(metaDoId);
      if (allowed) {
        metaAttrIds.forEach((id) => {
          if (!allowed.has(id)) {
            add(
              warnings,
              'warning',
              'UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID',
              `\`\`\`${b.type}\`\`\` references unknown data object attribute "${id}" for ${metaDoId}.`,
            );
          }
        });
      }
    }
    const hasAnchor = Array.from(expidByLine.values()).includes(rn) || expandedEntriesByRn.has(rn);
    if (!hasAnchor) {
      add(
        warnings,
        'warning',
        'ORPHAN_EXPANDED_METADATA_BLOCK',
        `\`\`\`${b.type}\`\`\` exists but no node has <!-- expid:${rn} --> and expanded-states has no entry for ${rn}.`,
      );
    }
  });

  // Tag store validation + tag references
  const tagStore = getSingleJsonBlock('tag-store');
  const tagIdsInStore = new Set<string>();
  const tagIdToGroupId = new Map<string, string>();
  const groupIdsInStore = new Set<string>();
  const tagIdsByGroupId = new Map<string, Set<string>>();
  let warnedMissingTagStore = false;
  if (tagStore) {
    const groups = Array.isArray(tagStore.json?.groups) ? tagStore.json.groups : [];
    const tags = Array.isArray(tagStore.json?.tags) ? tagStore.json.tags : [];
    const groupIds = new Set<string>();
    groups.forEach((g: any) => {
      if (typeof g?.id !== 'string') add(errors, 'error', 'BAD_TAG_GROUP', 'A tag-store group is missing a string id.');
      if (typeof g?.name !== 'string') add(errors, 'error', 'BAD_TAG_GROUP', 'A tag-store group is missing a string name.');
      if (typeof g?.id === 'string') {
        if (groupIds.has(g.id)) add(errors, 'error', 'DUPLICATE_TAG_GROUP_ID', `tag-store contains duplicate group id "${g.id}".`);
        groupIds.add(g.id);
        groupIdsInStore.add(g.id);
      }
    });
    const tagIdSeen = new Set<string>();
    tags.forEach((t: any) => {
      if (typeof t?.id !== 'string' || typeof t?.groupId !== 'string' || typeof t?.name !== 'string') {
        add(errors, 'error', 'BAD_TAG', 'A tag-store tag is missing id/groupId/name.');
        return;
      }
      if (tagIdSeen.has(t.id)) add(errors, 'error', 'DUPLICATE_TAG_ID', `tag-store contains duplicate tag id "${t.id}".`);
      tagIdSeen.add(t.id);
      tagIdsInStore.add(t.id);
      tagIdToGroupId.set(t.id, t.groupId);
      if (!tagIdsByGroupId.has(t.groupId)) tagIdsByGroupId.set(t.groupId, new Set<string>());
      tagIdsByGroupId.get(t.groupId)!.add(t.id);
      if (!groupIds.has(t.groupId)) {
        add(warnings, 'warning', 'UNKNOWN_TAG_GROUP', `tag "${t.id}" references missing group "${t.groupId}".`);
      }
    });
  }

  // Data objects + do: references
  const dataObjects = getSingleJsonBlock('data-objects');
  const dataObjectIds = new Set<string>();
  const dataObjectAttrIdsByObjectId = new Map<string, Set<string>>();
  let warnedMissingDataObjects = false;
  if (dataObjects) {
    const objs = Array.isArray(dataObjects.json?.objects) ? dataObjects.json.objects : [];
    objs.forEach((o: any) => {
      if (typeof o?.id === 'string') {
        dataObjectIds.add(o.id);
        const attrs = loadDataObjectAttributes(o?.data);
        const set = new Set<string>(attrs.map((a) => a.id));
        set.add(OBJECT_NAME_ATTR_ID);
        dataObjectAttrIdsByObjectId.set(o.id, set);
      }
    });
  }

  // Validate per-node tag and do refs (best-effort: scan raw line content for comments)
  const tagsRe = /<!--\s*tags:([^>]*)\s*-->/;
  const doRe = /<!--\s*do:([^>]+)\s*-->/;
  const doAttrsRe = /<!--\s*doattrs:([^>]*)\s*-->/;
  const fidRe = /<!--\s*fid:([^>]+)\s*-->/;
  const expidRe = /<!--\s*expid:(\d+)\s*-->/;

  // Actor prefix ban (tree region only; machine-checkable actors must live in tags/swimlanes instead).
  // Fail if any node title starts with "System:" / "Staff:" / "Applicant:" / "Partner:" (case-insensitive).
  const actorPrefixRe = /^(system|staff|applicant|partner)\s*:\s*/i;

  // Re-scan tree region with an explicit inFence toggle for prefix/tag enforcement checks.
  let inTreeFence = false;
  for (let idx = 0; idx < nodeSectionEnd; idx++) {
    const line = lines[idx] || '';
    if (line.match(/^```/)) {
      inTreeFence = !inTreeFence;
      continue;
    }
    if (inTreeFence) continue;
    if (!line.trim()) continue;

    // Ban actor-in-title prefixes.
    const title = nodeTitleForPrefixChecks(line);
    if (actorPrefixRe.test(title)) {
      add(
        errors,
        'error',
        'ACTOR_PREFIX_IN_TITLE',
        `Line ${idx + 1} encodes an actor in the node title ("System:/Staff:/Applicant:/Partner:"). Use actor tags (tg-actors) and Flowtab swimlane lanes instead.`,
      );
    }

    // Tag reference validation (strict when tag-store exists).
    const tagMatch = line.match(tagsRe);
    if (tagMatch) {
      const ids = tagMatch[1]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (tagStore && ids.length) {
        ids.forEach((id) => {
          if (!tagIdsInStore.has(id)) {
            add(errors, 'error', 'UNKNOWN_TAG_ID', `Line ${idx + 1} references unknown tag id "${id}" (not present in tag-store).`);
          }
        });
      } else if (!tagStore && ids.length) {
        if (!warnedMissingTagStore) {
          warnedMissingTagStore = true;
          add(errors, 'error', 'MISSING_TAG_STORE', `This markdown uses <!-- tags:... --> but has no \`\`\`tag-store\`\`\` block.`);
        }
      }
    }

    const doMatch = line.match(doRe);
    if (doMatch) {
      const doId = (doMatch[1] || '').trim();
      if (doId) {
        if (dataObjects) {
          if (!dataObjectIds.has(doId)) {
            add(warnings, 'warning', 'UNKNOWN_DATA_OBJECT_ID', `Line ${idx + 1} references missing data object "${doId}" (not present in data-objects).`);
          }
        } else {
          if (!warnedMissingDataObjects) {
            warnedMissingDataObjects = true;
            add(
              warnings,
              'warning',
              'MISSING_DATA_OBJECTS_BLOCK',
              `This markdown uses <!-- do:... --> links but has no \`\`\`data-objects\`\`\` block. Either add a data-objects block or remove do: links.`,
            );
          }
        }
      }
    }

    const doAttrsMatch = line.match(doAttrsRe);
    if (doAttrsMatch) {
      const ids = (doAttrsMatch[1] || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (ids.length) {
        const doId = doMatch ? (doMatch[1] || '').trim() : '';
        if (!doId) {
          add(errors, 'error', 'DOATTRS_WITHOUT_DO', `Line ${idx + 1} uses <!-- doattrs:... --> but has no <!-- do:... --> on the same line.`);
        } else if (!dataObjects) {
          if (!warnedMissingDataObjects) {
            warnedMissingDataObjects = true;
            add(
              warnings,
              'warning',
              'MISSING_DATA_OBJECTS_BLOCK',
              `This markdown uses <!-- do:... --> / <!-- doattrs:... --> links but has no \`\`\`data-objects\`\`\` block.`,
            );
          }
        } else {
          const allowed = dataObjectAttrIdsByObjectId.get(doId);
          if (allowed) {
            ids.forEach((id) => {
              if (!allowed.has(id)) {
                add(
                  warnings,
                  'warning',
                  'UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID',
                  `Line ${idx + 1} references unknown data object attribute "${id}" for ${doId}.`,
                );
              }
            });
          }
        }
      }
    }

    const fidMatch = line.match(fidRe);
    if (fidMatch) {
      const fid = (fidMatch[1] || '').trim();
      if (!fid) add(warnings, 'warning', 'EMPTY_FID', `Line ${idx + 1} has an empty <!-- fid:... --> comment.`);
    }

    // Required UI surface tags for expid screens.
    if (expidRe.test(line)) {
      const tagMatch = line.match(tagsRe);
      const ids = tagMatch
        ? tagMatch[1]
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
      const uiSurfaceTags = ids.filter((id) => (tagIdToGroupId.get(id) || '') === REQUIRED_TAG_GROUPS.uiSurface);
      if (!uiSurfaceTags.length) {
        add(
          errors,
          'error',
          'MISSING_UI_SURFACE_TAG',
          `Line ${idx + 1} has <!-- expid:... --> but no ui-surface tag (group "${REQUIRED_TAG_GROUPS.uiSurface}"). Add exactly one of: ui-surface-public/ui-surface-portal/ui-surface-admin/ui-surface-partner (or your own ui surface tags in that group).`,
        );
      } else if (uiSurfaceTags.length > 1) {
        add(
          warnings,
          'warning',
          'MULTIPLE_UI_SURFACE_TAGS',
          `Line ${idx + 1} has multiple ui-surface tags (${uiSurfaceTags.join(', ')}). Prefer exactly one UI surface tag per screen.`,
        );
      }
    }

    // Actor tag enforcement for #flow# nodes.
    if (line.includes('#flow#')) {
      const tagMatch = line.match(tagsRe);
      const ids = tagMatch
        ? tagMatch[1]
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
      // Actor tags are any tags whose groupId is tg-actors (preferred) or ids that look like actor-* (legacy/fallback).
      const actorTags = ids.filter((id) => (tagIdToGroupId.get(id) || '') === REQUIRED_TAG_GROUPS.actors || /^actor-/.test(id));
      if (!tagStore) {
        add(
          errors,
          'error',
          'MISSING_TAG_STORE',
          `Line ${idx + 1} is a #flow# node but no tag-store exists. Actor tags are mandatory for #flow# nodes.`,
        );
      } else if (!groupIdsInStore.has(REQUIRED_TAG_GROUPS.actors)) {
        add(errors, 'error', 'MISSING_REQUIRED_TAG_GROUP', `tag-store is missing required group "${REQUIRED_TAG_GROUPS.actors}".`);
      } else if (!actorTags.length) {
        add(
          errors,
          'error',
          'MISSING_ACTOR_TAG',
          `Line ${idx + 1} is a #flow# node but has no actor tag. Add exactly one actor tag from group "${REQUIRED_TAG_GROUPS.actors}" (e.g. actor-applicant/actor-staff/actor-system/actor-partner).`,
        );
      } else if (actorTags.length > 1) {
        add(
          errors,
          'error',
          'MULTIPLE_ACTOR_TAGS',
          `Line ${idx + 1} is a #flow# node but has multiple actor tags (${actorTags.join(', ')}). Keep exactly one.`,
        );
      } else {
        const a = actorTags[0];
        // If it’s an actor-* id, it MUST exist in tag-store (enforced above via UNKNOWN_TAG_ID).
        if (tagIdToGroupId.get(a) && tagIdToGroupId.get(a) !== REQUIRED_TAG_GROUPS.actors) {
          add(
            errors,
            'error',
            'ACTOR_TAG_WRONG_GROUP',
            `Line ${idx + 1} uses actor tag "${a}" but it is not in group "${REQUIRED_TAG_GROUPS.actors}" in tag-store.`,
          );
        }
      }
    }
  }

  // Required tag groups gate (only meaningful if tag-store exists).
  if (tagStore) {
    if (!groupIdsInStore.has(REQUIRED_TAG_GROUPS.actors)) {
      add(errors, 'error', 'MISSING_REQUIRED_TAG_GROUP', `tag-store must include required group "${REQUIRED_TAG_GROUPS.actors}".`);
    }
    // If there are any expid screens, require ui surface group.
    if (expidByLine.size > 0 && !groupIdsInStore.has(REQUIRED_TAG_GROUPS.uiSurface)) {
      add(errors, 'error', 'MISSING_REQUIRED_TAG_GROUP', `tag-store must include required group "${REQUIRED_TAG_GROUPS.uiSurface}" because the markdown uses <!-- expid:... -->.`);
    }
  }

  // Flowtab swimlane blocks must correspond to a fid on some node line.
  const fidSet = new Set<string>();
  traverseAllParsedNodes(roots, (n) => {
    const meta = n.metadata as Record<string, unknown> | undefined;
    const fid = typeof meta?.fid === 'string' ? meta.fid : '';
    if (fid) fidSet.add(fid);
  });
  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^flowtab-swimlane-(.+)$/);
    if (!m) return;
    const fid = m[1];
    const parsed = tryParseJson(b.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_FLOWTAB_SWIMLANE_JSON', `\`\`\`${b.type}\`\`\` is not valid JSON.`);
      return;
    }
    if (!fidSet.has(fid)) {
      add(warnings, 'warning', 'ORPHAN_FLOWTAB_SWIMLANE', `\`\`\`${b.type}\`\`\` exists but no node has <!-- fid:${fid} -->.`);
    }

    // Actor-vs-lane consistency (best-effort): if a lane label clearly implies an actor,
    // warn if placed nodes’ actor tags do not match.
    const swim = parsed.value;
    const lanes = Array.isArray(swim?.lanes) ? swim.lanes : [];
    const placement = swim?.placement && typeof swim.placement === 'object' ? swim.placement : null;
    const laneLabelById = new Map<string, string>();
    lanes.forEach((l: any) => {
      const id = typeof l?.id === 'string' ? l.id : '';
      const label = typeof l?.label === 'string' ? l.label : '';
      if (id && label) laneLabelById.set(id, label);
    });
    const expectedActorForLaneLabel = (label: string): string | null => {
      const s = (label || '').toLowerCase();
      if (!s) return null;
      if (s.includes('system')) return 'actor-system';
      if (/(staff|admin|reviewer|operator|agent)/i.test(label)) return 'actor-staff';
      if (s.includes('partner')) return 'actor-partner';
      if (/(applicant|customer|user|visitor|student)/i.test(label)) return 'actor-applicant';
      return null;
    };
    if (placement) {
      Object.entries(placement as Record<string, any>).forEach(([nodeId, p]) => {
        const laneId = typeof (p as any)?.laneId === 'string' ? (p as any).laneId : '';
        if (!laneId) return;
        const laneLabel = laneLabelById.get(laneId) || '';
        const expected = expectedActorForLaneLabel(laneLabel);
        if (!expected) return; // only enforce when label is clearly mappable
        const m = nodeId.match(/^node-(\d+)$/);
        if (!m) return;
        const lineIndex = Number.parseInt(m[1], 10);
        if (!Number.isFinite(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return;
        const line = lines[lineIndex] || '';
        const tagMatch = line.match(tagsRe);
        const ids = tagMatch
          ? tagMatch[1]
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
          : [];
        const actorTags = ids.filter((id) => (tagIdToGroupId.get(id) || '') === REQUIRED_TAG_GROUPS.actors || /^actor-/.test(id));
        if (!actorTags.length) {
          add(
            warnings,
            'warning',
            'SWIMLANE_NODE_MISSING_ACTOR_TAG',
            `Flowtab swimlane places ${nodeId} in lane "${laneLabel}" but that node line has no actor tag. Add exactly one actor tag (tg-actors) to enable machine-checkable swimlane semantics.`,
          );
          return;
        }
        if (actorTags.length === 1 && actorTags[0] !== expected) {
          add(
            warnings,
            'warning',
            'SWIMLANE_ACTOR_MISMATCH',
            `Flowtab swimlane places ${nodeId} in lane "${laneLabel}" (implies ${expected}) but the node line has actor tag "${actorTags[0]}".`,
          );
        }
      });
    }
  });

  // Cross-timeframe heuristic (warn): non-swimlane #flow# roots should be session-scoped.
  // If a #flow# process contains strong signals of multi-timeframe/async/handoff, suggest splitting via Flowtab/lifecycle hubs.
  const timeframeSignalsRe =
    /\b(await|waiting|wait|queued|queue|2-4\s*weeks|weeks?|months?|within\s+one\s+month|mail|postal|partner\s+assessment|assessment|ica)\b/i;
  const nodeById2 = nodeById; // reuse
  const inFlowtabSubtreeByNodeId = new Map<string, boolean>();
  const isInFlowtabSubtree = (n: NexusNode): boolean => {
    const cached = inFlowtabSubtreeByNodeId.get(n.id);
    if (cached !== undefined) return cached;
    let cur: NexusNode | undefined = n;
    while (cur) {
      const meta = cur.metadata as Record<string, unknown> | undefined;
      if (meta?.flowTab) {
        inFlowtabSubtreeByNodeId.set(n.id, true);
        return true;
      }
      const pid = cur.parentId;
      if (!pid) break;
      cur = nodeById2.get(pid);
    }
    inFlowtabSubtreeByNodeId.set(n.id, false);
    return false;
  };
  const allFlowNodes: NexusNode[] = [];
  traverseAllParsedNodes(roots, (n) => {
    if (n.isFlowNode) allFlowNodes.push(n);
  });
  const flowRoots: NexusNode[] = allFlowNodes.filter((n) => {
    if (isInFlowtabSubtree(n)) return false;
    // Root: no #flow# ancestor.
    let cur: NexusNode | undefined = n;
    while (cur) {
      const pid = cur.parentId;
      if (!pid) return true;
      const parent = nodeById2.get(pid);
      if (!parent) return true;
      if (parent.isFlowNode) return false;
      cur = parent;
    }
    return true;
  });
  flowRoots.forEach((root) => {
    const hits: Array<{ lineIndex: number; content: string }> = [];
    traverseAllParsedNodes([root], (n) => {
      if (!n.isFlowNode) return;
      const c = String(n.content || '');
      if (timeframeSignalsRe.test(c)) {
        hits.push({ lineIndex: n.lineIndex ?? -1, content: c });
      }
    });
    if (hits.length) {
      const sample = hits
        .slice(0, 3)
        .map((h) => (h.lineIndex >= 0 ? `line ${h.lineIndex + 1}: "${h.content}"` : `"${h.content}"`))
        .join('; ');
      add(
        warnings,
        'warning',
        'CROSS_TIMEFRAME_SIGNAL',
        `Non-swimlane #flow# process "${root.content}" contains potential cross-timeframe/async signals (${sample}). Consider splitting into session-scoped flows and linking via Flowtab handoffs and/or lifecycle hubs.`,
      );
    }
  });

  // Flow node state (flow-nodes + flow-node-N blocks)
  const flowNodesBlock = getSingleJsonBlock('flow-nodes');
  const flowEntryByRn = new Map<number, any>();
  if (flowNodesBlock) {
    const entries = Array.isArray(flowNodesBlock.json?.entries) ? flowNodesBlock.json.entries : [];
    entries.forEach((e: any) => {
      const rn = typeof e?.runningNumber === 'number' ? e.runningNumber : null;
      if (!rn || !Number.isFinite(rn)) {
        add(warnings, 'warning', 'BAD_FLOW_NODE_ENTRY', 'A flow-nodes entry is missing a valid runningNumber.');
        return;
      }
      if (flowEntryByRn.has(rn)) {
        add(errors, 'error', 'DUPLICATE_FLOW_NODE_RN', `flow-nodes contains duplicate runningNumber ${rn}.`);
        return;
      }
      flowEntryByRn.set(rn, e);

      const lineIndex = typeof e?.lineIndex === 'number' ? e.lineIndex : null;
      if (lineIndex === null || lineIndex < 0 || lineIndex >= lines.length) {
        add(errors, 'error', 'FLOW_NODE_BAD_LINE', `flow-nodes entry rn=${rn} has invalid lineIndex (${String(e?.lineIndex)}).`);
        return;
      }
      const node = lineIndexToNode.get(lineIndex);
      if (!node) {
        add(warnings, 'warning', 'FLOW_NODE_ENTRY_NO_NODE', `flow-nodes entry rn=${rn} points to line ${lineIndex + 1}, but no node was parsed there.`);
        return;
      }
      if (!node.isFlowNode) {
        add(
          warnings,
          'warning',
          'FLOW_NODE_ENTRY_NOT_FLOW',
          `flow-nodes entry rn=${rn} points to line ${lineIndex + 1}, but that node is not marked with #flow#.`,
        );
      }
    });
  }

  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^flow-node-(\d+)$/);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    const parsed = tryParseJson(b.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_FLOW_NODE_JSON', `\`\`\`${b.type}\`\`\` is not valid JSON.`);
      return;
    }
    if (!flowEntryByRn.has(rn)) {
      add(
        warnings,
        'warning',
        'ORPHAN_FLOW_NODE_BLOCK',
        `\`\`\`${b.type}\`\`\` exists but flow-nodes has no entry for runningNumber ${rn}.`,
      );
    }
  });

  // Process node type blocks:
  // - keyed by runningNumber N (from `flow-nodes`)
  // - MUST include "type"
  // - MAY include "nodeId" (legacy / informational only; node ids are line-index based and unstable)
  const processNodeTypeByRn = new Map<number, { nodeId?: string; type: string; blockType: string }>();
  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^process-node-type-(\d+)$/);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    const parsed = tryParseJson(b.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_PROCESS_NODE_TYPE_JSON', `\`\`\`${b.type}\`\`\` is not valid JSON.`);
      return;
    }
    const type = typeof parsed.value?.type === 'string' ? parsed.value.type : '';
    const nodeId = typeof parsed.value?.nodeId === 'string' ? parsed.value.nodeId : '';
    if (!type) {
      add(errors, 'error', 'BAD_PROCESS_NODE_TYPE', `\`\`\`${b.type}\`\`\` must contain JSON like { "type": "validation|branch|goto|end|step|time|loop|action" } (nodeId is optional).`);
      return;
    }
    if (nodeId) {
      // Node ids are line-index based: validate presence best-effort (warning only).
      const foundNode = nodeById.get(nodeId);
      if (!foundNode) {
        add(
          warnings,
          'warning',
          'PROCESS_NODE_TYPE_NODE_ID_MISSING',
          `\`\`\`${b.type}\`\`\` includes nodeId "${nodeId}", but that node id does not exist in this markdown (ids are line-index based). This field is optional/legacy.`,
        );
      } else if (!foundNode.isFlowNode) {
        add(
          warnings,
          'warning',
          'PROCESS_TYPE_NON_FLOW_NODE',
          `\`\`\`${b.type}\`\`\` includes nodeId "${nodeId}", but that node is not marked #flow#. This field is optional/legacy.`,
        );
      }
    }
    processNodeTypeByRn.set(rn, { ...(nodeId ? { nodeId } : {}), type, blockType: b.type });
    if (!flowNodesBlock) {
      add(
        errors,
        'error',
        'MISSING_FLOW_NODES_BLOCK',
        `Found \`\`\`${b.type}\`\`\`, but no \`\`\`flow-nodes\`\`\` block exists. process-node-type blocks are keyed by the flow-nodes runningNumber; without flow-nodes, types will not render.`,
      );
      return;
    }
    if (!flowEntryByRn.has(rn)) {
      add(
        errors,
        'error',
        'PROCESS_TYPE_WITHOUT_FLOW_ENTRY',
        `\`\`\`${b.type}\`\`\` uses runningNumber ${rn}, but flow-nodes has no entry for ${rn}. Without this linkage, the UI will fall back to default type ("step").`,
      );
      return;
    }
    const entry = flowEntryByRn.get(rn);
    const li = typeof entry?.lineIndex === 'number' ? entry.lineIndex : null;
    if (li !== null && nodeId) {
      const nodeAtLine = lineIndexToNode.get(li);
      if (nodeAtLine && nodeAtLine.id !== nodeId) {
        add(
          warnings,
          'warning',
          'PROCESS_TYPE_FLOW_NODE_MISMATCH',
          `\`\`\`${b.type}\`\`\` includes nodeId "${nodeId}", but flow-nodes entry rn=${rn} points to line ${li + 1} (${nodeAtLine.id}). nodeId is optional/legacy; prefer fixing flow-nodes linkage.`,
        );
      }
    }
  });

  // Process loop target blocks:
  // - keyed by runningNumber N (same runningNumber as process-node-type-N)
  // - body JSON: { "targetId": "node-<lineIndex>" }
  const processLoopTargetByRn = new Map<number, { targetId: string; blockType: string }>();
  fenced.blocks.forEach((b) => {
    const m = b.type.match(/^process-loop-(\d+)$/);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    const parsed = tryParseJson(b.body);
    if (!parsed) {
      add(errors, 'error', 'INVALID_PROCESS_LOOP_JSON', `\`\`\`${b.type}\`\`\` is not valid JSON.`);
      return;
    }
    const targetId = typeof parsed.value?.targetId === 'string' ? parsed.value.targetId : '';
    if (!targetId) {
      add(errors, 'error', 'BAD_PROCESS_LOOP', `\`\`\`${b.type}\`\`\` must contain JSON like { "targetId": "node-<lineIndex>" }.`);
      return;
    }
    processLoopTargetByRn.set(rn, { targetId, blockType: b.type });

    // If we can, validate targetId points to an existing node.
    const targetNode = nodeById.get(targetId);
    if (!targetNode) {
      add(
        errors,
        'error',
        'PROCESS_LOOP_TARGET_MISSING_NODE',
        `\`\`\`${b.type}\`\`\` targetId "${targetId}" does not exist in this markdown.`,
      );
    } else if (!targetNode.isFlowNode) {
      add(
        warnings,
        'warning',
        'PROCESS_LOOP_TARGET_NOT_FLOW',
        `\`\`\`${b.type}\`\`\` targetId "${targetId}" points to a node that is not marked #flow#.`,
      );
    }
  });

  // Cross-check loop blocks against process-node-type and tree structure (best-effort).
  if (processLoopTargetByRn.size) {
    processLoopTargetByRn.forEach(({ targetId, blockType }, rn) => {
      const t = processNodeTypeByRn.get(rn);
      if (!t) {
        add(
          warnings,
          'warning',
          'ORPHAN_PROCESS_LOOP',
          `\`\`\`${blockType}\`\`\` exists but no \`\`\`process-node-type-${rn}\`\`\` block exists. Loop targets are only meaningful when the node type is "loop".`,
        );
        return;
      }
      if (t.type !== 'loop') {
        add(
          warnings,
          'warning',
          'PROCESS_LOOP_TYPE_MISMATCH',
          `\`\`\`${blockType}\`\`\` exists but \`\`\`${t.blockType}\`\`\` sets type "${t.type}". Expected type "loop".`,
        );
      }

      // Validate target is a descendant of the loop node using flow-nodes linkage if possible.
      const entry = flowEntryByRn.get(rn);
      const li = typeof entry?.lineIndex === 'number' ? entry.lineIndex : null;
      if (li === null) return;
      const loopNode = lineIndexToNode.get(li);
      const targetNode = nodeById.get(targetId);
      if (!loopNode || !targetNode) return;

      // Walk up from target; if we hit loopNode id, it's a descendant.
      let cur: NexusNode | undefined = targetNode;
      let isDesc = false;
      while (cur?.parentId) {
        if (cur.parentId === loopNode.id) {
          isDesc = true;
          break;
        }
        cur = nodeById.get(cur.parentId);
      }
      if (!isDesc) {
        add(
          warnings,
          'warning',
          'PROCESS_LOOP_TARGET_NOT_DESCENDANT',
          `\`\`\`${blockType}\`\`\` targetId "${targetId}" is not a descendant of the loop node resolved via flow-nodes rn=${rn}.`,
        );
      }
    });
  }

  // Dimension descriptions: validate that desc comments + entries are internally consistent.
  const dimDesc = getSingleJsonBlock('dimension-descriptions');
  const descByRn = new Map<number, any>();
  if (dimDesc) {
    const entries = Array.isArray(dimDesc.json?.entries) ? dimDesc.json.entries : [];
    entries.forEach((e: any) => {
      const rn = typeof e?.runningNumber === 'number' ? e.runningNumber : null;
      if (!rn || !Number.isFinite(rn)) return;
      if (descByRn.has(rn)) add(errors, 'error', 'DUPLICATE_DIM_DESC_RN', `dimension-descriptions contains duplicate runningNumber ${rn}.`);
      descByRn.set(rn, e);
      const li = typeof e?.lineIndex === 'number' ? e.lineIndex : null;
      if (li === null || li < 0 || li >= lines.length) {
        add(errors, 'error', 'DIM_DESC_BAD_LINE', `dimension-descriptions entry rn=${rn} has invalid lineIndex (${String(e?.lineIndex)}).`);
      }
    });
  }

  // desc comments on lines should reference existing entries if block exists
  lines.forEach((line, idx) => {
    const m = line.match(/<!--\s*desc:([^>]*)\s*-->/);
    if (!m) return;
    if (!dimDesc) {
      add(warnings, 'warning', 'MISSING_DIM_DESC_BLOCK', `Line ${idx + 1} has <!-- desc:... --> but no \`\`\`dimension-descriptions\`\`\` block exists.`);
      return;
    }
    const parts = (m[1] || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    parts.forEach((p) => {
      const seg = p.split(':');
      const rnStr = seg[2];
      const rn = rnStr ? Number.parseInt(rnStr, 10) : NaN;
      if (!Number.isFinite(rn)) return;
      if (!descByRn.has(rn)) {
        add(
          warnings,
          'warning',
          'DESC_MISSING_ENTRY',
          `Line ${idx + 1} references description runningNumber ${rn} in <!-- desc:... -->, but dimension-descriptions has no such entry.`,
        );
      }
    });
  });

  // Conditional hub notes
  const hubNotes = getSingleJsonBlock('conditional-hub-notes');
  const hubNoteEntryByRn = new Map<number, any>();
  if (hubNotes) {
    const entries = Array.isArray(hubNotes.json?.entries) ? hubNotes.json.entries : [];
    entries.forEach((e: any) => {
      const rn = typeof e?.runningNumber === 'number' ? e.runningNumber : null;
      if (!rn || !Number.isFinite(rn)) return;
      if (hubNoteEntryByRn.has(rn)) add(errors, 'error', 'DUPLICATE_HUB_NOTE_RN', `conditional-hub-notes contains duplicate runningNumber ${rn}.`);
      hubNoteEntryByRn.set(rn, e);
      const li = typeof e?.lineIndex === 'number' ? e.lineIndex : null;
      if (li === null || li < 0 || li >= lines.length) {
        add(errors, 'error', 'HUB_NOTE_BAD_LINE', `conditional-hub-notes entry rn=${rn} has invalid lineIndex (${String(e?.lineIndex)}).`);
      }
    });
  }
  if (hubNotes) {
    hubnoteByLine.forEach((rn, lineIndex) => {
      if (!hubNoteEntryByRn.has(rn)) {
        add(
          warnings,
          'warning',
          'HUBNOTE_MISSING_ENTRY',
          `Line ${lineIndex + 1} has <!-- hubnote:${rn} --> but conditional-hub-notes has no entry for ${rn}.`,
        );
      }
    });
  }

  // Flowtab process references (node-id based). These are fragile on full replacement; validate strictly if present.
  const flowtabRefs = getSingleJsonBlock('flowtab-process-references');
  if (flowtabRefs) {
    const refs = flowtabRefs.json;
    if (!refs || typeof refs !== 'object') {
      add(errors, 'error', 'BAD_FLOWTAB_REFS', 'flowtab-process-references must be a JSON object/map.');
    } else {
      const knownNodeIds = new Set<string>();
      traverseAllParsedNodes(roots, (n) => knownNodeIds.add(n.id));

      Object.entries(refs as Record<string, any>).forEach(([k, v]) => {
        if (!v || typeof v !== 'object') return;
        const kind = v.kind;
        const rootId = typeof v.rootProcessNodeId === 'string' ? v.rootProcessNodeId : '';
        const targetId = typeof v.targetNodeId === 'string' ? v.targetNodeId : '';
        if (!rootId || !targetId || (kind !== 'whole' && kind !== 'inner')) {
          add(warnings, 'warning', 'BAD_FLOWTAB_REF', `flowtab-process-references["${k}"] is missing required fields.`);
          return;
        }
        if (!knownNodeIds.has(rootId)) {
          add(errors, 'error', 'FLOWTAB_REF_MISSING_NODE', `flowtab-process-references["${k}"] rootProcessNodeId "${rootId}" does not exist.`);
        }
        if (!knownNodeIds.has(targetId)) {
          add(errors, 'error', 'FLOWTAB_REF_MISSING_NODE', `flowtab-process-references["${k}"] targetNodeId "${targetId}" does not exist.`);
        }
        if (kind === 'inner') {
          const expRn = typeof v.expandedRunningNumber === 'number' ? v.expandedRunningNumber : undefined;
          const gridKey = typeof v.gridNodeKey === 'string' ? v.gridNodeKey : undefined;
          if ((expRn !== undefined && !Number.isFinite(expRn)) || (expRn !== undefined && expRn <= 0)) {
            add(warnings, 'warning', 'BAD_FLOWTAB_REF_RN', `flowtab-process-references["${k}"] has an invalid expandedRunningNumber.`);
          }
          if (expRn !== undefined && gridKey) {
            // Verify there is a matching expanded-grid block containing that key.
            const matchBlock = expandedGridBlocks.find((b) => b.key === String(expRn));
            if (!matchBlock) {
              add(
                warnings,
                'warning',
                'FLOWTAB_REF_MISSING_EXPANDED_GRID',
                `flowtab-process-references["${k}"] points to expandedRunningNumber ${expRn}, but no \`\`\`expanded-grid-${expRn}\`\`\` block exists.`,
              );
            } else {
              const parsed = tryParseJson(matchBlock.block.body);
              const arr = parsed && Array.isArray(parsed.value) ? parsed.value : [];
              const found = arr.some((n: any) => (typeof n?.key === 'string' ? n.key : '') === gridKey);
              if (!found) {
                add(
                  warnings,
                  'warning',
                  'FLOWTAB_REF_MISSING_GRID_NODE',
                  `flowtab-process-references["${k}"] gridNodeKey "${gridKey}" was not found inside \`\`\`expanded-grid-${expRn}\`\`\`.`,
                );
              }
            }
          }
        }
      });
    }
  }

  // Legacy testing-store block (deprecated)
  const testingStore = getSingleJsonBlock('testing-store');
  if (testingStore) {
    add(
      warnings,
      'warning',
      'DEPRECATED_TESTING_STORE',
      'Found a `testing-store` fenced block. Legacy diagram-embedded tests are deprecated; use test files instead.',
    );
  }

  // Final report
  const outErrors = errors.filter((x) => x.severity === 'error');
  const outWarnings = warnings.filter((x) => x.severity === 'warning');
  return {
    errors: outErrors,
    warnings: outWarnings,
    aiFriendlyReport: summarizeIssues(outErrors, outWarnings),
  };
}

