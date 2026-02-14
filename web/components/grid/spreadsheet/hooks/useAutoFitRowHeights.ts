import { useEffect } from 'react';
import type { GridCellValueV1, GridColumnV1, GridRowV1, GridSheetV1 } from '@/lib/gridjson';
import { estimateDesiredRowHeight } from '@/components/grid/spreadsheet/autoRowHeight';

export function useAutoFitRowHeights(opts: {
  cells: Record<string, GridCellValueV1>;
  columns: GridColumnV1[];
  rows: GridRowV1[];
  mutateSheet: (fn: (s: GridSheetV1) => GridSheetV1) => void;
}) {
  const { cells, columns, rows, mutateSheet } = opts;

  useEffect(() => {
    if (!rows.length) return;
    const updates = new Map<string, number>(); // rowId -> desiredHeight
    const rowIdxById = new Map(rows.map((r, i) => [r.id, i]));
    const colWidthById = new Map(columns.map((c) => [c.id, c.width ?? 88]));

    for (const [k, cv] of Object.entries(cells || {})) {
      const i = k.indexOf(':');
      if (i === -1) continue;
      const rowId = k.slice(0, i);
      const colId = k.slice(i + 1);
      const desired = estimateDesiredRowHeight(cv?.value ?? '', { colWidthPx: colWidthById.get(colId) ?? 88 });
      if (!desired) continue;
      const prev = updates.get(rowId) || 0;
      if (desired > prev) updates.set(rowId, desired);
    }
    if (!updates.size) return;

    mutateSheet((s) => {
      const baseRows = s.grid.rows || [];
      let changed = false;
      const nextRows = baseRows.slice();
      updates.forEach((desired, rowId) => {
        const idx = rowIdxById.get(rowId);
        if (idx === undefined) return;
        const r = baseRows[idx];
        if (!r) return;
        const cur = Math.max(36, r.height ?? 22);
        if (desired <= cur) return;
        nextRows[idx] = { ...r, height: desired };
        changed = true;
      });
      if (!changed) return s;
      return { ...s, grid: { ...s.grid, rows: nextRows } };
    });
  }, [cells, columns, rows, mutateSheet]);
}

