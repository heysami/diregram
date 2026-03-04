import type { NexusNode } from '@/types/nexus';
import type { DiagramAssistMarkdownSectionPatch } from '@/lib/diagram-ai-assist-types';

function normalizeMarkdownNewlines(text: string): string {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function getIndent(line: string): number {
  const m = String(line || '').match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function findSeparatorIndexOutsideFences(lines: string[]): number {
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() || '';
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && trimmed === '---') return i;
  }
  return -1;
}

function findSubtreeRange(lines: string[], lineIndex: number): { start: number; end: number; baseIndent: number } | null {
  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  const startLine = String(lines[lineIndex] || '');
  if (!startLine.trim()) return null;
  const separatorIndex = findSeparatorIndexOutsideFences(lines);
  const nodeSectionEnd = separatorIndex === -1 ? lines.length : separatorIndex;
  if (lineIndex >= nodeSectionEnd) return null;

  const baseIndent = getIndent(startLine);
  let end = lineIndex;
  for (let i = lineIndex + 1; i < nodeSectionEnd; i += 1) {
    const line = String(lines[i] || '');
    if (!line.trim()) {
      end = i;
      continue;
    }
    const indent = getIndent(line);
    if (indent <= baseIndent) break;
    end = i;
  }
  return { start: lineIndex, end, baseIndent };
}

