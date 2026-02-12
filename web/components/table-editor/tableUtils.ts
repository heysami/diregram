import { TableColumn, TableRow, MergedCell } from '../DimensionTableEditor';

export const getAllColumnIds = (
  visibleColumns: TableColumn[],
  childColumns: (parentId: string) => TableColumn[],
): string[] => {
  return visibleColumns.flatMap((parent) => {
    const children = childColumns(parent.id);
    return children.length === 0 ? [parent.id] : children.map((c) => c.id);
  });
};

export const getMergedCell = (
  rowId: string,
  colId: string,
  mergedCells: Map<string, MergedCell>,
): MergedCell | null => {
  // Handle thead cells
  if (rowId === 'thead') {
    return mergedCells.get(`thead:${colId}`) || null;
  }
  const key = `${rowId}:${colId}`;
  return mergedCells.get(key) || null;
};

export const isMergedCell = (
  rowId: string,
  colId: string,
  mergedCells: Map<string, MergedCell>,
): boolean => {
  return getMergedCell(rowId, colId, mergedCells) !== null;
};

export const isMergedCellSpan = (
  rowId: string,
  colId: string,
  mergedCells: Map<string, MergedCell>,
  rows: TableRow[],
  getAllColumnIds: () => string[],
): boolean => {
  for (const merged of mergedCells.values()) {
    // Handle thead cells
    if (rowId === 'thead') {
      if (merged.rowId === 'thead' && merged.colId === colId) return false;
      if (merged.rowId !== 'thead') continue;
      const allColIds = getAllColumnIds();
      const mergedColIndex = allColIds.indexOf(merged.colId);
      const currentColIndex = allColIds.indexOf(colId);
      if (
        mergedColIndex <= currentColIndex &&
        currentColIndex < mergedColIndex + merged.colspan
      ) {
        return true;
      }
      continue;
    }

    if (merged.rowId === rowId && merged.colId === colId) return false;
    // Check if this cell is within a merged region
    const allColIds = getAllColumnIds();
    const mergedColIndex = allColIds.indexOf(merged.colId);
    const currentColIndex = allColIds.indexOf(colId);
    const mergedRowIndex = rows.findIndex((r) => r.id === merged.rowId);
    const currentRowIndex = rows.findIndex((r) => r.id === rowId);

    if (
      mergedRowIndex !== -1 &&
      currentRowIndex !== -1 &&
      mergedRowIndex <= currentRowIndex &&
      currentRowIndex < mergedRowIndex + merged.rowspan &&
      mergedColIndex <= currentColIndex &&
      currentColIndex < mergedColIndex + merged.colspan
    ) {
      return true;
    }
  }
  return false;
};
