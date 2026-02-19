import type { GridCardV1, GridRegionV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';

export type GridRect = { r0: number; r1: number; c0: number; c1: number };

export type GridRangeClipboardPayloadV1 = {
  version: 1;
  w: number;
  h: number;
  cells: string[][];
  regions: Array<{ cells: Array<{ dr: number; dc: number }> }>;
  cards: Array<{ dr: number; dc: number; rowspan: number; colspan: number; content: string }>;
  tables: Array<{
    dr: number;
    dc: number;
    h: number;
    w: number;
    headerRows: number;
    headerCols: number;
    footerRows: number;
    kind?: GridTableV1['kind'];
  }>;
};

function parseCoordKey(key: string): { rowId: string; colId: string } | null {
  const i = key.indexOf(':');
  if (i === -1) return null;
  const rowId = key.slice(0, i).trim();
  const colId = key.slice(i + 1).trim();
  if (!rowId || !colId) return null;
  return { rowId, colId };
}

function overlapsRect(r0: number, c0: number, r1: number, c1: number, rect: GridRect) {
  return !(r1 < rect.r0 || r0 > rect.r1 || c1 < rect.c0 || c0 > rect.c1);
}

export function coerceGridRangeClipboardPayloadV1(x: unknown): GridRangeClipboardPayloadV1 | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.version !== 1) return null;
  const cells = r.cells;
  if (!Array.isArray(cells)) return null;
  const w = Number(r.w);
  const h = Number(r.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return x as GridRangeClipboardPayloadV1;
}

