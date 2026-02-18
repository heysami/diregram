'use client';

export type VisionCardEmbedSpecLike = {
  kind?: unknown;
  fileId?: unknown;
  cardId?: unknown;
  pendingConfig?: unknown;
  [k: string]: unknown;
};

export const VISION_CARD_PENDING_CONFIG_KEY = 'pendingConfig' as const;

export function withVisionCardPendingConfig<T extends Record<string, unknown>>(spec: T): T & { pendingConfig: true } {
  return { ...(spec as any), pendingConfig: true };
}

export function shouldAutoOpenVisionCardConfig(opts: {
  spec: VisionCardEmbedSpecLike | null;
  didAutoOpen: boolean;
  fileId: string | null;
  cardId: string | null;
}): boolean {
  const { spec, didAutoOpen, fileId, cardId } = opts;
  if (didAutoOpen) return false;
  if (!spec) return false;
  if (String(spec.kind || '') !== 'visionCard') return false;
  if (fileId && cardId) return false;
  return spec.pendingConfig === true;
}

export function consumeVisionCardPendingConfig(spec: VisionCardEmbedSpecLike | null): VisionCardEmbedSpecLike | null {
  if (!spec) return null;
  if (spec.pendingConfig !== true) return spec;
  const next: any = { ...spec };
  delete next[VISION_CARD_PENDING_CONFIG_KEY];
  return next;
}

