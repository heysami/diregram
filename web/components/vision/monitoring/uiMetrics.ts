import { parseColor, quantizeColor, rgbToHue } from './color';

type FabricJson = { objects?: any[] } | null;

type Box = { left: number; top: number; width: number; height: number; fontSize?: number };

function getBox(o: any): Box | null {
  if (!o || typeof o !== 'object') return null;
  const left = Number(o.left ?? 0);
  const top = Number(o.top ?? 0);
  const w = Number(o.width ?? 0) * Math.abs(Number(o.scaleX ?? 1));
  const h = Number(o.height ?? 0) * Math.abs(Number(o.scaleY ?? 1));
  if (![left, top, w, h].every((x) => Number.isFinite(x))) return null;
  return { left, top, width: Math.max(0, w), height: Math.max(0, h), fontSize: Number(o.fontSize) || undefined };
}

export type UiMetrics = {
  text: {
    count: number;
    fontSizeDistinct: number;
    fontSizeMin: number | null;
    fontSizeMax: number | null;
    fontSizeHistogram: Array<{ size: number; count: number }>;
  };
  spacing: {
    avgVerticalGapPx: number | null;
    avgHorizontalGapPx: number | null;
  };
  color: {
    shadeCount: number;
    hueRangeDeg: number | null;
  };
};

export function computeUiMetrics(json: FabricJson): UiMetrics {
  const objects = Array.isArray(json?.objects) ? json!.objects : [];
  const textObjs = objects.filter((o) => {
    const t = String(o?.type || '');
    return t === 'i-text' || t === 'textbox' || t === 'text';
  });

  const boxes: Box[] = textObjs.map(getBox).filter(Boolean) as Box[];
  const fontSizes = boxes.map((b) => b.fontSize).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const sizeCounts = new Map<number, number>();
  fontSizes.forEach((s) => sizeCounts.set(s, (sizeCounts.get(s) || 0) + 1));
  const histogram = Array.from(sizeCounts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => ({ size, count }));

  // Spacing heuristics: average nearest-neighbor gap among text boxes.
  const avgVerticalGapPx = avgNearestGap(boxes, 'vertical');
  const avgHorizontalGapPx = avgNearestGap(boxes, 'horizontal');

  // Color heuristics: distinct quantized shades + hue range.
  const shades = new Set<string>();
  const hues: number[] = [];
  objects.forEach((o) => {
    const fill = parseColor(o?.fill);
    const stroke = parseColor(o?.stroke);
    [fill, stroke].forEach((c) => {
      if (!c) return;
      shades.add(quantizeColor(c));
      hues.push(rgbToHue(c));
    });
  });
  const hueRangeDeg = hues.length ? computeCircularHueRange(hues) : null;

  return {
    text: {
      count: textObjs.length,
      fontSizeDistinct: sizeCounts.size,
      fontSizeMin: fontSizes.length ? Math.min(...fontSizes) : null,
      fontSizeMax: fontSizes.length ? Math.max(...fontSizes) : null,
      fontSizeHistogram: histogram,
    },
    spacing: { avgVerticalGapPx, avgHorizontalGapPx },
    color: { shadeCount: shades.size, hueRangeDeg },
  };
}

function avgNearestGap(boxes: Box[], axis: 'vertical' | 'horizontal'): number | null {
  if (boxes.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 0; i < boxes.length; i++) {
    let best: number | null = null;
    const a = boxes[i];
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const b = boxes[j];
      const g =
        axis === 'vertical'
          ? gap1d(a.top, a.top + a.height, b.top, b.top + b.height)
          : gap1d(a.left, a.left + a.width, b.left, b.left + b.width);
      if (g === null) continue;
      if (best === null || g < best) best = g;
    }
    if (best !== null) gaps.push(best);
  }
  if (gaps.length === 0) return null;
  return Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
}

function gap1d(a1: number, a2: number, b1: number, b2: number): number | null {
  // If overlapping, gap is 0.
  if (b1 <= a2 && b2 >= a1) return 0;
  if (b1 > a2) return b1 - a2;
  if (a1 > b2) return a1 - b2;
  return null;
}

function computeCircularHueRange(hues: number[]): number {
  const vals = hues.map((h) => ((h % 360) + 360) % 360).sort((a, b) => a - b);
  if (vals.length <= 1) return 0;
  // Find max gap between adjacent hues on circle; range = 360 - maxGap.
  let maxGap = 0;
  for (let i = 0; i < vals.length; i++) {
    const cur = vals[i];
    const next = vals[(i + 1) % vals.length] + (i + 1 === vals.length ? 360 : 0);
    maxGap = Math.max(maxGap, next - cur);
  }
  return Math.round((360 - maxGap) * 10) / 10;
}

