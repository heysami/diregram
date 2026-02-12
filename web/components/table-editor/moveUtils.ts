import { TableRow, TableColumn, MergedCell } from '../DimensionTableEditor';
import { getAllColumnIds } from './tableUtils';

export const hasMergedCellsInRow = (
  rowId: string,
  mergedCells: Map<string, MergedCell>,
): boolean => {
  for (const merged of mergedCells.values()) {
    if (merged.rowId === rowId) {
      return true;
    }
  }
  return false;
};

export const hasMergedCellsInColumn = (
  colId: string,
  mergedCells: Map<string, MergedCell>,
  getAllColumnIds: () => string[],
): boolean => {
  const allColIds = getAllColumnIds();
  const colIndex = allColIds.indexOf(colId);
  if (colIndex === -1) return false;

  for (const merged of mergedCells.values()) {
    // Check thead merged cells
    if (merged.rowId === 'thead') {
      const mergedColIndex = allColIds.indexOf(merged.colId);
      if (
        mergedColIndex <= colIndex &&
        colIndex < mergedColIndex + merged.colspan
      ) {
        return true;
      }
    } else {
      // Check tbody merged cells
      const mergedColIndex = allColIds.indexOf(merged.colId);
      if (
        mergedColIndex <= colIndex &&
        colIndex < mergedColIndex + merged.colspan
      ) {
        return true;
      }
    }
  }
  return false;
};

export const moveRow = (
  rowId: string,
  direction: 'up' | 'down',
  rows: TableRow[],
  mergedCells: Map<string, MergedCell>,
): { canMove: boolean; error?: string; newRows?: TableRow[]; newMerged?: Map<string, MergedCell> } => {
  const rowIndex = rows.findIndex((r) => r.id === rowId);
  if (rowIndex === -1) {
    return { canMove: false, error: 'Row not found' };
  }

  const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return { canMove: false, error: 'Cannot move row beyond table boundaries' };
  }

  // Check if the row has merged cells
  if (hasMergedCellsInRow(rowId, mergedCells)) {
    return {
      canMove: false,
      error: 'Cannot move row with merged cells. Please unmerge cells first.',
    };
  }

  // Check if the target row has merged cells that would span into the moved row
  const targetRowId = rows[targetIndex].id;
  if (hasMergedCellsInRow(targetRowId, mergedCells)) {
    // Check if any merged cell spans across the boundary
    for (const merged of mergedCells.values()) {
      if (merged.rowId === targetRowId) {
        const mergedRowIndex = rows.findIndex((r) => r.id === merged.rowId);
        const rowspan = merged.rowspan;
        if (direction === 'up') {
          // Moving up: check if merged cell spans down into current row
          if (mergedRowIndex + rowspan > rowIndex) {
            return {
              canMove: false,
              error: 'Cannot move row. Target row has merged cells that would be affected. Please unmerge first.',
            };
          }
        } else {
          // Moving down: check if merged cell spans up into current row
          if (mergedRowIndex <= rowIndex && mergedRowIndex + rowspan > rowIndex) {
            return {
              canMove: false,
              error: 'Cannot move row. Current row is part of a merged cell. Please unmerge first.',
            };
          }
        }
      }
    }
  }

  // Perform the move
  const newRows = [...rows];
  const [movedRow] = newRows.splice(rowIndex, 1);
  newRows.splice(targetIndex, 0, movedRow);

  // Update merged cell references if needed
  const newMerged = new Map(mergedCells);
  // No need to update merged cell rowIds since we're just reordering

  return { canMove: true, newRows, newMerged };
};

