import { TableRow } from '../DimensionTableEditor';

export interface CellSelection {
  rowId: string;
  colId: string;
}

export const isCellInSelection = (
  rowId: string,
  colId: string,
  selectionStart: CellSelection | null,
  selectedCell: CellSelection | null,
  rows: TableRow[],
  getAllColumnIds: () => string[],
): boolean => {
  if (!selectionStart || !selectedCell) return false;

  // Handle thead cells
  const isTheadCell = rowId === 'thead';
  const isStartThead = selectionStart.rowId === 'thead';
  const isEndThead = selectedCell.rowId === 'thead';

  // If any cell is thead, all must be thead
  if (isTheadCell !== isStartThead || isTheadCell !== isEndThead) {
    return false;
  }

  if (isTheadCell) {
    // Thead selection logic
    if (selectionStart.rowId === selectedCell.rowId && selectionStart.colId === selectedCell.colId) {
      return rowId === selectionStart.rowId && colId === selectionStart.colId;
    }

    const allColIds = getAllColumnIds();
    const startColIndex = allColIds.indexOf(selectionStart.colId);
    const endColIndex = allColIds.indexOf(selectedCell.colId);
    const currentColIndex = allColIds.indexOf(colId);

    if (startColIndex === -1 || endColIndex === -1 || currentColIndex === -1) {
      return false;
    }

    const minCol = Math.min(startColIndex, endColIndex);
    const maxCol = Math.max(startColIndex, endColIndex);

    return currentColIndex >= minCol && currentColIndex <= maxCol;
  }

  // Only check selection if this cell is in the actual rows array
  const currentRow = rows.find((r) => r.id === rowId);
  if (!currentRow) return false;

  // Ensure both selection start and end are in the rows array
  const startRow = rows.find((r) => r.id === selectionStart.rowId);
  const endRow = rows.find((r) => r.id === selectedCell.rowId);
  if (!startRow || !endRow) return false;

  // If single cell selection (start and end are the same), only match exact cell
  if (selectionStart.rowId === selectedCell.rowId && selectionStart.colId === selectedCell.colId) {
    return rowId === selectionStart.rowId && colId === selectionStart.colId;
  }

  // Range selection - check if cell is within the range
  const allColIds = getAllColumnIds();
  const startRowIndex = rows.findIndex((r) => r.id === selectionStart.rowId);
  const endRowIndex = rows.findIndex((r) => r.id === selectedCell.rowId);
  const startColIndex = allColIds.indexOf(selectionStart.colId);
  const endColIndex = allColIds.indexOf(selectedCell.colId);
  const currentRowIndex = rows.findIndex((r) => r.id === rowId);
  const currentColIndex = allColIds.indexOf(colId);

  if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1 || currentRowIndex === -1 || currentColIndex === -1) {
    return false;
  }

  const minRow = Math.min(startRowIndex, endRowIndex);
  const maxRow = Math.max(startRowIndex, endRowIndex);
  const minCol = Math.min(startColIndex, endColIndex);
  const maxCol = Math.max(startColIndex, endColIndex);

  return (
    currentRowIndex >= minRow &&
    currentRowIndex <= maxRow &&
    currentColIndex >= minCol &&
    currentColIndex <= maxCol
  );
};
