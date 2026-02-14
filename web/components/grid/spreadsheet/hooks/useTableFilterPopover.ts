import { useMemo } from 'react';
import type { GridCellValueV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';
import { useAnchoredPopover } from '@/components/grid/spreadsheet/hooks/useAnchoredPopover';
import { clearTableFilters, setTableColumnFilterQuery, setTableColumnFilterValues } from '@/lib/grid/spreadsheetModel';
import { buildTableColumnAllFilterValues, buildTableColumnFilterOptions } from '@/lib/grid/table-filter-options';
import { computeAllTableFilterViews } from '@/lib/grid/table-filter-view';

export type TableFilterPopoverState = {
  tableId: string;
  colId: string;
  anchor: { left: number; top: number; width: number; height: number };
};

export function useTableFilterPopover(opts: {
  sheetRef: { current: GridSheetV1 };
  tables: GridTableV1[];
  cells: Record<string, GridCellValueV1>;
  mutateSheet: (fn: (s: GridSheetV1) => GridSheetV1) => void;
}) {
  const { sheetRef, tables, cells, mutateSheet } = opts;

  const { state, setState, close } = useAnchoredPopover<TableFilterPopoverState>({
    popoverSelector: '[data-table-filter-popover="1"]',
  });

  const viewsById = useMemo(() => computeAllTableFilterViews({ tables, cells }), [tables, cells]);

  const api = useMemo(() => {
    const getTable = (tableId: string) => tables.find((t) => t.id === tableId) || null;

    return {
      state,
      setState,
      close,
      viewsById,
      getStatsLabel: (tableId: string) => {
        const t = getTable(tableId);
        if (!t) return undefined;
        const view = viewsById.get(t.id) || null;
        if (!view) return undefined;
        return `Showing ${view.visibleDataRowIds.length} / ${view.totalDataRows} row(s)`;
      },
      getQuery: (tableId: string, colId: string) => {
        const t = getTable(tableId);
        return String(t?.filters?.[colId]?.q || '');
      },
      setQuery: (tableId: string, colId: string, q: string) => {
        mutateSheet((s0) => setTableColumnFilterQuery(s0, tableId, colId, q));
      },
      getSelectedValues: (tableId: string, colId: string) => {
        const t = getTable(tableId);
        const ins = Array.isArray(t?.filters?.[colId]?.in) ? (t!.filters![colId]!.in as string[]) : [];
        return new Set(ins);
      },
      toggleValue: (tableId: string, colId: string, v: string) => {
        const t = getTable(tableId);
        const ins = Array.isArray(t?.filters?.[colId]?.in) ? (t!.filters![colId]!.in as string[]) : [];
        const ns = new Set(ins);
        if (ns.has(v)) ns.delete(v);
        else ns.add(v);
        mutateSheet((s0) => setTableColumnFilterValues(s0, tableId, colId, Array.from(ns)));
      },
      selectAll: (tableId: string, colId: string) => {
        const t = getTable(tableId);
        if (!t) return;
        const vals = buildTableColumnAllFilterValues({ table: t, colId, cells });
        mutateSheet((s0) => setTableColumnFilterValues(s0, tableId, colId, vals));
      },
      selectNone: (tableId: string, colId: string) => {
        mutateSheet((s0) => setTableColumnFilterValues(s0, tableId, colId, []));
      },
      clearTable: (tableId: string) => {
        mutateSheet((s0) => clearTableFilters(s0, tableId));
      },
      getOptions: (tableId: string, colId: string) => {
        const t = getTable(tableId);
        if (!t) return [];
        return buildTableColumnFilterOptions({ table: t, colId, cells });
      },
    };
  }, [state, setState, close, viewsById, tables, cells, mutateSheet, sheetRef]);

  return api;
}

