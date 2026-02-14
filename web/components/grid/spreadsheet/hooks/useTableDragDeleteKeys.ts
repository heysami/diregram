import { useEffect } from 'react';

export type TableDragState = {
  kind: 'col' | 'row';
  tableId: string;
  draggedId: string;
  overIndex: number;
  startScrollLeft: number;
  startScrollTop: number;
};

export function useTableDragDeleteKeys(opts: {
  tableDrag: TableDragState | null;
  clearTableDrag: () => void;
  deleteTableColumnAt: (tableId: string, colId: string) => void;
  deleteTableRowAt: (tableId: string, rowId: string) => void;
}) {
  const { tableDrag, clearTableDrag, deleteTableColumnAt, deleteTableRowAt } = opts;
  useEffect(() => {
    if (!tableDrag) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearTableDrag();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      e.preventDefault();
      const d = tableDrag;
      clearTableDrag();
      if (d.kind === 'col') deleteTableColumnAt(d.tableId, d.draggedId);
      else deleteTableRowAt(d.tableId, d.draggedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tableDrag, clearTableDrag, deleteTableColumnAt, deleteTableRowAt]);
}

