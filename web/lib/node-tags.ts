import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';

const TAGS_COMMENT_RE = /\s*<!--\s*tags:[^>]*\s*-->\s*/g;

function sanitizeTagId(raw: string): string {
  // Keep it safe for embedding inside a single-line HTML comment attribute.
  return raw
    .replace(/\r?\n/g, '')
    .replace(/[<>]/g, '')
    .replace(/--/g, '')
    .trim();
}

export function parseTagIdsFromLine(line: string): string[] {
  const m = line.match(/<!--\s*tags:([^>]*)\s*-->/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((x) => sanitizeTagId(x))
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeTagIds(tagIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  tagIds.forEach((t) => {
    const id = sanitizeTagId(t);
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function setLineTags(lines: string[], lineIndex: number, tagIds: string[]): boolean {
  if (lineIndex < 0 || lineIndex >= lines.length) return false;
  const original = lines[lineIndex];
  const without = original.replace(TAGS_COMMENT_RE, ' ').replace(/\s+$/g, '');
  const normalized = normalizeTagIds(tagIds);
  const withTags = normalized.length ? `${without} <!-- tags:${normalized.join(',')} -->` : without;
  if (withTags === original) return false;
  lines[lineIndex] = withTags;
  return true;
}

function getTargetLineIndices(node: NexusNode): number[] {
  if (node.isHub && node.variants && node.variants.length > 0) {
    return node.variants.map((v) => v.lineIndex);
  }
  return [node.lineIndex];
}

export function setNodeTags(doc: Y.Doc, node: NexusNode, tagIds: string[]): void {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const indices = getTargetLineIndices(node);
  let changed = false;
  indices.forEach((idx) => {
    changed = setLineTags(lines, idx, tagIds) || changed;
  });
  if (!changed) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
}

export function bulkAddTag(doc: Y.Doc, nodes: NexusNode[], tagId: string): void {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const sanitized = sanitizeTagId(tagId);
  if (!sanitized) return;

  const targetLineIndices = new Set<number>();
  nodes.forEach((n) => getTargetLineIndices(n).forEach((idx) => targetLineIndices.add(idx)));

  let changed = false;
  targetLineIndices.forEach((lineIndex) => {
    const current = parseTagIdsFromLine(lines[lineIndex] || '');
    const next = normalizeTagIds([...current, sanitized]);
    changed = setLineTags(lines, lineIndex, next) || changed;
  });

  if (!changed) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
}

export function bulkRemoveTag(doc: Y.Doc, nodes: NexusNode[], tagId: string): void {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const sanitized = sanitizeTagId(tagId);
  if (!sanitized) return;

  const targetLineIndices = new Set<number>();
  nodes.forEach((n) => getTargetLineIndices(n).forEach((idx) => targetLineIndices.add(idx)));

  let changed = false;
  targetLineIndices.forEach((lineIndex) => {
    const current = parseTagIdsFromLine(lines[lineIndex] || '');
    const next = current.filter((t) => t !== sanitized);
    changed = setLineTags(lines, lineIndex, next) || changed;
  });

  if (!changed) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
}

export function bulkSetTags(doc: Y.Doc, nodes: NexusNode[], tagIds: string[]): void {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const normalized = normalizeTagIds(tagIds);

  const targetLineIndices = new Set<number>();
  nodes.forEach((n) => getTargetLineIndices(n).forEach((idx) => targetLineIndices.add(idx)));

  let changed = false;
  targetLineIndices.forEach((lineIndex) => {
    changed = setLineTags(lines, lineIndex, normalized) || changed;
  });

  if (!changed) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
}

