import { TableColumn, TableRow, MergedCell } from '../DimensionTableEditor';

export const mergeCells = (
  startRowId: string,
  startColId: string,
  endRowId: string,
  endColId: string,
  rows: TableRow[],
  columns: TableColumn[],
  mergedCells: Map<string, MergedCell>,
  getAllColumnIds: () => string[],
): {
  nextMerged: Map<string, MergedCell>;
  nextRows?: TableRow[];
  nextCols?: TableColumn[];
} => {
  const allColIds = getAllColumnIds();
  const startColIndex = allColIds.indexOf(startColId);
  const endColIndex = allColIds.indexOf(endColId);

  if (startColIndex === -1 || endColIndex === -1) {
    return { nextMerged: mergedCells };
  }

  const minCol = Math.min(startColIndex, endColIndex);
  const maxCol = Math.max(startColIndex, endColIndex);
  const colspan = maxCol - minCol + 1;

  // Handle thead cell merging (column headers)
  if (startRowId === 'thead' && endRowId === 'thead') {
    const merged: MergedCell = {
      rowId: 'thead',
      colId: allColIds[minCol],
      colspan,
      rowspan: 1,
    };

    // Check for conflicts with existing merged cells
    const nextMerged = new Map(mergedCells);
    for (let c = minCol; c <= maxCol; c++) {
      const colId = allColIds[c];
      const key = `thead:${colId}`;
      nextMerged.delete(key);
    }

    nextMerged.set(`thead:${merged.colId}`, merged);

    // Merge column labels: keep the leftmost column's label
    const topLeftLabel = columns.find((c) => c.id === allColIds[minCol])?.label || '';
    const nextCols = columns.map((col) => {
      const colIndex = allColIds.indexOf(col.id);
      if (colIndex >= minCol && colIndex <= maxCol) {
        if (colIndex === minCol) {
          return { ...col, label: topLeftLabel };
        } else {
          // Keep the column but clear its label (it's merged)
          return col;
        }
      }
      return col;
    });

    return { nextMerged, nextCols };
  }

  // Handle tbody cell merging (data rows)
  const startRowIndex = rows.findIndex((r) => r.id === startRowId);
  const endRowIndex = rows.findIndex((r) => r.id === endRowId);

  if (startRowIndex === -1 || endRowIndex === -1) {
    return { nextMerged: mergedCells };
  }

  const minRow = Math.min(startRowIndex, endRowIndex);
  const maxRow = Math.max(startRowIndex, endRowIndex);
  const rowspan = maxRow - minRow + 1;

  // Check for conflicts with existing merged cells
  const nextMerged = new Map(mergedCells);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const rowId = rows[r].id;
      const colId = allColIds[c];
      const key = `${rowId}:${colId}`;
      nextMerged.delete(key);
    }
  }

  const merged: MergedCell = {
    rowId: rows[minRow].id,
    colId: allColIds[minCol],
    colspan,
    rowspan,
  };
  nextMerged.set(`${merged.rowId}:${merged.colId}`, merged);

  // Merge cell values: keep the top-left cell's value
  const topLeftValue = rows[minRow].cells[allColIds[minCol]] || '';
  const nextRows = rows.map((r, rIdx) => {
    if (rIdx < minRow || rIdx > maxRow) return r;
    const newCells = { ...r.cells };
    for (let c = minCol; c <= maxCol; c++) {
      const colId = allColIds[c];
      if (rIdx === minRow && c === minCol) {
        newCells[colId] = topLeftValue;
      } else {
        delete newCells[colId];
      }
    }
    return { ...r, cells: newCells };
  });

  return { nextMerged, nextRows };
};

export const unmergeCell = (
  rowId: string,
  colId: string,
  mergedCells: Map<string, MergedCell>,
): Map<string, MergedCell> => {
  const nextMerged = new Map(mergedCells);

  // Handle thead cells
  if (rowId === 'thead') {
    const key = `thead:${colId}`;
    nextMerged.delete(key);
    return nextMerged;
  }

  const key = `${rowId}:${colId}`;
  nextMerged.delete(key);
  return nextMerged;
};
