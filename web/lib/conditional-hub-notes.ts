import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { buildExpandedNodeParentPath, extractExpandedIdsFromMarkdown, upsertExpandedIdComment } from '@/lib/expanded-state-storage';

export interface ConditionalHubNoteEntry {
  runningNumber: number;
  content: string;
  parentPath: string[];
  lineIndex: number;
  dependencies?: string;
  impact?: string;
}

export interface ConditionalHubNotesData {
  nextRunningNumber: number;
  entries: ConditionalHubNoteEntry[];
}

const BLOCK_TYPE = 'conditional-hub-notes';
const FULL_BLOCK_RE = new RegExp(String.raw`\`\`\`${BLOCK_TYPE}\n[\s\S]*?\n\`\`\``);
const BLOCK_RE = new RegExp(String.raw`\`\`\`${BLOCK_TYPE}\n([\s\S]*?)\n\`\`\``);

export function extractHubNoteRunningNumbersFromMarkdown(markdown: string): Map<number, number> {
  const lines = markdown.split('\n');
  const lineIndexToRunningNumber = new Map<number, number>();
  lines.forEach((line, index) => {
    const match = line.match(/<!--\s*hubnote:(\d+)\s*-->/);
    if (!match) return;
    const rn = Number.parseInt(match[1], 10);
    if (Number.isFinite(rn)) lineIndexToRunningNumber.set(index, rn);
  });
  return lineIndexToRunningNumber;
}

export function loadConditionalHubNotes(doc: Y.Doc): ConditionalHubNotesData {
  const yText = doc.getText('nexus');
  const markdown = yText.toString();
  return loadConditionalHubNotesFromMarkdown(markdown);
}

export function loadConditionalHubNotesFromMarkdown(markdown: string): ConditionalHubNotesData {
  const match = markdown.match(BLOCK_RE);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        nextRunningNumber: typeof parsed?.nextRunningNumber === 'number' ? parsed.nextRunningNumber : 1,
        entries: Array.isArray(parsed?.entries) ? (parsed.entries as ConditionalHubNoteEntry[]) : [],
      };
    } catch {
      // ignore
    }
  }
  return { nextRunningNumber: 1, entries: [] };
}

export function saveConditionalHubNotes(doc: Y.Doc, data: ConditionalHubNotesData): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const block = `\`\`\`${BLOCK_TYPE}\n${JSON.stringify(data, null, 2)}\n\`\`\``;

  let next = current;
  if (next.match(FULL_BLOCK_RE)) {
    next = next.replace(FULL_BLOCK_RE, block);
  } else {
    const separatorIndex = next.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      next = next.slice(0, separatorIndex + 5) + '\n' + block + next.slice(separatorIndex + 5);
    } else {
      next = next + (next.endsWith('\n') ? '' : '\n') + '\n---\n' + block;
    }
  }

  if (next !== current) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, next);
    });
  }
}

function setHubNoteCommentOnLine(lines: string[], lineIndex: number, runningNumber: number | null): boolean {
  if (lineIndex < 0 || lineIndex >= lines.length) return false;
  const original = lines[lineIndex];
  const without = original.replace(/\s*<!--\s*hubnote:\d+\s*-->\s*/g, ' ').replace(/\s+$/g, '');
  const withComment = runningNumber ? `${without} <!-- hubnote:${runningNumber} -->` : without;
  if (withComment === original) return false;
  lines[lineIndex] = withComment;
  return true;
}

/**
 * Upsert (or clear) dependencies/impact notes for a hub node.
 * Uses a dedicated `<!-- hubnote:N -->` comment on the hub line as the stable anchor.
 * Also ensures `<!-- expid:N -->` exists on that line for long-term stability.
 */
export function upsertConditionalHubNote(params: {
  doc: Y.Doc;
  hub: NexusNode;
  dependencies: string;
  impact: string;
  nodeMap: Map<string, NexusNode>;
  roots: NexusNode[];
}): void {
  const { doc, hub, dependencies, impact, nodeMap, roots } = params;
  const deps = dependencies.trim();
  const imp = impact.trim();

  const yText = doc.getText('nexus');
  const markdown = yText.toString();
  const lines = markdown.split('\n');
  const lineIndex = hub.lineIndex;

  const expidByLine = extractExpandedIdsFromMarkdown(markdown);
  const existingExpid = expidByLine.get(lineIndex);

  const notesData = loadConditionalHubNotes(doc);
  const hubnoteByLine = extractHubNoteRunningNumbersFromMarkdown(markdown);
  const existingHubNote = hubnoteByLine.get(lineIndex);

  const runningNumber = existingHubNote ?? existingExpid ?? notesData.nextRunningNumber;
  const nextRunningNumber =
    existingHubNote || existingExpid ? notesData.nextRunningNumber : notesData.nextRunningNumber + 1;

  // Ensure the persistent expid marker exists on the line (so other systems can key off it if needed).
  if (!existingExpid) {
    const updated = upsertExpandedIdComment(lines[lineIndex], runningNumber);
    if (updated !== lines[lineIndex]) lines[lineIndex] = updated;
  }

  // If clearing, remove comment + remove entry.
  if (!deps && !imp) {
    let changed = setHubNoteCommentOnLine(lines, lineIndex, null);
    const nextEntries = notesData.entries.filter((e) => e.runningNumber !== runningNumber);
    if (nextEntries.length !== notesData.entries.length) changed = true;
    if (!changed) return;
    const nextNotes: ConditionalHubNotesData = { nextRunningNumber, entries: nextEntries };
    const nextMarkdown = (() => {
      // Save notes block + update line comments in one transaction.
      // We update yText directly below.
      const base = lines.join('\n');
      // Temporarily write base to doc then write metadata via saveConditionalHubNotes.
      return base;
    })();
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, nextMarkdown);
    });
    saveConditionalHubNotes(doc, nextNotes);
    return;
  }

  // Ensure hubnote comment on the hub line.
  setHubNoteCommentOnLine(lines, lineIndex, runningNumber);

  const parentPath = buildExpandedNodeParentPath(hub, nodeMap, roots);
  const nextEntry: ConditionalHubNoteEntry = {
    runningNumber,
    content: hub.content.trim(),
    parentPath,
    lineIndex,
    dependencies: deps,
    impact: imp,
  };

  const entries = [...notesData.entries];
  const idx = entries.findIndex((e) => e.runningNumber === runningNumber);
  if (idx >= 0) entries[idx] = nextEntry;
  else entries.push(nextEntry);

  const nextNotes: ConditionalHubNotesData = { nextRunningNumber, entries };
  const nextMarkdown = lines.join('\n');
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, nextMarkdown);
  });
  saveConditionalHubNotes(doc, nextNotes);
}

export function getConditionalHubNoteForHub(doc: Y.Doc, hub: NexusNode): { dependencies: string; impact: string } | null {
  const yText = doc.getText('nexus');
  const markdown = yText.toString();
  const byLine = extractHubNoteRunningNumbersFromMarkdown(markdown);
  const rn = byLine.get(hub.lineIndex);
  if (!rn) return null;
  const data = loadConditionalHubNotes(doc);
  const entry = data.entries.find((e) => e.runningNumber === rn);
  if (!entry) return null;
  return { dependencies: entry.dependencies || '', impact: entry.impact || '' };
}

