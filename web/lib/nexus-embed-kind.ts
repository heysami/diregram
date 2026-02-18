export type NexusEmbedKind = 'canvas' | 'systemflow' | 'dataObjects' | 'visionCard';

export function normalizeNexusEmbedKind(kind: unknown): NexusEmbedKind {
  const k = String(kind || '').trim();
  if (k === 'systemflow') return 'systemflow';
  if (k === 'dataObjects') return 'dataObjects';
  if (k === 'visionCard') return 'visionCard';
  return 'canvas';
}

export function isVisionCardEmbedKind(kind: unknown): boolean {
  return normalizeNexusEmbedKind(kind) === 'visionCard';
}

