import { parseColor, quantizeColor } from './color';

type FabricJson = { objects?: any[]; background?: string; backgroundColor?: string } | null;

function approxArea(o: any): number {
  if (!o || typeof o !== 'object') return 0;
  const w = Number(o.width || 0);
  const h = Number(o.height || 0);
  const sx = Number(o.scaleX ?? 1);
  const sy = Number(o.scaleY ?? 1);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
  return Math.max(0, w * Math.abs(sx)) * Math.max(0, h * Math.abs(sy));
}

function approxLineInk(o: any): number {
  const sw = Number(o.strokeWidth || 0);
  const x1 = Number(o.x1 ?? 0);
  const y1 = Number(o.y1 ?? 0);
  const x2 = Number(o.x2 ?? 0);
  const y2 = Number(o.y2 ?? 0);
  if (![sw, x1, y1, x2, y2].every((x) => Number.isFinite(x))) return 0;
  const len = Math.hypot(x2 - x1, y2 - y1);
  return Math.max(0, len * sw);
}

export type VectorMetrics = {
  counts: { objects: number; textObjects: number; lineLike: number };
  ratios: { fill: number; text: number; line: number; background: number };
  strokeWidths: { min: number | null; max: number | null; distinct: number };
  shadeCount: number;
};

export function computeVectorMetrics(json: FabricJson, canvasArea: number): VectorMetrics {
  const objects = Array.isArray(json?.objects) ? json!.objects : [];

  let fillInk = 0;
  let textInk = 0;
  let lineInk = 0;

  const strokeWidths: number[] = [];
  const shades = new Set<string>();

  const bg = (json as any)?.backgroundColor ?? (json as any)?.background;
  const bgc = parseColor(bg);
  if (bgc) shades.add(quantizeColor(bgc));

  let textObjects = 0;
  let lineLike = 0;

  objects.forEach((o) => {
    const type = String(o?.type || '');

    const fill = parseColor(o?.fill);
    const stroke = parseColor(o?.stroke);
    if (fill) shades.add(quantizeColor(fill));
    if (stroke) shades.add(quantizeColor(stroke));

    const sw = Number(o?.strokeWidth);
    if (Number.isFinite(sw) && sw > 0) strokeWidths.push(sw);

    if (type === 'i-text' || type === 'textbox' || type === 'text') {
      textObjects += 1;
      textInk += approxArea(o);
      return;
    }

    if (type === 'line') {
      lineLike += 1;
      lineInk += approxLineInk(o);
      return;
    }

    if (type === 'path' || type === 'polyline' || type === 'polygon') {
      lineLike += 1;
      // Bounding-box area is a rough proxy for ink; better than nothing for v1.
      lineInk += approxArea(o);
      return;
    }

    // Default: treat as filled shape.
    fillInk += approxArea(o);
  });

  const denom = Math.max(1, canvasArea);
  const backgroundInk = Math.max(0, denom - (fillInk + textInk + lineInk));

  const distinctStroke = new Set(strokeWidths.map((x) => Math.round(x * 10) / 10)).size;
  const minSw = strokeWidths.length ? Math.min(...strokeWidths) : null;
  const maxSw = strokeWidths.length ? Math.max(...strokeWidths) : null;

  return {
    counts: { objects: objects.length, textObjects, lineLike },
    ratios: {
      fill: clamp01(fillInk / denom),
      text: clamp01(textInk / denom),
      line: clamp01(lineInk / denom),
      background: clamp01(backgroundInk / denom),
    },
    strokeWidths: { min: minSw, max: maxSw, distinct: distinctStroke },
    shadeCount: shades.size,
  };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