export function buildGridRangeClipboardPayloadV1(opts: {
  rect: GridRect;
  getValue: (r: number, c: number) => string;
  regions: GridRegionV1[];
  cards: GridCardV1[];
  tables: GridTableV1[];
  rowIndexById: Map<string, number>;
  colIndexById: Map<string, number>;
}): GridRangeClipboardPayloadV1 {
  const { rect, getValue, regions, cards, tables, rowIndexById, colIndexById } = opts;
  const h = rect.r1 - rect.r0 + 1;
  const w = rect.c1 - rect.c0 + 1;
  const cellOut: string[][] = [];
  for (let dr = 0; dr < h; dr++) {
    const rowVals: string[] = [];
    for (let dc = 0; dc < w; dc++) {
      rowVals.push(String(getValue(rect.r0 + dr, rect.c0 + dc) ?? ''));
    }
    cellOut.push(rowVals);
  }

  const parseKeyToIdx = (k: string): { r: number; c: number } | null => {
    const parsed = parseCoordKey(k);
    if (!parsed) return null;
    const rr = rowIndexById.get(parsed.rowId);
    const cc = colIndexById.get(parsed.colId);
    if (rr === undefined || cc === undefined) return null;
    return { r: rr, c: cc };
  };

  const regionsOut: GridRangeClipboardPayloadV1['regions'] = [];
  for (const rg of regions || []) {
    const idxs = (rg.cells || []).map(parseKeyToIdx).filter(Boolean) as Array<{ r: number; c: number }>;
    if (!idxs.length) continue;
    const fullyInside = idxs.every((p) => p.r >= rect.r0 && p.r <= rect.r1 && p.c >= rect.c0 && p.c <= rect.c1);
    if (!fullyInside) continue;
    regionsOut.push({
      cells: idxs.map((p) => ({ dr: p.r - rect.r0, dc: p.c - rect.c0 })),
    });
  }

  const cardsOut: GridRangeClipboardPayloadV1['cards'] = [];
  for (const card of cards || []) {
    const rIdx = rowIndexById.get(card.rowId);
    const cIdx = colIndexById.get(card.colId);
    if (rIdx === undefined || cIdx === undefined) continue;
    const rowspan = Math.max(1, Math.floor(card.rowspan || 1));
    const colspan = Math.max(1, Math.floor(card.colspan || 1));
    const r0 = rIdx;
    const c0 = cIdx;
    const r1 = rIdx + rowspan - 1;
    const c1 = cIdx + colspan - 1;
    const fullyInside = r0 >= rect.r0 && r1 <= rect.r1 && c0 >= rect.c0 && c1 <= rect.c1;
    if (!fullyInside) continue;
    cardsOut.push({ dr: r0 - rect.r0, dc: c0 - rect.c0, rowspan, colspan, content: String(card.content || '') });
  }

  const tablesOut: GridRangeClipboardPayloadV1['tables'] = [];
  for (const t of tables || []) {
    const tRowIds = t.rowIds || [];
    const tColIds = t.colIds || [];
    if (!tRowIds.length || !tColIds.length) continue;
    const tR0 = rowIndexById.get(tRowIds[0]!);
    const tR1 = rowIndexById.get(tRowIds[tRowIds.length - 1]!);
    const tC0 = colIndexById.get(tColIds[0]!);
    const tC1 = colIndexById.get(tColIds[tColIds.length - 1]!);
    if (tR0 === undefined || tR1 === undefined || tC0 === undefined || tC1 === undefined) continue;

    const oR0 = Math.max(rect.r0, tR0);
    const oR1 = Math.min(rect.r1, tR1);
    const oC0 = Math.max(rect.c0, tC0);
    const oC1 = Math.min(rect.c1, tC1);
    if (oR0 > oR1 || oC0 > oC1) continue;

    const oh = oR1 - oR0 + 1;
    const ow = oC1 - oC0 + 1;
    const offR = oR0 - tR0;
    const offC = oC0 - tC0;
    const totalRows = tRowIds.length;
    const totalCols = tColIds.length;
    const hr = Math.max(0, Math.min(totalRows, Math.floor(t.headerRows || 0)));
    const hc = Math.max(0, Math.min(totalCols, Math.floor(t.headerCols || 0)));
    const fr = Math.max(0, Math.min(Math.max(0, totalRows - hr), Math.floor(t.footerRows || 0)));

    const headerRowsInOverlap = offR < hr ? Math.max(0, Math.min(hr - offR, oh)) : 0;
    const headerColsInOverlap = offC < hc ? Math.max(0, Math.min(hc - offC, ow)) : 0;

    const footerStart = Math.max(0, totalRows - fr);
    const overlapEndInTable = offR + oh - 1;
    const overlapFooterStart = Math.max(offR, footerStart);
    const footerRowsInOverlap =
      fr > 0 && overlapEndInTable >= footerStart
        ? Math.max(0, Math.min(overlapEndInTable, totalRows - 1) - overlapFooterStart + 1)
        : 0;

    tablesOut.push({
      dr: oR0 - rect.r0,
      dc: oC0 - rect.c0,
      h: oh,
      w: ow,
      headerRows: headerRowsInOverlap,
      headerCols: headerColsInOverlap,
      footerRows: footerRowsInOverlap,
      ...(t.kind ? { kind: t.kind } : null),
    });
  }

  return { version: 1, w, h, cells: cellOut, regions: regionsOut, cards: cardsOut, tables: tablesOut };
}

