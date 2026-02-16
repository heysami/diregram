'use client';

import type { VisionCellV1 } from '@/lib/visionjson';
import { computeVectorMetrics } from '@/components/vision/monitoring/vectorMetrics';
import { computeUiMetrics } from '@/components/vision/monitoring/uiMetrics';

export function VisionMonitoringPanel({
  cell,
  canvasPx,
}: {
  cell: VisionCellV1;
  canvasPx: number;
}) {
  const json = (cell.fabric as any) || null;
  const canvasArea = canvasPx * canvasPx;

  if (cell.kind === 'ui') {
    const m = computeUiMetrics(json);
    return (
      <div className="border p-2 space-y-2">
        <div className="text-sm font-semibold">Monitoring (UI Sample)</div>
        <div className="text-xs">
          <div><span className="opacity-70">Text objects:</span> <span className="font-semibold">{m.text.count}</span></div>
          <div><span className="opacity-70">Font sizes:</span> <span className="font-semibold">{m.text.fontSizeDistinct}</span> distinct</div>
          <div><span className="opacity-70">Font size range:</span> <span className="font-semibold">{fmtRange(m.text.fontSizeMin, m.text.fontSizeMax)}</span></div>
          <div><span className="opacity-70">Avg vertical gap:</span> <span className="font-semibold">{fmtNum(m.spacing.avgVerticalGapPx)} px</span></div>
          <div><span className="opacity-70">Avg horizontal gap:</span> <span className="font-semibold">{fmtNum(m.spacing.avgHorizontalGapPx)} px</span></div>
          <div><span className="opacity-70">Shade count:</span> <span className="font-semibold">{m.color.shadeCount}</span></div>
          <div><span className="opacity-70">Hue variation:</span> <span className="font-semibold">{m.color.hueRangeDeg === null ? '—' : `${m.color.hueRangeDeg}°`}</span></div>
        </div>
        {m.text.fontSizeHistogram.length ? (
          <details>
            <summary className="text-xs cursor-pointer select-none">Font size histogram</summary>
            <div className="mt-2 text-[11px] space-y-1">
              {m.text.fontSizeHistogram.map((h) => (
                <div key={h.size}>
                  <span className="opacity-70">{h.size}px</span> — <span className="font-semibold">{h.count}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    );
  }

  if (cell.kind === 'vector') {
    const m = computeVectorMetrics(json, canvasArea);
    return (
      <div className="border p-2 space-y-2">
        <div className="text-sm font-semibold">Monitoring (Vector Illustration)</div>
        <div className="text-xs space-y-1">
          <div><span className="opacity-70">Objects:</span> <span className="font-semibold">{m.counts.objects}</span></div>
          <div><span className="opacity-70">Text objects:</span> <span className="font-semibold">{m.counts.textObjects}</span></div>
          <div><span className="opacity-70">Line-like:</span> <span className="font-semibold">{m.counts.lineLike}</span></div>
          <div><span className="opacity-70">Fill ratio:</span> <span className="font-semibold">{pct(m.ratios.fill)}</span></div>
          <div><span className="opacity-70">Text ratio:</span> <span className="font-semibold">{pct(m.ratios.text)}</span></div>
          <div><span className="opacity-70">Line ratio:</span> <span className="font-semibold">{pct(m.ratios.line)}</span></div>
          <div><span className="opacity-70">Background ratio:</span> <span className="font-semibold">{pct(m.ratios.background)}</span></div>
          <div><span className="opacity-70">Stroke widths:</span> <span className="font-semibold">{fmtRange(m.strokeWidths.min, m.strokeWidths.max)}</span> ({m.strokeWidths.distinct} distinct)</div>
          <div><span className="opacity-70">Shade count:</span> <span className="font-semibold">{m.shadeCount}</span></div>
        </div>
        <div className="text-[11px] opacity-60">
          v1 heuristics (area proxies). We can refine these later.
        </div>
      </div>
    );
  }

  // Image cells: monitoring comes later (AI polish/style/etc).
  return (
    <div className="border p-2">
      <div className="text-sm font-semibold">Monitoring (Image / Photography)</div>
      <div className="text-[11px] opacity-70">Coming soon (polish level, style, rendering analysis).</div>
    </div>
  );
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function fmtNum(x: number | null) {
  return x === null ? '—' : String(x);
}

function fmtRange(a: number | null, b: number | null) {
  if (a === null || b === null) return '—';
  if (Math.round(a * 10) / 10 === Math.round(b * 10) / 10) return `${Math.round(a * 10) / 10}px`;
  return `${Math.round(a * 10) / 10}px–${Math.round(b * 10) / 10}px`;
}

