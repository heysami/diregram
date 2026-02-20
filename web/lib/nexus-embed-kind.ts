export type NexusEmbedKind = 'canvas' | 'flowTab' | 'processFlow' | 'systemflow' | 'dataObjects' | 'visionCard';

export function normalizeNexusEmbedKind(kind: unknown): NexusEmbedKind {
  const k = String(kind || '').trim();
  if (k === 'systemflow') return 'systemflow';
  if (k === 'flowTab' || k === 'flowtab') return 'flowTab';
  if (k === 'processFlow' || k === 'processflow') return 'processFlow';
  if (k === 'dataObjects') return 'dataObjects';
  if (k === 'visionCard') return 'visionCard';
  return 'canvas';
}

export function isVisionCardEmbedKind(kind: unknown): boolean {
  return normalizeNexusEmbedKind(kind) === 'visionCard';
}

