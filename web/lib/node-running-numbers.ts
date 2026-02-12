import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';

export const RN_COMMENT_RE = /<!--\s*rn:(\d+)\s*-->/;

export function extractRunningNumbersFromMarkdown(markdown: string): Map<number, number> {
  const lines = markdown.split('\n');
  const lineIndexToRunning = new Map<number, number>();
  lines.forEach((line, idx) => {
    const m = line.match(RN_COMMENT_RE);
    if (!m) return;
    const rn = Number.parseInt(m[1], 10);
    if (Number.isFinite(rn)) lineIndexToRunning.set(idx, rn);
  });
  return lineIndexToRunning;
}

export function stripRunningNumberComment(line: string): string {
  return line.replace(/\s*<!--\s*rn:\d+\s*-->\s*/g, ' ').replace(/\s+$/g, '');
}

export function upsertRunningNumberComment(line: string, rn: number): string {
  const cleaned = stripRunningNumberComment(line);
  return `${cleaned} <!-- rn:${rn} -->`;
}

export function traverseAllNodes(roots: NexusNode[], visit: (node: NexusNode) => void) {
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

export function ensureRunningNumberTags(opts: {
  doc: Y.Doc;
  roots: NexusNode[];
  // Map node.id -> running number (mutated/filled)
  runningNumberMap: Map<string, number>;
}): { didChange: boolean; nextRunningNumber: number } {
  const { doc, roots, runningNumberMap } = opts;
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const lines = current.split('\n');

  const lineIndexToRunning = extractRunningNumbersFromMarkdown(current);
  let maxRunning = 0;
  lineIndexToRunning.forEach((rn) => {
    if (rn > maxRunning) maxRunning = rn;
  });
  let nextRunningNumber = Math.max(1, maxRunning + 1);

  // Fill map for nodes that already have an rn comment
  traverseAllNodes(roots, (node) => {
    const rn = lineIndexToRunning.get(node.lineIndex);
    if (typeof rn === 'number') runningNumberMap.set(node.id, rn);
  });

  let didChange = false;

  // Ensure every node line has rn comment; assign if missing
  traverseAllNodes(roots, (node) => {
    if (node.lineIndex < 0 || node.lineIndex >= lines.length) return;
    const existing = lineIndexToRunning.get(node.lineIndex);
    if (typeof existing === 'number') return;

    const rn = nextRunningNumber++;
    lines[node.lineIndex] = upsertRunningNumberComment(lines[node.lineIndex], rn);
    runningNumberMap.set(node.id, rn);
    didChange = true;
  });

  if (didChange) {
    const nextText = lines.join('\n');
    if (nextText !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, nextText);
      });
    }
  }

  return { didChange, nextRunningNumber };
}

/**
 * Targeted variant: ensure rn tags only for specific nodes (used by the line tool).
 * This avoids adding rn tags to every node unnecessarily.
 */
export function ensureRunningNumberTagsForNodes(opts: {
  doc: Y.Doc;
  nodes: Array<{ id: string; lineIndex: number }>;
}): { didChange: boolean; assigned: Map<string, number> } {
  const { doc, nodes } = opts;
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const lines = current.split('\n');

  const lineIndexToRunning = extractRunningNumbersFromMarkdown(current);
  let maxRunning = 0;
  lineIndexToRunning.forEach((rn) => {
    if (rn > maxRunning) maxRunning = rn;
  });
  let nextRunningNumber = Math.max(1, maxRunning + 1);

  const assigned = new Map<string, number>();
  let didChange = false;

  nodes.forEach((n) => {
    if (n.lineIndex < 0 || n.lineIndex >= lines.length) return;
    const existing = lineIndexToRunning.get(n.lineIndex);
    if (typeof existing === 'number') {
      assigned.set(n.id, existing);
      return;
    }
    const rn = nextRunningNumber++;
    lines[n.lineIndex] = upsertRunningNumberComment(lines[n.lineIndex], rn);
    assigned.set(n.id, rn);
    didChange = true;
  });

  if (didChange) {
    const nextText = lines.join('\n');
    if (nextText !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, nextText);
      });
    }
  }

  return { didChange, assigned };
}

