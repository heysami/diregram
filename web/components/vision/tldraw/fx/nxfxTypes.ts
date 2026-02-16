// Shared types + safe (de)serialization helpers for Vision effects/distortions.
//
// Stored on any tldraw shape as: `shape.meta.nxFx`.
// IMPORTANT: tldraw meta is untyped; always validate/clamp when reading.

export const NX_FX_META_KEY = 'nxFx' as const;

export type NxFxRampStop = { t: number; v: number }; // t: 0..1 position, v: 0..1 strength
export type NxFxRamp = {
  angleDeg: number; // 0..360
  stops: NxFxRampStop[]; // sorted by t
};

export type NxFxDropShadow = {
  id: string;
  kind: 'dropShadow';
  enabled: boolean;
  color: string; // css color, prefer rgba(...)
  offsetX: number; // px
  offsetY: number; // px
  blur: number; // px
  opacity: number; // 0..1 (multiplies color alpha)
};

export type NxFxInnerShadow = {
  id: string;
  kind: 'innerShadow';
  enabled: boolean;
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  opacity: number; // 0..1
};

export type NxFxEffect = NxFxDropShadow | NxFxInnerShadow;

export type NxFxBlur = {
  id: string;
  kind: 'blur';
  enabled: boolean;
  radius: number; // px
  ramp?: NxFxRamp; // optional gradient strength mask
};

export type NxFxMotionBlur = {
  id: string;
  kind: 'motionBlur';
  enabled: boolean;
  angleDeg: number; // direction
  distance: number; // px
  samples: number; // >= 2
};

export type NxFxBloom = {
  id: string;
  kind: 'bloom';
  enabled: boolean;
  threshold: number; // 0..1
  radius: number; // px
  intensity: number; // 0..5
};

export type NxFxGlitch = {
  id: string;
  kind: 'glitch';
  enabled: boolean;
  strength: number; // 0..1
  rgbOffset: number; // px
  scanlines: number; // 0..1
  seed: number; // int-ish
};

export type NxFxMosh = {
  id: string;
  kind: 'mosh';
  enabled: boolean;
  strength: number; // 0..1
  blockSize: number; // px
  ramp?: NxFxRamp;
  seed: number;
};

export type NxFxGrain = {
  id: string;
  kind: 'grain';
  enabled: boolean;
  strength: number; // 0..1
  size: number; // px
  seed: number;
};

export type NxFxDoodle = {
  id: string;
  kind: 'doodle';
  enabled: boolean;
  strength: number; // 0..1
  scale: number; // px
  seed: number;
};

export type NxFxDistortion = NxFxBlur | NxFxMotionBlur | NxFxBloom | NxFxGlitch | NxFxMosh | NxFxGrain | NxFxDoodle;

export type NxFxStack = {
  v: 1;
  effects: NxFxEffect[];
  distortions: NxFxDistortion[];
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export function makeDefaultRamp(): NxFxRamp {
  return { angleDeg: 0, stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }] };
}

export function makeEmptyNxFx(): NxFxStack {
  return { v: 1, effects: [], distortions: [] };
}

export function isNxFxEmpty(fx: NxFxStack | null | undefined): boolean {
  if (!fx) return true;
  return (fx.effects?.length || 0) === 0 && (fx.distortions?.length || 0) === 0;
}

function clamp(v: any, lo: number, hi: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function asString(v: any, fallback: string) {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: any, fallback: boolean) {
  return typeof v === 'boolean' ? v : fallback;
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function normalizeStops(stops: any): NxFxRampStop[] {
  const raw = asArray(stops)
    .map((s) => ({ t: clamp(s?.t, 0, 1, 0), v: clamp(s?.v, 0, 1, 0) }))
    .sort((a, b) => a.t - b.t);
  if (raw.length >= 2) return raw;
  return makeDefaultRamp().stops;
}

export function coerceRamp(x: any): NxFxRamp | undefined {
  if (!x || typeof x !== 'object') return undefined;
  return {
    angleDeg: clamp((x as any).angleDeg, 0, 360, 0),
    stops: normalizeStops((x as any).stops),
  };
}

function sanitizeJsonValue(x: any): JsonValue {
  if (x === null) return null;
  const t = typeof x;
  if (t === 'string' || t === 'boolean') return x as any;
  if (t === 'number') return Number.isFinite(x) ? (x as number) : 0;
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') return null;
  if (Array.isArray(x)) return x.map((v) => sanitizeJsonValue(v));
  if (t === 'object') {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(x as any)) {
      if (v === undefined) continue; // key: important for tldraw meta validation
      out[k] = sanitizeJsonValue(v);
    }
    return out;
  }
  return null;
}

function coerceEffect(x: any): NxFxEffect | null {
  if (!x || typeof x !== 'object') return null;
  const kind = (x as any).kind;
  const id = asString((x as any).id, '');
  if (!id) return null;
  if (kind === 'dropShadow') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      color: asString((x as any).color, 'rgba(0,0,0,1)'),
      offsetX: clamp((x as any).offsetX, -4096, 4096, 6),
      offsetY: clamp((x as any).offsetY, -4096, 4096, 6),
      blur: clamp((x as any).blur, 0, 4096, 16),
      opacity: clamp((x as any).opacity, 0, 1, 0.35),
    };
  }
  if (kind === 'innerShadow') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      color: asString((x as any).color, 'rgba(0,0,0,1)'),
      offsetX: clamp((x as any).offsetX, -4096, 4096, 0),
      offsetY: clamp((x as any).offsetY, -4096, 4096, 3),
      blur: clamp((x as any).blur, 0, 4096, 12),
      opacity: clamp((x as any).opacity, 0, 1, 0.25),
    };
  }
  return null;
}

