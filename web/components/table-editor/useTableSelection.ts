import { useState, useCallback } from 'react';
import { TableRow, MergedCell } from '../DimensionTableEditor';
import { CellSelection } from './selectionUtils';
import { getMergedCell } from './tableUtils';

interface UseTableSelectionProps {
  rows: TableRow[];
  mergedCells: Map<string, MergedCell>;
  getAllColumnIds: () => string[];
  onStartEditing: (rowId: string, colId: string) => void;
}

export function useTableSelection({
  rows,
  mergedCells,
  getAllColumnIds,
  onStartEditing,
}: UseTableSelectionProps) {
  const [selectedCell, setSelectedCell] = useState<CellSelection | null>(null);
  const [selectionStart, setSelectionStart] = useState<CellSelection | null>(null);

  const handleCellMouseDown = useCallback(
    (rowId: string, colId: string, e: React.MouseEvent) => {
      // Don't start selection if clicking on unmerge button
      if ((e.target as HTMLElement).closest('button')) return;

      // Prevent native text selection across cells
      e.preventDefault();

      const allColIds = getAllColumnIds();
      let actualRowId = rowId;
      let actualColId = colId;

      // If clicking inside a merged span, normalize to its origin cell
      // But only if the clicked row is actually part of the merged cell
      for (const merged of mergedCells.values()) {
        const mergedColIndex = allColIds.indexOf(merged.colId);
        const currentColIndex = allColIds.indexOf(colId);
        const mergedRowIndex = rows.findIndex((r) => r.id === merged.rowId);
        const currentRowIndex = rows.findIndex((r) => r.id === rowId);

        if (
          mergedRowIndex !== -1 &&
          currentRowIndex !== -1 &&
          mergedRowIndex <= currentRowIndex &&
          currentRowIndex < mergedRowIndex + merged.rowspan &&
          mergedColIndex !== -1 &&
          currentColIndex !== -1 &&
          mergedColIndex <= currentColIndex &&
          currentColIndex < mergedColIndex + merged.colspan
        ) {
          // Only normalize if we're actually clicking within the merged cell's bounds
          actualRowId = merged.rowId;
          actualColId = merged.colId;
          break;
        }
      }

      if (e.detail === 2) {
        onStartEditing(actualRowId, actualColId);
        return;
      }

      if (e.shiftKey && selectionStart) {
        // Extend existing selection to new corner (for merging)
        setSelectedCell({ rowId: actualRowId, colId: actualColId });
        return;
      }

      // If clicking on an already-selected cell (without Shift), start editing immediately
      if (selectedCell?.rowId === actualRowId && selectedCell?.colId === actualColId) {
        onStartEditing(actualRowId, actualColId);
        return;
      }

      // New selection - ensure we're only selecting the clicked cell
      // Clear any previous selection first
      setSelectionStart({ rowId: actualRowId, colId: actualColId });
      setSelectedCell({ rowId: actualRowId, colId: actualColId });
    },
    [rows, mergedCells, getAllColumnIds, selectionStart, selectedCell, onStartEditing],
  );

  const handleCellMouseEnter = useCallback(
    (_rowId: string, _colId: string) => {
      // Drag-selection disabled; we only use click / shift+click
    },
    [],
  );

  const handleCellMouseUp = useCallback(() => {
    // No-op; selection is controlled by click / shift+click
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectedCell(null);
  }, []);

  return {
    selectedCell,
    selectionStart,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    clearSelection,
    setSelectedCell,
    setSelectionStart,
  };
}
