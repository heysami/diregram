'use client';

import type { GradientStop } from '@/components/vision/tldraw/lib/gradient-stops';
import { hex8ToRgbaCss, toHex8OrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';

export type PaintMode = 'solid' | 'linear' | 'radial' | 'pattern';
export type PatternKind = 'stripes' | 'dots' | 'checker';

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function safeSvgId(id: string) {
  return String(id || 'nx').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function paintUrl(kind: 'fill' | 'stroke', sid: string, layerId?: string) {
  const lid = layerId ? `__${safeSvgId(layerId)}` : '';
  return `url(#${sid}__${kind}${lid})`;
}

function stopsToDefs(stops: GradientStop[]) {
  const arr = Array.isArray(stops) ? stops : [];
  return arr.map((s, i) => (
    <stop
      // eslint-disable-next-line react/no-array-index-key
      key={i}
      offset={`${(clamp01(Number((s as any)?.offset ?? 0)) * 100).toFixed(2)}%`}
      stopColor={(() => {
        const c = toHex8OrEmpty(String((s as any)?.color || ''));
        if (!c) return '#000000';
        return c.slice(0, 7);
      })()}
      stopOpacity={(() => {
        const c = toHex8OrEmpty(String((s as any)?.color || ''));
        if (!c) return 1;
        return parseInt(c.slice(7, 9), 16) / 255;
      })()}
    />
  ));
}

export function getPatternDef(kind: PatternKind, a: string, b: string, id: string) {
  const aCss = hex8ToRgbaCss(a);
  const bCss = hex8ToRgbaCss(b);
  if (kind === 'dots') {
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width="10" height="10">
        <rect width="10" height="10" fill={bCss} />
        <circle cx="2.5" cy="2.5" r="1.6" fill={aCss} />
        <circle cx="7.5" cy="7.5" r="1.6" fill={aCss} />
      </pattern>
    );
  }
  if (kind === 'checker') {
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width="12" height="12">
        <rect width="12" height="12" fill={bCss} />
        <rect x="0" y="0" width="6" height="6" fill={aCss} />
        <rect x="6" y="6" width="6" height="6" fill={aCss} />
      </pattern>
    );
  }
  // stripes
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
      <rect width="10" height="10" fill={bCss} />
      <rect x="0" y="0" width="4" height="10" fill={aCss} />
    </pattern>
  );
}

export function getPaintDefs(opts: {
  sid: string;
  mode: PaintMode;
  stops: GradientStop[];
  angle: number;
  pattern: PatternKind;
  kind: 'fill' | 'stroke';
  layerId?: string;
  gx0?: number;
  gy0?: number;
  gx1?: number;
  gy1?: number;
}) {
  const lid = opts.layerId ? `__${safeSvgId(opts.layerId)}` : '';
  const id = `${opts.sid}__${opts.kind}${lid}`;
  if (opts.mode === 'linear') {
    const gx0 = Number.isFinite(opts.gx0) ? clamp(Number(opts.gx0), 0, 1) : null;
    const gy0 = Number.isFinite(opts.gy0) ? clamp(Number(opts.gy0), 0, 1) : null;
    const gx1 = Number.isFinite(opts.gx1) ? clamp(Number(opts.gx1), 0, 1) : null;
    const gy1 = Number.isFinite(opts.gy1) ? clamp(Number(opts.gy1), 0, 1) : null;
    const useHandles = gx0 !== null && gy0 !== null && gx1 !== null && gy1 !== null;
    const angle = clamp(Number(opts.angle ?? 45), 0, 360);
    return (
      <linearGradient
        id={id}
        x1={useHandles ? gx0! : 0}
        y1={useHandles ? gy0! : 0}
        x2={useHandles ? gx1! : 1}
        y2={useHandles ? gy1! : 0}
        gradientUnits="objectBoundingBox"
        gradientTransform={useHandles ? undefined : `rotate(${angle} 0.5 0.5)`}
      >
        {stopsToDefs(opts.stops)}
      </linearGradient>
    );
  }
  if (opts.mode === 'radial') {
    return (
      <radialGradient id={id} cx="50%" cy="50%" r="70%">
        {stopsToDefs(opts.stops)}
      </radialGradient>
    );
  }
  if (opts.mode === 'pattern') {
    const a = String(opts.stops?.[0]?.color || '#000000');
    const b = String(opts.stops?.[opts.stops.length - 1]?.color || '#ffffff');
    return getPatternDef(opts.pattern, a, b, id);
  }
  return null;
}

