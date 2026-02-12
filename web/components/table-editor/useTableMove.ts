import { useState, useCallback } from 'react';
import { TableRow, TableColumn, MergedCell } from '../DimensionTableEditor';
import { moveRow as moveRowUtil, moveColumn as moveColumnUtil } from './moveUtils';

interface UseTableMoveProps {
  rows: TableRow[];
  columns: TableColumn[];
  mergedCells: Map<string, MergedCell>;
  getAllColumnIds: () => string[];
  onRowsChange: (newRows: TableRow[]) => void;
  onColumnsChange: (newColumns: TableColumn[]) => void;
  onMergedCellsChange: (newMerged: Map<string, MergedCell>) => void;
}

export function useTableMove({
  rows,
  columns,
  mergedCells,
  getAllColumnIds,
  onRowsChange,
  onColumnsChange,
  onMergedCellsChange,
}: UseTableMoveProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setTimeout(() => setErrorMessage(null), 3000);
  }, []);

  const moveRow = useCallback(
    (id: string, direction: 'up' | 'down') => {
      clearError();
      const result = moveRowUtil(id, direction, rows, mergedCells);
      
      if (!result.canMove) {
        showError(result.error || 'Cannot move row');
        return;
      }
      
      if (result.newRows) {
        onMergedCellsChange(result.newMerged || mergedCells);
        onRowsChange(result.newRows);
      }
    },
    [rows, mergedCells, clearError, showError, onRowsChange, onMergedCellsChange],
  );

  const moveColumn = useCallback(
    (id: string, direction: 'left' | 'right') => {
      clearError();
      const result = moveColumnUtil(id, direction, columns, mergedCells, getAllColumnIds);
      
      if (!result.canMove) {
        showError(result.error || 'Cannot move column');
        return;
      }
      
      if (result.newColumns) {
        onMergedCellsChange(result.newMerged || mergedCells);
        onColumnsChange(result.newColumns);
      }
    },
    [columns, mergedCells, getAllColumnIds, clearError, showError, onColumnsChange, onMergedCellsChange],
  );

  return {
    errorMessage,
    moveRow,
    moveColumn,
    clearError,
  };
}
