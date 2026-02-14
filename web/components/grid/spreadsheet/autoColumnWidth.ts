import type { GridSheetV1 } from '@/lib/gridjson';
import { listRecognizedMacros } from '@/lib/grid-cell-macros';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function estimateWidthFromMacros(value: string): number | null {
  const macros = listRecognizedMacros(value);
  if (!macros.length) return null;

  // Conservative heuristics; we only ever expand, never shrink.
  let w = 88;
  for (const m of macros) {
    const inner = String(m.inner || '');
    const colon = inner.indexOf(':');
    if (colon === -1) continue;
    const name = inner.slice(0, colon).trim();
    const body = inner.slice(colon + 1).trim();

    if (name === 'pills') {
      const tags = body.split(',').map((s) => s.trim()).filter(Boolean);
      const shown = tags.slice(0, 3);
      const sum = shown.reduce((acc, t) => acc + clamp(t.length * 7 + 24, 42, 96), 0);
      w = Math.max(w, clamp(16 + sum + (shown.length - 1) * 6, 120, 380));
      continue;
    }
    if (name === 'people') {
      const ppl = body.split(',').map((s) => s.trim()).filter(Boolean);
      const n = Math.min(6, ppl.length);
      w = Math.max(w, clamp(16 + n * 22 + 22, 120, 260));
      continue;
    }
    if (name === 'seg') {
      // Body is `opts=a|b|c;value=x` in our canonical form
      const opts = (body.match(/opts=([^;]+)/)?.[1] || '').split('|').map((s) => s.trim()).filter(Boolean);
      const sum = opts.reduce((acc, o) => acc + clamp(o.length * 7 + 18, 34, 120), 0);
      w = Math.max(w, clamp(10 + sum, 140, 520));
      continue;
    }
    if (name === 'date') {
      w = Math.max(w, clamp(90 + body.length * 6, 140, 320));
      continue;
    }
    if (name === 'progress') {
      w = Math.max(w, 140);
      continue;
    }
    if (name === 'check' || name === 'radio') {
      w = Math.max(w, 110);
      continue;
    }
  }

  return w;
}

export function maybeAutoExpandColumnWidth(sheet: GridSheetV1, colIdx: number, value: string): GridSheetV1 {
  const cols = sheet.grid.columns || [];
  const col = cols[colIdx];
  if (!col) return sheet;
  const desired = estimateWidthFromMacros(String(value || ''));
  if (!desired) return sheet;
  const cur = col.width ?? 88;
  if (desired <= cur) return sheet;
  const nextCols = cols.slice();
  nextCols[colIdx] = { ...col, width: desired };
  return { ...sheet, grid: { ...sheet.grid, columns: nextCols } };
}

