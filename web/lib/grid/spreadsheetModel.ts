import type { GridCardV1, GridRegionV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';

export type SelectionRect = { r0: number; r1: number; c0: number; c1: number };

export function parseCoordKey(key: string): { rowId: string; colId: string } | null {
  const i = key.indexOf(':');
  if (i === -1) return null;
  const rowId = key.slice(0, i).trim();
  const colId = key.slice(i + 1).trim();
  if (!rowId || !colId) return null;
  return { rowId, colId };
}

function nextNumericId(prefix: string, existingIds: string[]): string {
  let max = 0;
  existingIds.forEach((id) => {
    const m = String(id).match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${max + 1}`;
}

export function setCellValue(sheet: GridSheetV1, rowId: string, colId: string, value: string): GridSheetV1 {
  const key = `${rowId}:${colId}`;
  const nextCells = { ...(sheet.grid.cells || {}) };
  if (!value || value.trim().length === 0) delete nextCells[key];
  else nextCells[key] = { value };
  return { ...sheet, grid: { ...sheet.grid, cells: nextCells } };
}

export function addRow(sheet: GridSheetV1): GridSheetV1 {
  const rows = sheet.grid.rows || [];
  const nextId = `r-${rows.length + 1}`;
  const nextRows = [...rows, { id: nextId, height: 22 }];
  return { ...sheet, grid: { ...sheet.grid, rows: nextRows } };
}

export function addColumn(sheet: GridSheetV1): GridSheetV1 {
  const cols = sheet.grid.columns || [];
  const nextId = `c-${cols.length + 1}`;
  const nextCols = [...cols, { id: nextId, width: 88 }];
  return { ...sheet, grid: { ...sheet.grid, columns: nextCols } };
}

export function createRegionFromCells(sheet: GridSheetV1, coordKeys: string[]): { sheet: GridSheetV1; regionId: string } {
  const regions = sheet.grid.regions || [];
  const nextId = nextNumericId('reg', regions.map((r) => r.id));
  const nextRegions: GridRegionV1[] = [...regions, { id: nextId, cells: coordKeys.slice(), value: '' }];
  return { sheet: { ...sheet, grid: { ...sheet.grid, regions: nextRegions } }, regionId: nextId };
}

export function deleteRegion(sheet: GridSheetV1, regionId: string): GridSheetV1 {
  const regions = sheet.grid.regions || [];
  return { ...sheet, grid: { ...sheet.grid, regions: regions.filter((r) => r.id !== regionId) } };
}

export function createTableFromSelection(sheet: GridSheetV1, rect: SelectionRect): { sheet: GridSheetV1; tableId: string } {
  const rows = sheet.grid.rows || [];
  const cols = sheet.grid.columns || [];
  const rowIds = rows.slice(rect.r0, rect.r1 + 1).map((r) => r.id);
  const colIds = cols.slice(rect.c0, rect.c1 + 1).map((c) => c.id);
  const existing = sheet.grid.tables || [];
  const tableId = nextNumericId('tbl', existing.map((t) => t.id));
  const nextTable: GridTableV1 = {
    id: tableId,
    rowIds,
    colIds,
    headerRows: Math.min(1, rowIds.length),
    headerCols: 0,
    footerRows: 0,
  };
  return { sheet: { ...sheet, grid: { ...sheet.grid, tables: [...existing, nextTable] } }, tableId };
}

export function setTableHeaderRows(sheet: GridSheetV1, tableId: string, headerRows: number): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const clamped = Math.max(0, Math.min(t.rowIds.length, Math.round(headerRows)));
  const nextTables = existing.map((x) => {
    if (x.id !== t.id) return x;
    const nextFooterRows = Math.max(0, Math.min(Math.max(0, x.rowIds.length - clamped), x.footerRows ?? 0));
    return { ...x, headerRows: clamped, footerRows: nextFooterRows };
  });
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableHeaderCols(sheet: GridSheetV1, tableId: string, headerCols: number): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const clamped = Math.max(0, Math.min(t.colIds.length, Math.round(headerCols)));
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, headerCols: clamped } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableFooterRows(sheet: GridSheetV1, tableId: string, footerRows: number): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const hr = Math.max(0, Math.min(t.rowIds.length, Math.round(t.headerRows || 0)));
  const clamped = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), Math.round(footerRows)));
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, footerRows: clamped } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTablePillsExpandAll(sheet: GridSheetV1, tableId: string, expandAll: boolean): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, pills: { ...(x.pills || {}), expandAll } } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function upsertTablePillsOptions(sheet: GridSheetV1, tableId: string, labels: string[]): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const opts = t.pills?.options || [];
  const lower = new Set(opts.map((o) => o.label.toLowerCase()));
  let max = Math.max(0, ...opts.map((o) => Number(String(o.id).match(/-(\\d+)$/)?.[1] || 0)));
  const nextOpts = opts.slice();
  labels.forEach((lab) => {
    const l = lab.toLowerCase();
    if (lower.has(l)) return;
    max += 1;
    lower.add(l);
    nextOpts.push({ id: `pill-${max}`, label: lab });
  });
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, pills: { ...(x.pills || {}), options: nextOpts } } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableColumnFilterQuery(
  sheet: GridSheetV1,
  tableId: string,
  colId: string,
  q: string,
): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const qq = String(q || '').trim();
  const nextTables = existing.map((x) => {
    if (x.id !== t.id) return x;
    const next = { ...(x.filters || {}) } as NonNullable<GridTableV1['filters']>;
    const prev = next[colId] || {};
    if (!qq) {
      const { q: _q, ...rest } = prev;
      if (Object.keys(rest).length) next[colId] = rest;
      else delete next[colId];
    } else {
      next[colId] = { ...prev, q: qq };
    }
    const has = Object.keys(next).length > 0;
    return { ...x, ...(has ? { filters: next } : { filters: undefined }) };
  });
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableColumnFilterValues(
  sheet: GridSheetV1,
  tableId: string,
  colId: string,
  values: string[],
): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const nextVals = Array.from(new Set((values || []).map((x) => String(x || '').trim()).filter(Boolean))).slice(0, 500);
  const nextTables = existing.map((x) => {
    if (x.id !== t.id) return x;
    const next = { ...(x.filters || {}) } as NonNullable<GridTableV1['filters']>;
    const prev = next[colId] || {};
    if (!nextVals.length) {
      const { in: _in, ...rest } = prev;
      if (Object.keys(rest).length) next[colId] = rest;
      else delete next[colId];
    } else {
      next[colId] = { ...prev, in: nextVals };
    }
    const has = Object.keys(next).length > 0;
    return { ...x, ...(has ? { filters: next } : { filters: undefined }) };
  });
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function clearTableFilters(sheet: GridSheetV1, tableId: string): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, filters: undefined } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableHiddenCols(sheet: GridSheetV1, tableId: string, hidden: string[]): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const allowed = new Set(t.colIds);
  const nextHidden = Array.from(new Set((hidden || []).map((x) => String(x || '').trim()).filter(Boolean)))
    .filter((id) => allowed.has(id))
    .slice(0, 2000);
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, hiddenCols: nextHidden.length ? nextHidden : undefined } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableHiddenRows(sheet: GridSheetV1, tableId: string, hidden: string[]): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const allowed = new Set(t.rowIds);
  const nextHidden = Array.from(new Set((hidden || []).map((x) => String(x || '').trim()).filter(Boolean)))
    .filter((id) => allowed.has(id))
    .slice(0, 2000);
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, hiddenRows: nextHidden.length ? nextHidden : undefined } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableKind(sheet: GridSheetV1, tableId: string, kind: NonNullable<GridTableV1['kind']>): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const nextKind: NonNullable<GridTableV1['kind']> =
    kind === 'sourceData' || kind === 'groupingCellValue' || kind === 'groupingHeaderValue' ? kind : 'normal';
  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
  const defaultKey = t.colIds[hc] || t.colIds[0] || undefined;
  const nextTables = existing.map((x) => {
    if (x.id !== t.id) return x;
    const nextKey = nextKind === 'sourceData' ? (x.keyColId && x.colIds.includes(x.keyColId) ? x.keyColId : defaultKey) : undefined;
    return { ...x, kind: nextKind, ...(nextKey ? { keyColId: nextKey } : { keyColId: undefined }) };
  });
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export function setTableKeyColId(sheet: GridSheetV1, tableId: string, keyColId: string): GridSheetV1 {
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  if ((t.kind || 'normal') !== 'sourceData') return sheet;
  const nextKey = String(keyColId || '').trim();
  if (!nextKey || !t.colIds.includes(nextKey)) return sheet;
  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
  // Key column must be in the "data columns" area (not the header columns).
  if (t.colIds.indexOf(nextKey) < hc) return sheet;
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, keyColId: nextKey } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables } };
}

export type CanOperateOnRow = (rowId: string) => boolean;
export type CanOperateOnColumn = (colId: string) => boolean;

/**
 * Insert a column inside the table by shifting values within the table range.\n+ * Requires a physical buffer column to the right of the table, which will be created if missing.\n+ */
export function insertTableColumnAfter(
  sheet: GridSheetV1,
  tableId: string,
  afterColId: string,
  opts?: { canOperateOnColumn?: CanOperateOnColumn },
): GridSheetV1 {
  const canOp = opts?.canOperateOnColumn;
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  if (canOp && !canOp(afterColId)) return sheet;
  const colsNow = sheet.grid.columns || [];
  const posInTable = t.colIds.indexOf(afterColId);
  if (posInTable < 0) return sheet;

  const idxById = new Map(colsNow.map((c, i) => [c.id, i]));
  const tableRightId = t.colIds[t.colIds.length - 1];
  const tableRightIdx = tableRightId ? idxById.get(tableRightId) : undefined;
  let nextColumns = colsNow;
  let bufferColId = '';
  if (tableRightIdx !== undefined) {
    for (let i = tableRightIdx + 1; i < colsNow.length; i++) {
      const cand = colsNow[i]?.id;
      if (cand && !t.colIds.includes(cand)) {
        bufferColId = cand;
        break;
      }
    }
  }
  if (!bufferColId) {
    bufferColId = nextNumericId('c', colsNow.map((c) => c.id));
    nextColumns = [...colsNow, { id: bufferColId, width: 88 }];
  }
  if (canOp && !canOp(bufferColId)) return sheet;

  const nextCells = { ...(sheet.grid.cells || {}) };
  const expandedColIds = t.colIds.includes(bufferColId) ? t.colIds.slice() : [...t.colIds, bufferColId];
  const insertAt = posInTable + 1;
  for (const rowId of t.rowIds) {
    const vals: Array<string | null> = expandedColIds.map((colId) => nextCells[`${rowId}:${colId}`]?.value ?? null);
    for (let i = vals.length - 1; i >= insertAt; i--) vals[i] = vals[i - 1];
    vals[insertAt] = null;
    expandedColIds.forEach((colId, idx) => {
      const v = vals[idx];
      const k = `${rowId}:${colId}`;
      if (v === null || String(v).trim().length === 0) delete nextCells[k];
      else nextCells[k] = { value: String(v) };
    });
  }
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, colIds: expandedColIds } : x));
  return { ...sheet, grid: { ...sheet.grid, columns: nextColumns, tables: nextTables, cells: nextCells } };
}

export function insertTableRowAfter(
  sheet: GridSheetV1,
  tableId: string,
  afterRowId: string,
  opts?: { canOperateOnRow?: CanOperateOnRow },
): GridSheetV1 {
  const canOp = opts?.canOperateOnRow;
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  if (canOp && !canOp(afterRowId)) return sheet;
  const rowsNow = sheet.grid.rows || [];
  const posInTable = t.rowIds.indexOf(afterRowId);
  if (posInTable < 0) return sheet;

  const idxById = new Map(rowsNow.map((r, i) => [r.id, i]));
  const tableBottomId = t.rowIds[t.rowIds.length - 1];
  const tableBottomIdx = tableBottomId ? idxById.get(tableBottomId) : undefined;
  let nextRows = rowsNow;
  let bufferRowId = '';
  if (tableBottomIdx !== undefined) {
    for (let i = tableBottomIdx + 1; i < rowsNow.length; i++) {
      const cand = rowsNow[i]?.id;
      if (cand && !t.rowIds.includes(cand)) {
        bufferRowId = cand;
        break;
      }
    }
  }
  if (!bufferRowId) {
    bufferRowId = nextNumericId('r', rowsNow.map((r) => r.id));
    nextRows = [...rowsNow, { id: bufferRowId, height: 22 }];
  }
  if (canOp && !canOp(bufferRowId)) return sheet;

  const nextCells = { ...(sheet.grid.cells || {}) };
  const expandedRowIds = t.rowIds.includes(bufferRowId) ? t.rowIds.slice() : [...t.rowIds, bufferRowId];
  const insertAt = posInTable + 1;
  for (const colId of t.colIds) {
    const vals: Array<string | null> = expandedRowIds.map((rowId) => nextCells[`${rowId}:${colId}`]?.value ?? null);
    for (let i = vals.length - 1; i >= insertAt; i--) vals[i] = vals[i - 1];
    vals[insertAt] = null;
    expandedRowIds.forEach((rowId, idx) => {
      const v = vals[idx];
      const k = `${rowId}:${colId}`;
      if (v === null || String(v).trim().length === 0) delete nextCells[k];
      else nextCells[k] = { value: String(v) };
    });
  }
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, rowIds: expandedRowIds } : x));
  return { ...sheet, grid: { ...sheet.grid, rows: nextRows, tables: nextTables, cells: nextCells } };
}

export function deleteTableColumnAt(
  sheet: GridSheetV1,
  tableId: string,
  colId: string,
  opts?: { canOperateOnColumn?: CanOperateOnColumn },
): GridSheetV1 {
  const canOp = opts?.canOperateOnColumn;
  if (canOp && !canOp(colId)) return sheet;
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const delIdx = t.colIds.indexOf(colId);
  if (delIdx < 0) return sheet;
  if (t.colIds.length <= 1) return sheet;
  const nextColIds = t.colIds.filter((x) => x !== colId);
  const nextCells = { ...(sheet.grid.cells || {}) };
  // Shift table values left starting at delIdx, blanking the last column.
  for (const rowId of t.rowIds) {
    const vals: Array<string | null> = t.colIds.map((cid) => nextCells[`${rowId}:${cid}`]?.value ?? null);
    for (let i = delIdx; i < vals.length - 1; i++) vals[i] = vals[i + 1];
    vals[vals.length - 1] = null;
    t.colIds.forEach((cid, idx) => {
      const v = vals[idx];
      const k = `${rowId}:${cid}`;
      if (v === null || String(v).trim().length === 0) delete nextCells[k];
      else nextCells[k] = { value: String(v) };
    });
  }
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, colIds: nextColIds } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables, cells: nextCells } };
}

export function deleteTableRowAt(
  sheet: GridSheetV1,
  tableId: string,
  rowId: string,
  opts?: { canOperateOnRow?: CanOperateOnRow },
): GridSheetV1 {
  const canOp = opts?.canOperateOnRow;
  if (canOp && !canOp(rowId)) return sheet;
  const existing = sheet.grid.tables || [];
  const t = existing.find((x) => x.id === tableId) || null;
  if (!t) return sheet;
  const delIdx = t.rowIds.indexOf(rowId);
  if (delIdx < 0) return sheet;
  if (t.rowIds.length <= 1) return sheet;
  const nextRowIds = t.rowIds.filter((x) => x !== rowId);
  const nextCells = { ...(sheet.grid.cells || {}) };
  // Shift table values up starting at delIdx, blanking the last row.
  for (const colId of t.colIds) {
    const vals: Array<string | null> = t.rowIds.map((rid) => nextCells[`${rid}:${colId}`]?.value ?? null);
    for (let i = delIdx; i < vals.length - 1; i++) vals[i] = vals[i + 1];
    vals[vals.length - 1] = null;
    t.rowIds.forEach((rid, idx) => {
      const v = vals[idx];
      const k = `${rid}:${colId}`;
      if (v === null || String(v).trim().length === 0) delete nextCells[k];
      else nextCells[k] = { value: String(v) };
    });
  }
  const nextTables = existing.map((x) => (x.id === t.id ? { ...x, rowIds: nextRowIds } : x));
  return { ...sheet, grid: { ...sheet.grid, tables: nextTables, cells: nextCells } };
}

export function ensureCardsInside(sheet: GridSheetV1, cards: GridCardV1[]): GridCardV1[] {
  // Placeholder hook point for future model-driven card clamping.
  return cards;
}