function normalizeReplacementLines(subtreeMarkdown: string, baseIndent: number): string[] {
  const rawLines = normalizeMarkdownNewlines(subtreeMarkdown).split('\n');
  while (rawLines.length > 0 && !rawLines[rawLines.length - 1]?.trim()) rawLines.pop();
  while (rawLines.length > 0 && !rawLines[0]?.trim()) rawLines.shift();

  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  const minIndent = nonEmpty.length
    ? nonEmpty.reduce((acc, l) => Math.min(acc, getIndent(l)), Number.POSITIVE_INFINITY)
    : 0;

  return rawLines.map((line) => {
    if (!line.trim()) return '';
    const strip = Math.max(0, Math.min(getIndent(line), Number.isFinite(minIndent) ? minIndent : 0));
    const dedented = line.slice(strip);
    return `${' '.repeat(Math.max(0, baseIndent))}${dedented}`;
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const normalized = normalizeMarkdownNewlines(text);
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (!globalCrypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  const bytes = new TextEncoder().encode(normalized);
  const digest = await globalCrypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractSubtreeMarkdownFromLineIndex(markdown: string, lineIndex: number): string {
  const lines = normalizeMarkdownNewlines(markdown).split('\n');
  const range = findSubtreeRange(lines, lineIndex);
  if (!range) return '';
  return lines.slice(range.start, range.end + 1).join('\n').trimEnd();
}

export function replaceSubtreeMarkdownAtLineIndex(input: {
  markdown: string;
  lineIndex: number;
  subtreeReplacementMarkdown: string;
}): { markdown: string; originalSubtreeMarkdown: string } {
  const markdown = normalizeMarkdownNewlines(input.markdown);
  const lines = markdown.split('\n');
  const range = findSubtreeRange(lines, input.lineIndex);
  if (!range) throw new Error('Selected node range is no longer valid.');

  const replacementLines = normalizeReplacementLines(input.subtreeReplacementMarkdown, range.baseIndent);
  if (!replacementLines.length || !replacementLines.some((l) => l.trim())) {
    throw new Error('AI proposal did not include a valid subtree replacement.');
  }

  const originalSubtreeMarkdown = lines.slice(range.start, range.end + 1).join('\n').trimEnd();
  const nextLines = lines.slice(0, range.start).concat(replacementLines, lines.slice(range.end + 1));
  return {
    markdown: nextLines.join('\n'),
    originalSubtreeMarkdown,
  };
}

type NormalizedLineRangePatch = {
  targetId: string;
  startLine: number;
  endLine: number;
  replacementLines: string[];
};

function normalizeLineRangePatch(
  patch: DiagramAssistMarkdownSectionPatch,
  totalLines: number,
): NormalizedLineRangePatch {
  const targetId = String(patch.targetId || '').trim();
  const startLine = Math.max(1, Math.floor(Number(patch.startLine || 0)));
  const endLine = Math.max(0, Math.floor(Number(patch.endLine || 0)));
  const replacementRaw = normalizeMarkdownNewlines(patch.replacementMarkdown || '');
  const replacementLines = replacementRaw.length ? replacementRaw.split('\n') : [];

  if (!targetId) throw new Error('Patch target id is missing.');
  if (startLine > totalLines + 1) throw new Error(`Patch "${targetId}" start line ${startLine} exceeds file bounds.`);
  if (endLine > totalLines) throw new Error(`Patch "${targetId}" end line ${endLine} exceeds file bounds.`);
  if (!(startLine <= endLine || startLine === endLine + 1)) {
    throw new Error(`Patch "${targetId}" has invalid range (${startLine}-${endLine}).`);
  }

  return {
    targetId,
    startLine,
    endLine,
    replacementLines,
  };
}

function assertNoOverlappingLineRangePatches(patches: NormalizedLineRangePatch[]) {
  if (patches.length <= 1) return;
  const sorted = [...patches].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevIsInsert = prev.startLine === prev.endLine + 1;
    const curIsInsert = cur.startLine === cur.endLine + 1;

    if (prevIsInsert || curIsInsert) {
      if (prev.startLine === cur.startLine) {
        throw new Error(`Patches "${prev.targetId}" and "${cur.targetId}" overlap at insertion point line ${cur.startLine}.`);
      }
      continue;
    }

    if (cur.startLine <= prev.endLine) {
      throw new Error(`Patches "${prev.targetId}" and "${cur.targetId}" overlap.`);
    }
  }
}

export function applyLineRangePatches(input: {
  markdown: string;
  patches: DiagramAssistMarkdownSectionPatch[];
}): { markdown: string; appliedPatches: number } {
  const markdown = normalizeMarkdownNewlines(input.markdown);
  const lines = markdown.split('\n');
  const normalized = (input.patches || []).map((patch) => normalizeLineRangePatch(patch, lines.length));
  assertNoOverlappingLineRangePatches(normalized);

  const byDescendingStart = [...normalized].sort((a, b) => b.startLine - a.startLine || b.endLine - a.endLine);
  const nextLines = [...lines];

  byDescendingStart.forEach((patch) => {
    const startIdx = patch.startLine - 1;
    const endIdx = patch.endLine - 1;
    if (patch.startLine === patch.endLine + 1) {
      nextLines.splice(startIdx, 0, ...patch.replacementLines);
      return;
    }
    nextLines.splice(startIdx, endIdx - startIdx + 1, ...patch.replacementLines);
  });

  return {
    markdown: nextLines.join('\n'),
    appliedPatches: normalized.length,
  };
}

export function buildNodeParentPathFingerprint(node: NexusNode, nodeMap: Map<string, NexusNode>): string[] {
  const out: string[] = [];
  let cur: NexusNode | undefined = node;
  const seen = new Set<string>();
  while (cur?.parentId) {
    const parent = nodeMap.get(cur.parentId);
    if (!parent) break;
    if (seen.has(parent.id)) break;
    seen.add(parent.id);
    out.unshift(`${parent.content.trim()}::${parent.lineIndex}`);
    cur = parent;
  }
  return out;
}

export function normalizeNodePathLabel(input: string): string {
  return String(input || '').trim().toLowerCase();
}

export function resolveNodeByRelativePath(root: NexusNode, path: string[]): NexusNode | null {
  if (!path.length) return root;

  const cleaned = path.map((p) => normalizeNodePathLabel(p)).filter(Boolean);
  if (!cleaned.length) return root;

  let current: NexusNode | null = root;
  let idx = 0;

  // Allow first segment to point at root label.
  if (normalizeNodePathLabel(root.content) === cleaned[0]) idx = 1;

  while (current && idx < cleaned.length) {
    const expected = cleaned[idx];
    const nextNode: NexusNode | null = (current.children || []).find((c) => normalizeNodePathLabel(c.content) === expected) || null;
    if (!nextNode) return null;
    current = nextNode;
    idx += 1;
  }

  return current;
}
