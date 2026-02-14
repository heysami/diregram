import type { GridCellValueV1, GridTableV1 } from '@/lib/gridjson';
import { encodeFilterItem, extractTableFilterItems } from '@/lib/grid/tableFilterItems';

export type TableColumnFilterV1 = NonNullable<GridTableV1['filters']>[string];

export type TableFilterView = {
  totalDataRows: number;
  visibleDataRowIds: string[];
  /** Dest data-row id -> source data-row id (or null if no row occupies that slot) */
  destToSourceRowId: Record<string, string | null>;
};

export function getTableDataRowIds(t: GridTableV1): string[] {
  const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
  const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
  return t.rowIds.slice(hr, Math.max(hr, t.rowIds.length - fr));
}

function normalizeFilter(f: TableColumnFilterV1 | undefined): { q: string; in: string[] } {
  const q = String(f?.q || '').trim();
  const ins = Array.isArray(f?.in) ? (f!.in as unknown[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
  return { q, in: ins };
}

export function rowMatchesColumnFilter(cellValue: string, filter: TableColumnFilterV1 | undefined): boolean {
  const f = normalizeFilter(filter);
  const s = String(cellValue || '');
  if (f.q.length) {
    const needle = f.q.toLowerCase();
    if (!s.toLowerCase().includes(needle)) return false;
  }
  if (f.in.length) {
    const items = extractTableFilterItems(s).map(encodeFilterItem);
    if (!items.length) return false;
    const set = new Set(items);
    if (!f.in.some((x) => set.has(x))) return false;
  }
  return true;
}

export function rowMatchesTableFilters(opts: {
  table: GridTableV1;
  rowId: string;
  cells: Record<string, GridCellValueV1>;
}): boolean {
  const { table: t, rowId, cells } = opts;
  const filters = t.filters || {};
  const active = Object.entries(filters).filter(([, v]) => {
    const f = normalizeFilter(v);
    return Boolean(f.q.length || f.in.length);
  });
  if (!active.length) return true;
  return active.every(([colId, f]) => {
    const v = cells[`${rowId}:${colId}`]?.value ?? '';
    return rowMatchesColumnFilter(v, f);
  });
}

/**
 * Computes the "collapsed rows" view for a table under its filters.
 * Returns null if there are no active filters.
 */
export function computeTableFilterView(opts: {
  table: GridTableV1;
  cells: Record<string, GridCellValueV1>;
}): TableFilterView | null {
  const { table: t, cells } = opts;
  const dataRowIds = getTableDataRowIds(t);
  const filters = t.filters || {};
  const hidden = new Set((t.hiddenRows || []).map((x) => String(x || '').trim()).filter(Boolean));
  const hasAny = Object.values(filters).some((v) => {
    const f = normalizeFilter(v);
    return Boolean(f.q.length || f.in.length);
  });
  if (!hasAny && hidden.size === 0) return null;

  const visible = dataRowIds.filter((rowId) => !hidden.has(rowId) && rowMatchesTableFilters({ table: t, rowId, cells }));

  const destToSourceRowId: Record<string, string | null> = {};
  for (let i = 0; i < dataRowIds.length; i++) {
    const destRowId = dataRowIds[i]!;
    destToSourceRowId[destRowId] = visible[i] || null;
  }

  return { totalDataRows: dataRowIds.length, visibleDataRowIds: visible, destToSourceRowId };
}

export function computeAllTableFilterViews(opts: {
  tables: GridTableV1[];
  cells: Record<string, GridCellValueV1>;
}): Map<string, TableFilterView> {
  const byId = new Map<string, TableFilterView>();
  for (const t of opts.tables) {
    const view = computeTableFilterView({ table: t, cells: opts.cells });
    if (view) byId.set(t.id, view);
  }
  return byId;
}

