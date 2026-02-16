/**
 * Vision paint layer stacks (fills + strokes) for Nx vector shapes.
 *
 * Storage: we keep layers serialized as JSON strings in shape props because the
 * tldraw runtime prop validators in this codebase only use primitive `T.*` types.
 * This keeps snapshots stable and backward compatible.
 */
 
export type NxPaintMode = 'solid' | 'linear' | 'radial' | 'pattern';
export type NxPatternKind = 'stripes' | 'dots' | 'checker';
 
export type NxLineCap = 'round' | 'butt' | 'square';
export type NxLineJoin = 'round' | 'miter' | 'bevel';
export type NxStrokeAlign = 'center' | 'inside' | 'outside';
 
export type NxDash =
  | { kind: 'solid' }
  | { kind: 'dashed'; dashLength?: number; gapLength?: number }
  | { kind: 'dotted' }
  | { kind: 'custom'; array: number[]; offset?: number };
 
export type NxGradientStop = { offset: number; color: string };
 
export type NxFillLayer = {
  id: string;
  enabled: boolean;
  mode: NxPaintMode;
  /** Solid color (when mode === 'solid'). */
  solid?: string;
  /** JSON string of NxGradientStop[] (when mode is gradient/pattern). */
  stops?: string;
  pattern?: NxPatternKind;
  angle?: number;
  /** Optional per-layer gradient direction in objectBoundingBox space. */
  gx0?: number;
  gy0?: number;
  gx1?: number;
  gy1?: number;
};
 
export type NxStrokeLayer = NxFillLayer & {
  width: number;
  align: NxStrokeAlign;
  dash: NxDash;
  cap: NxLineCap;
  join: NxLineJoin;
};
 
function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
 
function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
 
export function makeLayerId(prefix: 'f' | 's' = 'f') {
  // Good enough for local ids; snapshots are per-document.
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
 
export function parseStopsJsonLoose(json: any): NxGradientStop[] | null {
  try {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return null;
    const stops = raw
      .map((s) => ({ offset: clamp01(Number((s as any)?.offset ?? 0)), color: String((s as any)?.color ?? '').trim() }))
      .filter((s) => !!s.color)
      .sort((a, b) => a.offset - b.offset);
    if (stops.length >= 2) return stops;
    return null;
  } catch {
    return null;
  }
}
 
export function serializeStopsJson(stops: NxGradientStop[]) {
  const arr = (Array.isArray(stops) ? stops : [])
    .map((s) => ({ offset: clamp01(Number((s as any)?.offset ?? 0)), color: String((s as any)?.color ?? '').trim() }))
    .filter((s) => !!s.color)
    .sort((a, b) => a.offset - b.offset);
  return JSON.stringify(arr.length >= 2 ? arr : [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }]);
}
 
function coerceMode(v: any): NxPaintMode {
  return v === 'linear' || v === 'radial' || v === 'pattern' ? v : 'solid';
}
 
function coercePattern(v: any): NxPatternKind {
  return v === 'dots' || v === 'checker' ? v : 'stripes';
}
 
function coerceDash(v: any): NxDash {
  if (!v || typeof v !== 'object') return { kind: 'solid' };
  const k = String((v as any).kind || 'solid');
  if (k === 'solid' || k === 'dotted') return { kind: k } as any;
  if (k === 'dashed') {
    const dashLength = Number.isFinite((v as any).dashLength) ? Math.max(0, Number((v as any).dashLength)) : undefined;
    const gapLength = Number.isFinite((v as any).gapLength) ? Math.max(0, Number((v as any).gapLength)) : undefined;
    return { kind: 'dashed', dashLength, gapLength } as any;
  }
  if (k === 'custom') {
    const arr = Array.isArray((v as any).array) ? (v as any).array.map((n: any) => Math.max(0, Number(n) || 0)).filter((n: number) => n > 0) : [];
    const offset = Number.isFinite((v as any).offset) ? Number((v as any).offset) : undefined;
    return { kind: 'custom', array: arr.length ? arr : [6, 4], offset } as any;
  }
  return { kind: 'solid' };
}
 