export function nextRegionId(existing: GridRegionV1[]): string {
  let max = 0;
  (existing || []).forEach((r) => {
    const m = String(r.id || '').match(/reg-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  });
  return `reg-${max + 1}`;
}

export function nextTableId(existing: GridTableV1[]): string {
  let max = 0;
  (existing || []).forEach((t) => {
    const m = String(t.id || '').match(/tbl-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  });
  return `tbl-${max + 1}`;
}

export function nextCardId(existing: GridCardV1[]): string {
  let max = 0;
  (existing || []).forEach((c) => {
    const m = String(c.id || '').match(/card-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  });
  return `card-${max + 1}`;
}

export function applyMatrixToCells(opts: {
  baseCells: GridSheetV1['grid']['cells'];
  start: { r: number; c: number };
  matrix: string[][];
  rows: Array<{ id: string }>;
  cols: Array<{ id: string }>;
  getCoordKey: (r: number, c: number) => string;
}): GridSheetV1['grid']['cells'] {
  const { baseCells, start, matrix, rows, cols, getCoordKey } = opts;
  const next = { ...(baseCells || {}) };
  matrix.forEach((row, dr) => {
    row.forEach((val, dc) => {
      const rr = start.r + dr;
      const cc = start.c + dc;
      if (rr >= rows.length || cc >= cols.length) return;
      const k = getCoordKey(rr, cc);
      const v = String(val ?? '');
      if (!v.trim()) delete next[k];
      else next[k] = { value: v };
    });
  });
  return next;
}

export function clearGridRange(opts: {
  sheet: GridSheetV1;
  rect: GridRect;
  rows: Array<{ id: string }>;
  cols: Array<{ id: string }>;
  getCoordKey: (r: number, c: number) => string;
  rowIndexById: Map<string, number>;
  colIndexById: Map<string, number>;
}): GridSheetV1 {
  const { sheet: s, rect, rows, cols, getCoordKey, rowIndexById, colIndexById } = opts;
  const nextCells = { ...(s.grid.cells || {}) };
  for (let rr = rect.r0; rr <= rect.r1; rr++) {
    for (let cc = rect.c0; cc <= rect.c1; cc++) {
      if (rr < 0 || cc < 0 || rr >= rows.length || cc >= cols.length) continue;
      const k = getCoordKey(rr, cc);
      delete nextCells[k];
    }
  }

  const parseKeyToIdx = (k: string): { r: number; c: number } | null => {
    const parsed = parseCoordKey(k);
    if (!parsed) return null;
    const rr = rowIndexById.get(parsed.rowId);
    const cc = colIndexById.get(parsed.colId);
    if (rr === undefined || cc === undefined) return null;
    return { r: rr, c: cc };
  };

  const nextRegions = (s.grid.regions || []).filter((rg) => {
    // Drop any region that overlaps the rect.
    for (const k of rg.cells || []) {
      const idx = parseKeyToIdx(k);
      if (!idx) continue;
      if (idx.r >= rect.r0 && idx.r <= rect.r1 && idx.c >= rect.c0 && idx.c <= rect.c1) return false;
    }
    return true;
  });

  const nextTables = (s.grid.tables || []).filter((t) => {
    const r0 = rowIndexById.get(t.rowIds?.[0] || '');
    const r1 = rowIndexById.get(t.rowIds?.[Math.max(0, (t.rowIds || []).length - 1)] || '');
    const c0 = colIndexById.get(t.colIds?.[0] || '');
    const c1 = colIndexById.get(t.colIds?.[Math.max(0, (t.colIds || []).length - 1)] || '');
    if (r0 === undefined || r1 === undefined || c0 === undefined || c1 === undefined) return true;
    return !overlapsRect(r0, c0, r1, c1, rect);
  });

  const nextCards = (s.cards || []).filter((card) => {
    const rIdx = rowIndexById.get(card.rowId);
    const cIdx = colIndexById.get(card.colId);
    if (rIdx === undefined || cIdx === undefined) return true;
    const r0 = rIdx;
    const c0 = cIdx;
    const r1 = rIdx + Math.max(1, Math.floor(card.rowspan || 1)) - 1;
    const c1 = cIdx + Math.max(1, Math.floor(card.colspan || 1)) - 1;
    return !overlapsRect(r0, c0, r1, c1, rect);
  });

  return { ...s, cards: nextCards, grid: { ...s.grid, cells: nextCells, regions: nextRegions, tables: nextTables } };
}

export function applyInternalGridRangePaste(opts: {
  sheet: GridSheetV1;
  payload: GridRangeClipboardPayloadV1;
  start: { r: number; c: number };
  rows: Array<{ id: string }>;
  cols: Array<{ id: string }>;
  getCoordKey: (r: number, c: number) => string;
  rowIndexById: Map<string, number>;
  colIndexById: Map<string, number>;
}): GridSheetV1 {
  const { sheet, payload, start, rows, cols, getCoordKey, rowIndexById, colIndexById } = opts;
  const h = Math.max(0, Math.floor(payload.h || payload.cells.length || 0));
  const w = Math.max(0, Math.floor(payload.w || 0));
  if (!h || !w) return sheet;

  const targetRect: GridRect = {
    r0: start.r,
    c0: start.c,
    r1: Math.min(rows.length - 1, start.r + h - 1),
    c1: Math.min(cols.length - 1, start.c + w - 1),
  };
  const cleared = clearGridRange({ sheet, rect: targetRect, rows, cols, getCoordKey, rowIndexById, colIndexById });
  const nextCells = applyMatrixToCells({ baseCells: cleared.grid.cells || {}, start, matrix: payload.cells || [], rows, cols, getCoordKey });

  const nextRegions = [...(cleared.grid.regions || [])];
  for (const rg of payload.regions || []) {
    const coords: string[] = [];
    for (const cell of rg.cells || []) {
      const rr = start.r + Number(cell.dr || 0);
      const cc = start.c + Number(cell.dc || 0);
      if (rr < 0 || cc < 0 || rr >= rows.length || cc >= cols.length) continue;
      coords.push(getCoordKey(rr, cc));
    }
    if (coords.length >= 2) {
      nextRegions.push({ id: nextRegionId(nextRegions), cells: coords, value: '' });
    }
  }

  const nextCards = [...(cleared.cards || [])];
  for (const c of payload.cards || []) {
    const rr = start.r + Number(c.dr || 0);
    const cc = start.c + Number(c.dc || 0);
    if (rr < 0 || cc < 0 || rr >= rows.length || cc >= cols.length) continue;
    const rowspan = Math.max(1, Math.floor(Number(c.rowspan || 1)));
    const colspan = Math.max(1, Math.floor(Number(c.colspan || 1)));
    if (rr + rowspan - 1 >= rows.length) continue;
    if (cc + colspan - 1 >= cols.length) continue;
    nextCards.push({
      id: nextCardId(nextCards),
      rowId: rows[rr]!.id,
      colId: cols[cc]!.id,
      rowspan,
      colspan,
      content: String(c.content || ''),
    });
  }

  const nextTables = [...(cleared.grid.tables || [])];
  for (const t of payload.tables || []) {
    const startR = start.r + Number(t.dr || 0);
    const startC = start.c + Number(t.dc || 0);
    const th = Math.max(1, Math.floor(Number(t.h || 1)));
    const tw = Math.max(1, Math.floor(Number(t.w || 1)));
    if (startR < 0 || startC < 0) continue;
    if (startR + th - 1 >= rows.length) continue;
    if (startC + tw - 1 >= cols.length) continue;
    const rowIds = rows.slice(startR, startR + th).map((r) => r.id);
    const colIds = cols.slice(startC, startC + tw).map((c) => c.id);
    const headerRows = Math.max(0, Math.min(rowIds.length, Math.floor(Number(t.headerRows || 0))));
    const headerCols = Math.max(0, Math.min(colIds.length, Math.floor(Number(t.headerCols || 0))));
    const footerRows = Math.max(0, Math.min(Math.max(0, rowIds.length - headerRows), Math.floor(Number(t.footerRows || 0))));
    nextTables.push({
      id: nextTableId(nextTables),
      rowIds,
      colIds,
      headerRows,
      headerCols,
      footerRows,
      ...(t.kind ? { kind: t.kind } : null),
    });
  }

  return { ...cleared, cards: nextCards, grid: { ...cleared.grid, cells: nextCells, regions: nextRegions, tables: nextTables } };
}

export function applyExternalMatrixPaste(opts: {
  sheet: GridSheetV1;
  matrix: string[][];
  start: { r: number; c: number };
  rows: Array<{ id: string }>;
  cols: Array<{ id: string }>;
  getCoordKey: (r: number, c: number) => string;
  rowIndexById: Map<string, number>;
  colIndexById: Map<string, number>;
}): GridSheetV1 {
  const { sheet, matrix, start, rows, cols, getCoordKey, rowIndexById, colIndexById } = opts;
  const h = matrix.length;
  const w = Math.max(0, ...matrix.map((r) => r.length));
  if (!h || !w) return sheet;
  const targetRect: GridRect = {
    r0: start.r,
    c0: start.c,
    r1: Math.min(rows.length - 1, start.r + h - 1),
    c1: Math.min(cols.length - 1, start.c + w - 1),
  };
  const cleared = clearGridRange({ sheet, rect: targetRect, rows, cols, getCoordKey, rowIndexById, colIndexById });
  const nextCells = applyMatrixToCells({ baseCells: cleared.grid.cells || {}, start, matrix, rows, cols, getCoordKey });
  return { ...cleared, grid: { ...cleared.grid, cells: nextCells } };
}

