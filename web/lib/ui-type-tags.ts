import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { parseTagIdsFromLine } from '@/lib/node-tags';

export type UiTypeTagValue = 'view-item' | 'list' | 'form' | 'popup';

export const UI_TYPE_GROUP_ID = 'tg-uiType';

export const UI_TYPE_TAG_BY_VALUE: Record<UiTypeTagValue, string> = {
  'view-item': 'tag-ui-view-item',
  list: 'tag-ui-list',
  form: 'tag-ui-form',
  popup: 'tag-ui-popup',
};

export const UI_TYPE_TAG_IDS = new Set<string>(Object.values(UI_TYPE_TAG_BY_VALUE));

const UI_TYPE_VALUE_BY_TAG_ID: Record<string, UiTypeTagValue> = Object.entries(UI_TYPE_TAG_BY_VALUE).reduce(
  (acc, [value, tagId]) => {
    acc[tagId] = value as UiTypeTagValue;
    return acc;
  },
  {} as Record<string, UiTypeTagValue>,
);

export function getUiTypeFromNodeTagIds(tagIds?: string[] | null): UiTypeTagValue | null {
  if (!tagIds || tagIds.length === 0) return null;
  for (const id of tagIds) {
    const v = UI_TYPE_VALUE_BY_TAG_ID[id];
    if (v) return v;
  }
  return null;
}

const TAGS_COMMENT_RE = /\s*<!--\s*tags:[^>]*\s*-->\s*/g;

function sanitizeTagId(raw: string): string {
  return raw
    .replace(/\r?\n/g, '')
    .replace(/[<>]/g, '')
    .replace(/--/g, '')
    .trim();
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

export function bulkSetUiTypeTag(doc: Y.Doc, nodes: NexusNode[], uiType: UiTypeTagValue | null): void {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');
  const targetLineIndices = new Set<number>();
  nodes.forEach((n) => getTargetLineIndices(n).forEach((idx) => targetLineIndices.add(idx)));

  const chosenTagId = uiType ? UI_TYPE_TAG_BY_VALUE[uiType] : null;
  let changed = false;

  targetLineIndices.forEach((idx) => {
    const current = parseTagIdsFromLine(lines[idx] || '');
    const withoutUi = current.filter((t) => !UI_TYPE_TAG_IDS.has(t));
    const next = chosenTagId ? [...withoutUi, chosenTagId] : withoutUi;
    changed = setLineTags(lines, idx, next) || changed;
  });

  if (!changed) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });
}