function coerceCap(v: any): NxLineCap {
  return v === 'butt' || v === 'square' ? v : 'round';
}
 
function coerceJoin(v: any): NxLineJoin {
  return v === 'miter' || v === 'bevel' ? v : 'round';
}
 
function coerceAlign(v: any): NxStrokeAlign {
  return v === 'inside' || v === 'outside' ? v : 'center';
}
 
function coerceBaseLayer(raw: any, kind: 'fill' | 'stroke'): NxFillLayer {
  const id = String(raw?.id || makeLayerId(kind === 'fill' ? 'f' : 's'));
  const enabled = raw?.enabled === false ? false : true;
  const mode = coerceMode(raw?.mode);
  const solid = typeof raw?.solid === 'string' ? raw.solid : undefined;
  const stops = typeof raw?.stops === 'string' ? raw.stops : undefined;
  const pattern = raw?.pattern ? coercePattern(raw.pattern) : undefined;
  const angle = Number.isFinite(raw?.angle) ? clamp(Number(raw.angle), 0, 360) : undefined;
  const gx0 = Number.isFinite(raw?.gx0) ? clamp01(Number(raw.gx0)) : undefined;
  const gy0 = Number.isFinite(raw?.gy0) ? clamp01(Number(raw.gy0)) : undefined;
  const gx1 = Number.isFinite(raw?.gx1) ? clamp01(Number(raw.gx1)) : undefined;
  const gy1 = Number.isFinite(raw?.gy1) ? clamp01(Number(raw.gy1)) : undefined;
  return { id, enabled, mode, solid, stops, pattern, angle, gx0, gy0, gx1, gy1 };
}
 
export function parseFillLayers(json: any): NxFillLayer[] | null {
  try {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return null;
    const layers = raw.map((x) => coerceBaseLayer(x, 'fill'));
    // Empty array is a valid “no fill layers” stack.
    return layers;
  } catch {
    return null;
  }
}
 
export function parseStrokeLayers(json: any): NxStrokeLayer[] | null {
  try {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(raw)) return null;
    const layers = raw.map((x) => {
      const base = coerceBaseLayer(x, 'stroke');
      const width = clamp(Number((x as any)?.width ?? 1), 0, 256);
      const align = coerceAlign((x as any)?.align);
      const dash = coerceDash((x as any)?.dash);
      const cap = coerceCap((x as any)?.cap);
      const join = coerceJoin((x as any)?.join);
      return { ...(base as any), width, align, dash, cap, join } as NxStrokeLayer;
    });
    // Empty array is a valid “no outline layers” stack.
    return layers;
  } catch {
    return null;
  }
}
 
export function serializeFillLayers(layers: NxFillLayer[]) {
  const arr = (Array.isArray(layers) ? layers : []).map((l) => coerceBaseLayer(l, 'fill'));
  return JSON.stringify(arr);
}
 
export function serializeStrokeLayers(layers: NxStrokeLayer[]) {
  const arr = (Array.isArray(layers) ? layers : []).map((l) => {
    const base = coerceBaseLayer(l, 'stroke') as any;
    return {
      ...base,
      width: clamp(Number((l as any)?.width ?? 1), 0, 256),
      align: coerceAlign((l as any)?.align),
      dash: coerceDash((l as any)?.dash),
      cap: coerceCap((l as any)?.cap),
      join: coerceJoin((l as any)?.join),
    };
  });
  return JSON.stringify(arr);
}
 
export function makeDefaultFillLayer(init?: Partial<NxFillLayer>): NxFillLayer {
  return {
    id: makeLayerId('f'),
    enabled: true,
    mode: 'solid',
    solid: '#ffffffff',
    angle: 45,
    pattern: 'stripes',
    ...init,
  };
}
 
export function makeDefaultStrokeLayer(init?: Partial<NxStrokeLayer>): NxStrokeLayer {
  return {
    id: makeLayerId('s'),
    enabled: true,
    mode: 'solid',
    solid: '#111111ff',
    width: 2,
    align: 'center',
    dash: { kind: 'solid' },
    cap: 'round',
    join: 'round',
    angle: 45,
    pattern: 'dots',
    ...init,
  };
}
 
