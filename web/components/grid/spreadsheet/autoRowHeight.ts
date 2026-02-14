import type { GridRowV1, GridSheetV1 } from '@/lib/gridjson';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function countLines(s: string): number {
  if (!s) return 1;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

function hasBigMarkdown(s: string): boolean {
  // Headings or lists often want a bit more vertical space.
  return /^#{1,3}\s/m.test(s) || /^[-*]\s/m.test(s) || /^\d+\.\s/m.test(s);
}

function estimateWrappedVisualLines(value: string, colWidthPx: number): number {
  const v = String(value || '');
  if (!v) return 1;
  // Approximate usable width inside the cell (padding + borders).
  const usable = clamp((colWidthPx || 88) - 12, 40, 520);
  // Approximate average glyph width for 11px UI text.
  const avgChar = 6.2;
  let visual = 0;
  v.split('\n').forEach((line) => {
    const len = line.length || 1;
    const wraps = Math.max(1, Math.ceil((len * avgChar) / Math.max(1, usable)));
    visual += wraps;
  });
  return Math.max(1, visual);
}

export function estimateDesiredRowHeight(value: string, opts?: { colWidthPx?: number }): number | null {
  const v = String(value || '');
  if (!v.trim()) return null;
  const hardLines = countLines(v);
  const visualLines = estimateWrappedVisualLines(v, opts?.colWidthPx ?? 88);
  if (hardLines <= 1 && visualLines <= 1 && !hasBigMarkdown(v)) return null;

  const base = 36; // current minimum visual row height in the grid
  const lineH = 14; // approximate rendered line height for 11px text
  const extraLines = clamp(visualLines, 1, 16) - 1;
  const bigBonus = hasBigMarkdown(v) ? 10 : 0;
  return clamp(base + extraLines * lineH + bigBonus, base, 320);
}

export function maybeAutoExpandRowHeight(
  sheet: GridSheetV1,
  rowIdx: number,
  value: string,
  opts?: { colWidthPx?: number },
): GridSheetV1 {
  const rows = sheet.grid.rows || [];
  const row = rows[rowIdx];
  if (!row) return sheet;
  const desired = estimateDesiredRowHeight(value, opts);
  if (!desired) return sheet;
  const cur = Math.max(36, row.height ?? 22);
  if (desired <= cur) return sheet;
  const nextRows = rows.slice();
  nextRows[rowIdx] = { ...(row as GridRowV1), height: desired };
  return { ...sheet, grid: { ...sheet.grid, rows: nextRows } };
}

