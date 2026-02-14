import type { GridCellValueV1, GridTableV1 } from '@/lib/gridjson';
import { encodeFilterItem, extractTableFilterItems } from '@/lib/grid/tableFilterItems';
import { getTableDataRowIds } from '@/lib/grid/table-filter-view';

export type TableFilterOption = { group: string; value: string; count: number };

export function buildTableColumnFilterOptions(opts: {
  table: GridTableV1;
  colId: string;
  cells: Record<string, GridCellValueV1>;
  limit?: number;
}): TableFilterOption[] {
  const { table: t, colId, cells } = opts;
  const limit = Math.max(10, Math.min(1000, Math.round(opts.limit ?? 250)));
  const dataRowIds = getTableDataRowIds(t);
  const counts = new Map<string, { group: string; count: number }>();
  for (const rowId of dataRowIds) {
    const v = cells[`${rowId}:${colId}`]?.value ?? '';
    const items = extractTableFilterItems(v);
    if (!items.length) continue;
    for (const it of items) {
      const enc = encodeFilterItem(it);
      const rec = counts.get(enc) || { group: it.kind, count: 0 };
      rec.count += 1;
      counts.set(enc, rec);
    }
  }
  const arr = Array.from(counts.entries()).map(([value, rec]) => ({ group: rec.group, value, count: rec.count }));
  arr.sort((a, b) => a.group.localeCompare(b.group) || b.count - a.count || a.value.localeCompare(b.value));
  return arr.slice(0, limit);
}

export function buildTableColumnAllFilterValues(opts: {
  table: GridTableV1;
  colId: string;
  cells: Record<string, GridCellValueV1>;
  limit?: number;
}): string[] {
  const { table: t, colId, cells } = opts;
  const limit = Math.max(10, Math.min(2000, Math.round(opts.limit ?? 1000)));
  const dataRowIds = getTableDataRowIds(t);
  const set = new Set<string>();
  for (const rowId of dataRowIds) {
    const v = cells[`${rowId}:${colId}`]?.value ?? '';
    extractTableFilterItems(v).forEach((it) => set.add(encodeFilterItem(it)));
    if (set.size >= limit) break;
  }
  return Array.from(set);
}

