'use client';

import type { Editor } from 'tldraw';

type AnyShape = {
  id: unknown;
  type: string;
  x?: number;
  y?: number;
  rotation?: number;
  props?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type AnnotKind = 'line' | 'rect';
type AnnotBaseShape = AnyShape & {
  meta: Record<string, unknown> & { nxAnnotationKind: AnnotKind };
};
type AnnotTextShape = AnyShape & {
  type: 'text';
  meta: Record<string, unknown> & { nxAnnotationTextFor: string };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getShapeText(editor: Editor, shape: AnyShape): string {
  // Prefer util-based extraction (handles rich text), fall back to props.text.
  try {
    const util = (editor as unknown as { getShapeUtil?: (s: unknown) => any }).getShapeUtil?.(shape as any);
    const txt = util?.getText?.(shape as any);
    if (typeof txt === 'string' && txt.trim()) return txt.trim();
  } catch {
    // ignore
  }
  const t = shape?.props?.text;
  return typeof t === 'string' ? t.trim() : '';
}

function isAnnot(shape: AnyShape | null): shape is AnnotBaseShape {
  const k = String(shape?.meta?.nxAnnotationKind || '');
  return k === 'line' || k === 'rect';
}

function isAnnotText(shape: AnyShape | null): shape is AnnotTextShape {
  if (!shape) return false;
  if (shape.type !== 'text') return false;
  const forId = String(shape.meta?.nxAnnotationTextFor || '').trim();
  return !!forId;
}

function findAnnotationTextShape(editor: Editor, baseId: string): AnyShape | null {
  if (!baseId) return null;
  let ids: string[] = [];
  try {
    const pageIds = (editor as any).getCurrentPageShapeIds?.();
    ids = Array.from(pageIds || []).map(String);
  } catch {
    ids = [];
  }
  for (const sid of ids) {
    try {
      const s = (editor as any).getShape?.(sid as any) as AnyShape | null;
      if (!s || s.type !== 'text') continue;
      const forId = String(s.meta?.nxAnnotationTextFor || '').trim();
      if (forId && forId === baseId) return s;
    } catch {
      // ignore
    }
  }
  return null;
}

function computeSemantic(editor: Editor, shape: AnyShape): { metaPatch: Record<string, unknown> } | null {
  const kind = String(shape.meta?.nxAnnotationKind || '');
  const baseId = String(shape.id || '');
  const labelShape = findAnnotationTextShape(editor, baseId);
  const text = labelShape ? getShapeText(editor, labelShape) : getShapeText(editor, shape);

  if (kind === 'rect') {
    try {
      const b: any = (editor as any).getShapePageBounds?.(shape.id as any);
      if (!b) return null;
      const x = Number(b.x ?? b.minX ?? 0);
      const y = Number(b.y ?? b.minY ?? 0);
      const w = Number(b.w ?? b.width ?? 0);
      const h = Number(b.h ?? b.height ?? 0);
      const rot = Number(shape.rotation ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null;

      const payload = {
        kind: 'rect',
        x: round2(x),
        y: round2(y),
        w: round2(w),
        h: round2(h),
        rotation: round2(rot),
        text,
      };

      const semanticText = `Rect annotation @(${payload.x},${payload.y}) size(${payload.w}×${payload.h}) rot(${payload.rotation}) "${text}"`;
      return { metaPatch: { nxAnnotation: payload, nxSemanticText: semanticText } };
    } catch {
      return null;
    }
  }

  if (kind === 'line') {
    try {
      const t: any = (editor as any).getShapePageTransform?.(shape.id as any);
      const startRaw: any = (shape.props || {})?.start;
      const endRaw: any = (shape.props || {})?.end;
      const sx0 = Number(startRaw?.x ?? 0);
      const sy0 = Number(startRaw?.y ?? 0);
      const ex0 = Number(endRaw?.x ?? 0);
      const ey0 = Number(endRaw?.y ?? 0);
      if (!Number.isFinite(sx0) || !Number.isFinite(sy0) || !Number.isFinite(ex0) || !Number.isFinite(ey0)) return null;

      const apply = (p: { x: number; y: number }) => {
        try {
          const out = t?.applyToPoint?.(p);
          const x = Number(out?.x);
          const y = Number(out?.y);
          if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
        } catch {
          // ignore
        }
        // Fallback: assume props are already in page space.
        return p;
      };

      const s = apply({ x: sx0, y: sy0 });
      const e = apply({ x: ex0, y: ey0 });

      const dx = e.x - s.x;
      const dy = e.y - s.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;

      const payload = {
        kind: 'line',
        start: { x: round2(s.x), y: round2(s.y) },
        end: { x: round2(e.x), y: round2(e.y) },
        length: round2(len),
        directionDeg: round2(deg),
        text,
      };

      const semanticText = `Line annotation (${payload.start.x},${payload.start.y})→(${payload.end.x},${payload.end.y}) dir(${payload.directionDeg}°) len(${payload.length}) "${text}"`;
      return { metaPatch: { nxAnnotation: payload, nxSemanticText: semanticText } };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Keeps `meta.nxAnnotation` + `meta.nxSemanticText` in sync for annotation shapes.
 * This makes the "semantic meaning" durable inside the `visionjson` markdown payload.
 */
export function installVisionAnnotationSemanticSync(editor: Editor): () => void {
  let mutating = false;
  const lastKeyById = new Map<string, string>();
  const timers = new Map<string, number>();

  const clearTimer = (id: string) => {
    const t = timers.get(id);
    if (t) window.clearTimeout(t);
    timers.delete(id);
  };

  const schedule = (id: string) => {
    clearTimer(id);
    const t = window.setTimeout(() => {
      if (mutating) return;
      let shape: AnyShape | null = null;
      try {
        shape = (editor as any).getShape?.(id as any) as AnyShape | null;
      } catch {
        shape = null;
      }
      if (!shape || !isAnnot(shape)) return;

      const computed = computeSemantic(editor, shape);
      if (!computed) return;

      const mergedMeta = { ...(shape.meta || {}), ...(computed.metaPatch || {}) };
      const key = JSON.stringify(mergedMeta.nxAnnotation || {}) + '|' + String(mergedMeta.nxSemanticText || '');
      if (key === lastKeyById.get(id)) return;
      lastKeyById.set(id, key);

      mutating = true;
      try {
        (editor as any).updateShapes?.([{ id: shape.id, type: shape.type, meta: mergedMeta }]);
      } catch {
        // ignore
      } finally {
        window.setTimeout(() => {
          mutating = false;
        }, 0);
      }
    }, 120);
    timers.set(id, t);
  };

  const cleanup = (editor as any).store?.listen?.(
    (entry: any) => {
      if (mutating) return;
      const added = entry?.changes?.added || {};
      const updated = entry?.changes?.updated || {};

      for (const [rid, rec] of Object.entries<any>(added)) {
        if (!rec || rec.typeName !== 'shape') continue;
        const id = String((rec as any).id || rid);
        const shape = rec as AnyShape;
        if (isAnnot(shape)) {
          schedule(id);
          continue;
        }
        if (isAnnotText(shape)) {
          const baseId = String(shape.meta?.nxAnnotationTextFor || '').trim();
          if (baseId) schedule(baseId);
        }
      }
      for (const [rid, pair] of Object.entries<any>(updated)) {
        const to = Array.isArray(pair) ? pair[1] : null;
        if (!to || to.typeName !== 'shape') continue;
        const id = String((to as any).id || rid);
        const shape = to as AnyShape;
        if (isAnnot(shape)) {
          schedule(id);
          continue;
        }
        if (isAnnotText(shape)) {
          const baseId = String(shape.meta?.nxAnnotationTextFor || '').trim();
          if (baseId) schedule(baseId);
        }
      }
    },
    { scope: 'document' as any },
  );

  return () => {
    try {
      cleanup?.();
    } catch {
      // ignore
    }
    for (const id of timers.keys()) clearTimer(id);
    timers.clear();
    lastKeyById.clear();
  };
}

