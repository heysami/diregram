'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Editor } from 'tldraw';
import { findCoreFrameId } from '@/components/vision/tldraw/core/visionCoreFrames';
import { getDescendantIds, getShape } from '@/components/vision/tldraw/core/visionTldrawTraversal';
import { makeTheme, toHexOrEmpty } from '@/components/vision/tldraw/ui/style-panel/color-utils';
import { tokenToFillHex } from '@/components/vision/tldraw/autoconvert/colors';
import { parseFillLayers, parseStrokeLayers, parseStopsJsonLoose } from '@/components/vision/tldraw/paint/nxPaintLayers';

type Bucket = Record<string, number>;

function normalizeHex6(v: string): string {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  return '';
}

function uniqNonEmpty(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function addToBucket(bucket: Bucket, colorsRaw: string[], weight: number, ignoreHex6: string) {
  const colors = uniqNonEmpty(colorsRaw.map(normalizeHex6)).filter((c) => c && c !== ignoreHex6);
  if (!colors.length) return;
  const w = Number.isFinite(weight) ? Math.max(0, weight) : 0;
  if (w <= 0) return;
  const per = w / colors.length;
  for (const c of colors) bucket[c] = (bucket[c] || 0) + per;
}

function getNxFillColors(props: any): string[] {
  const layers = parseFillLayers(props?.fills);
  if (layers) {
    const out: string[] = [];
    for (const l of layers) {
      if (!l || l.enabled === false) continue;
      if (l.mode === 'solid') {
        if (typeof l.solid === 'string') out.push(l.solid);
      } else {
        const stops = parseStopsJsonLoose(l.stops);
        if (stops?.length) out.push(...stops.map((s) => s.color));
      }
    }
    return out;
  }
  const legacy = toHexOrEmpty(String(props?.fill || ''));
  return legacy ? [legacy] : [];
}

function getNxStrokeColors(props: any): string[] {
  const layers = parseStrokeLayers(props?.strokes);
  if (layers) {
    const out: string[] = [];
    for (const l of layers) {
      if (!l || l.enabled === false) continue;
      const w = Number((l as any).width ?? 0) || 0;
      if (w <= 0) continue;
      if (l.mode === 'solid') {
        if (typeof l.solid === 'string') out.push(l.solid);
      } else {
        const stops = parseStopsJsonLoose(l.stops);
        if (stops?.length) out.push(...stops.map((s) => s.color));
      }
    }
    return out;
  }
  const legacyW = Number(props?.strokeWidth ?? 1) || 0;
  if (legacyW <= 0) return [];
  const legacy = toHexOrEmpty(String(props?.stroke || ''));
  return legacy ? [legacy] : [];
}

function getAssetFrameFillHex6(editor: Editor): string {
  const assetId = findCoreFrameId(editor, 'asset');
  if (!assetId) return '';
  const frame: any = getShape(editor, assetId);
  if (!frame) return '';

  // Core containers are `nxlayout` so we can use Vision paint stacks.
  if (String(frame?.type || '') === 'nxlayout') {
    const layers = parseFillLayers(frame?.props?.fills);
    const enabled = layers ? layers.filter((l) => l && (l as any).enabled !== false) : null;
    const first = enabled && enabled.length ? (enabled[0] as any) : null;
    if (first) {
      if (String(first.mode || 'solid') === 'solid') return normalizeHex6(String(first.solid || ''));
      const stops = parseStopsJsonLoose(first.stops);
      if (stops && stops.length) return normalizeHex6(String(stops[0]?.color || ''));
    }
    // Fallback: legacy fill prop if present.
    return normalizeHex6(toHexOrEmpty(String(frame?.props?.fill || '')) || '');
  }

  const token = String(frame?.props?.color || '').trim();
  const fillStyle = String(frame?.props?.fill || '').trim();
  if (!token) return '';
  const theme = makeTheme(editor);
  const hex = tokenToFillHex(theme, token, fillStyle || 'solid', '#ffffff');
  return normalizeHex6(hex);
}

function shapeArea(editor: Editor, id: string): number {
  try {
    const b: any = (editor as any).getShapePageBounds?.(id as any);
    const w = Number(b?.w ?? b?.width ?? 0) || 0;
    const h = Number(b?.h ?? b?.height ?? 0) || 0;
    const a = w * h;
    return Number.isFinite(a) && a > 0 ? a : 0;
  } catch {
    return 0;
  }
}

function bucketToRows(bucket: Bucket): Array<{ hex: string; weight: number; pct: number }> {
  const entries = Object.entries(bucket).filter(([, w]) => Number.isFinite(w) && w > 0);
  const total = entries.reduce((acc, [, w]) => acc + Number(w), 0);
  if (!entries.length || total <= 0) return [];
  const rows = entries
    .map(([hex, w]) => ({ hex, weight: Number(w), pct: (Number(w) / total) * 100 }))
    .sort((a, b) => b.weight - a.weight);
  return rows;
}

function BarRow({ hex, pct }: { hex: string; pct: number }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm border border-black/15 shrink-0" style={{ background: hex }} title={hex} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] leading-4">
          <div className="truncate font-mono opacity-80">{hex}</div>
          <div className="tabular-nums opacity-70">{p.toFixed(p >= 10 ? 0 : 1)}%</div>
        </div>
        <div className="h-[6px] rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-black/60" style={{ width: `${p}%` }} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Array<{ hex: string; pct: number }> }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">{title}</div>
      {rows.length ? (
        <div className="space-y-2">
          {rows.slice(0, 12).map((r) => (
            <BarRow key={r.hex} hex={r.hex} pct={r.pct} />
          ))}
        </div>
      ) : (
        <div className="text-xs opacity-60">No colors found.</div>
      )}
    </div>
  );
}