export const moveColumn = (
  colId: string,
  direction: 'left' | 'right',
  columns: TableColumn[],
  mergedCells: Map<string, MergedCell>,
  getAllColumnIds: () => string[],
): { canMove: boolean; error?: string; newColumns?: TableColumn[]; newMerged?: Map<string, MergedCell> } => {
  const allColIds = getAllColumnIds();
  const colIndex = allColIds.indexOf(colId);
  if (colIndex === -1) {
    return { canMove: false, error: 'Column not found' };
  }

  const targetIndex = direction === 'left' ? colIndex - 1 : colIndex + 1;
  if (targetIndex < 0 || targetIndex >= allColIds.length) {
    return { canMove: false, error: 'Cannot move column beyond table boundaries' };
  }

  // Check if the column is part of merged cells
  if (hasMergedCellsInColumn(colId, mergedCells, getAllColumnIds)) {
    return {
      canMove: false,
      error: 'Cannot move column with merged cells. Please unmerge cells first.',
    };
  }

  // Find the parent column to move
  const column = columns.find((c) => c.id === colId);
  if (!column) {
    return { canMove: false, error: 'Column not found' };
  }

  // Check if it has children (can't move parent columns with children easily)
  const hasChildren = columns.some((c) => c.parentId === colId);
  if (hasChildren) {
    return {
      canMove: false,
      error: 'Cannot move column with child columns. Please remove child columns first.',
    };
  }

  // Find the target column
  const targetColId = allColIds[targetIndex];
  const targetColumn = columns.find((c) => c.id === targetColId);
  if (!targetColumn) {
    return { canMove: false, error: 'Target column not found' };
  }

  // Check if target column has children
  const targetHasChildren = columns.some((c) => c.parentId === targetColId);
  if (targetHasChildren) {
    return {
      canMove: false,
      error: 'Cannot move column. Target column has child columns.',
    };
  }

  // Check if target column is part of merged cells
  if (hasMergedCellsInColumn(targetColId, mergedCells, getAllColumnIds)) {
    return {
      canMove: false,
      error: 'Cannot move column. Target position has merged cells. Please unmerge first.',
    };
  }

  // Check if moving the column would place it inside any merged cell region
  // We need to check all merged cells to see if the target position would be inside them
  for (const merged of mergedCells.values()) {
    const mergedColIndex = allColIds.indexOf(merged.colId);
    if (mergedColIndex === -1) continue;
    
    const mergedEndIndex = mergedColIndex + merged.colspan - 1;
    
    // Check if target position would be inside this merged cell
    if (targetIndex >= mergedColIndex && targetIndex <= mergedEndIndex) {
      return {
        canMove: false,
        error: 'Cannot move column. Target position is inside a merged cell. Please unmerge first.',
      };
    }
    
    // Also check if the current column is part of a merged cell that would be broken
    if (direction === 'left') {
      // Moving left: check if merged cell spans right into current column
      if (mergedColIndex < colIndex && mergedEndIndex >= colIndex) {
        return {
          canMove: false,
          error: 'Cannot move column. Current column is part of a merged cell. Please unmerge first.',
        };
      }
    } else {
      // Moving right: check if merged cell spans left into current column
      if (mergedColIndex <= colIndex && mergedEndIndex >= colIndex) {
        return {
          canMove: false,
          error: 'Cannot move column. Current column is part of a merged cell. Please unmerge first.',
        };
      }
    }
  }

  // Perform the move - reorder visible columns (parent columns only)
  const visibleColumns = columns.filter((c) => !c.parentId);
  const colIndexInVisible = visibleColumns.findIndex((c) => c.id === colId);
  const targetColIndexInVisible = visibleColumns.findIndex((c) => c.id === targetColId);

  if (colIndexInVisible === -1 || targetColIndexInVisible === -1) {
    return { canMove: false, error: 'Column position calculation failed' };
  }

  // Reorder visible columns
  const newVisibleColumns = [...visibleColumns];
  const [movedCol] = newVisibleColumns.splice(colIndexInVisible, 1);
  newVisibleColumns.splice(targetColIndexInVisible, 0, movedCol);

  // Rebuild columns array with children in correct order
  const newColumns: TableColumn[] = [];
  for (const visibleCol of newVisibleColumns) {
    newColumns.push(visibleCol);
    // Add children of this visible column
    const children = columns.filter((c) => c.parentId === visibleCol.id);
    newColumns.push(...children);
  }

  // Update merged cell references - need to update colId if it was the merged cell's origin
  // Since we're just reordering, the colId stays the same but we need to verify the merge still works
  const newMerged = new Map(mergedCells);
  // Merged cells should still work since we're just reordering, not changing IDs

  return { canMove: true, newColumns, newMerged };
};