function coerceDistortion(x: any): NxFxDistortion | null {
  if (!x || typeof x !== 'object') return null;
  const kind = (x as any).kind;
  const id = asString((x as any).id, '');
  if (!id) return null;
  if (kind === 'blur') {
    const ramp = coerceRamp((x as any).ramp);
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      radius: clamp((x as any).radius, 0, 4096, 8),
      ...(ramp ? { ramp } : null),
    };
  }
  if (kind === 'motionBlur') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      angleDeg: clamp((x as any).angleDeg, 0, 360, 0),
      distance: clamp((x as any).distance, 0, 4096, 18),
      samples: Math.max(2, Math.min(64, Math.round(clamp((x as any).samples, 2, 64, 10)))),
    };
  }
  if (kind === 'bloom') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      threshold: clamp((x as any).threshold, 0, 1, 0.75),
      radius: clamp((x as any).radius, 0, 4096, 16),
      intensity: clamp((x as any).intensity, 0, 5, 1.2),
    };
  }
  if (kind === 'glitch') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      strength: clamp((x as any).strength, 0, 1, 0.35),
      rgbOffset: clamp((x as any).rgbOffset, 0, 512, 3),
      scanlines: clamp((x as any).scanlines, 0, 1, 0.25),
      seed: Math.floor(clamp((x as any).seed, -2147483648, 2147483647, 1)),
    };
  }
  if (kind === 'mosh') {
    const ramp = coerceRamp((x as any).ramp);
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      strength: clamp((x as any).strength, 0, 1, 0.35),
      blockSize: clamp((x as any).blockSize, 1, 1024, 18),
      ...(ramp ? { ramp } : null),
      seed: Math.floor(clamp((x as any).seed, -2147483648, 2147483647, 1)),
    };
  }
  if (kind === 'grain') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      strength: clamp((x as any).strength, 0, 1, 0.22),
      size: clamp((x as any).size, 0.5, 64, 1.2),
      seed: Math.floor(clamp((x as any).seed, -2147483648, 2147483647, 1)),
    };
  }
  if (kind === 'doodle') {
    return {
      id,
      kind,
      enabled: asBool((x as any).enabled, true),
      strength: clamp((x as any).strength, 0, 1, 0.45),
      scale: clamp((x as any).scale, 0.5, 512, 6),
      seed: Math.floor(clamp((x as any).seed, -2147483648, 2147483647, 1)),
    };
  }
  return null;
}

export function coerceNxFx(x: any): NxFxStack {
  const base = makeEmptyNxFx();
  if (!x || typeof x !== 'object') return base;
  const v = (x as any).v === 1 ? 1 : 1;
  const effects = asArray((x as any).effects).map(coerceEffect).filter(Boolean) as NxFxEffect[];
  const distortions = asArray((x as any).distortions).map(coerceDistortion).filter(Boolean) as NxFxDistortion[];
  return { v, effects, distortions };
}

export function readNxFxFromMeta(meta: any): NxFxStack | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = (meta as any)[NX_FX_META_KEY];
  if (!raw) return null;
  return coerceNxFx(raw);
}

export function writeNxFxToMeta(meta: any, fx: NxFxStack | null): any {
  const nextMeta: any = { ...(meta || {}) };
  if (!fx || isNxFxEmpty(fx)) {
    delete nextMeta[NX_FX_META_KEY];
    return nextMeta;
  }
  // IMPORTANT: tldraw requires meta to be strictly JSON-serializable (no `undefined`, no non-finite numbers).
  nextMeta[NX_FX_META_KEY] = sanitizeJsonValue(fx);
  return nextMeta;
}

export function makeFxId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
      ? (crypto as any).randomUUID()
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}_${rnd}`;
}