export function VisionColorCompositionPanel({ editor }: { editor: Editor | null }) {
  const [docRev, setDocRev] = useState(0);

  useEffect(() => {
    if (!editor) return;
    let raf: number | null = null;
    let pending = false;
    const cleanup = editor.store.listen(
      () => {
        if (pending) return;
        pending = true;
        raf = window.requestAnimationFrame(() => {
          pending = false;
          setDocRev((v) => v + 1);
        });
      },
      { scope: 'document' as any },
    );
    return () => {
      try {
        cleanup?.();
      } catch {
        // ignore
      }
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [editor]);

  const composition = useMemo(() => {
    if (!editor) {
      return {
        shapeFill: [] as Array<{ hex: string; pct: number }>,
        shapeOutline: [] as Array<{ hex: string; pct: number }>,
        textFill: [] as Array<{ hex: string; pct: number }>,
        textOutline: [] as Array<{ hex: string; pct: number }>,
      };
    }

    const ignoreHex6 = getAssetFrameFillHex6(editor);
    const assetId = findCoreFrameId(editor, 'asset');
    const targetIds = assetId ? getDescendantIds(editor, assetId).filter((id) => id && id !== assetId) : [];

    const shapeFillBucket: Bucket = {};
    const shapeOutlineBucket: Bucket = {};
    const textFillBucket: Bucket = {};
    const textOutlineBucket: Bucket = {};

    for (const id of targetIds) {
      const s: any = getShape(editor, id);
      if (!s) continue;
      if (s.type === 'group') continue;
      if (s.type === 'frame') continue;
      if (s?.meta?.hidden === true) continue;
      // Ignore mirrored clones entirely (composition is for the asset authoring space).
      if (s?.meta?.nxMirrorSourceId) continue;

      const a = shapeArea(editor, id);
      if (a <= 0) continue;

      const t = String(s.type || '');
      const props = s.props || {};

      if (t === 'nxtext') {
        addToBucket(textFillBucket, getNxFillColors(props), a, ignoreHex6);
        addToBucket(textOutlineBucket, getNxStrokeColors(props), a, ignoreHex6);
      } else if (t === 'nxpath' || t === 'nxrect' || t === 'nxlayout') {
        addToBucket(shapeFillBucket, getNxFillColors(props), a, ignoreHex6);
        addToBucket(shapeOutlineBucket, getNxStrokeColors(props), a, ignoreHex6);
      } else {
        // Best-effort: ignore other shape types for now (keeps panel stable/cheap).
      }
    }

    return {
      shapeFill: bucketToRows(shapeFillBucket).map(({ hex, pct }) => ({ hex, pct })),
      shapeOutline: bucketToRows(shapeOutlineBucket).map(({ hex, pct }) => ({ hex, pct })),
      textFill: bucketToRows(textFillBucket).map(({ hex, pct }) => ({ hex, pct })),
      textOutline: bucketToRows(textOutlineBucket).map(({ hex, pct }) => ({ hex, pct })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docRev]);

  if (!editor) return <div className="text-xs opacity-70">Loading…</div>;

  return (
    <div className="space-y-4">
      <Section title="Shapes — Fill" rows={composition.shapeFill} />
      <Section title="Shapes — Outline" rows={composition.shapeOutline} />
      <Section title="Text — Fill" rows={composition.textFill} />
      <Section title="Text — Outline" rows={composition.textOutline} />
    </div>
  );
}

