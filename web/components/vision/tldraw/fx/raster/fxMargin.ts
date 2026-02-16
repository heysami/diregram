import type { NxFxStack } from '@/components/vision/tldraw/fx/nxfxTypes';

export type FxMarginPx = { l: number; r: number; t: number; b: number };

/** Margins in *pixels* for an already-scaled fx stack (pixelRatio applied). */
export function computeFxMarginPx(fx: NxFxStack | null): FxMarginPx {
  if (!fx) return { l: 0, r: 0, t: 0, b: 0 };
  let l = 0, r = 0, t = 0, b = 0;
  for (const e of fx.effects || []) {
    if (!e.enabled) continue;
    if (e.kind === 'dropShadow' || e.kind === 'innerShadow') {
      const ox = Number((e as any).offsetX || 0);
      const oy = Number((e as any).offsetY || 0);
      const blur = Math.max(0, Number((e as any).blur || 0));
      // Canvas blur extends beyond the radius; be generous to avoid cropping.
      const spread = blur * 3 + 2;
      l = Math.max(l, spread + Math.max(0, -ox));
      r = Math.max(r, spread + Math.max(0, ox));
      t = Math.max(t, spread + Math.max(0, -oy));
      b = Math.max(b, spread + Math.max(0, oy));
    }
  }
  for (const d of fx.distortions || []) {
    if (!d.enabled) continue;
    if (d.kind === 'blur' || d.kind === 'bloom') {
      const rad = Math.max(0, Number((d as any).radius || 0));
      const spread = rad * 3 + 2;
      l = Math.max(l, spread);
      r = Math.max(r, spread);
      t = Math.max(t, spread);
      b = Math.max(b, spread);
    }
    if (d.kind === 'motionBlur') {
      const dist = Math.max(0, Number((d as any).distance || 0));
      const spread = dist / 2 + 2;
      l = Math.max(l, spread);
      r = Math.max(r, spread);
      t = Math.max(t, spread);
      b = Math.max(b, spread);
    }
  }
  return { l, r, t, b };
}

