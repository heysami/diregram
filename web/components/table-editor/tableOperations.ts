import { TableRow, TableColumn, MergedCell, RowType } from '../DimensionTableEditor';

export const addRow = (
  rowType: RowType,
  rows: TableRow[],
  nextRowId: () => string,
): TableRow => {
  const label = rowType === 'header' ? '' : `Row ${rows.length + 1}`;
  return { id: nextRowId(), label, rowType, cells: {} };
};

export const removeRow = (
  id: string,
  rows: TableRow[],
  mergedCells: Map<string, MergedCell>,
): {
  newRows: TableRow[];
  newMerged: Map<string, MergedCell>;
} => {
  if (rows.length <= 1) {
    return { newRows: rows, newMerged: mergedCells };
  }

  const nextMerged = new Map(mergedCells);
  // Remove merged cells that reference this row
  for (const [key, merged] of nextMerged.entries()) {
    if (merged.rowId === id) {
      nextMerged.delete(key);
    }
  }

  return {
    newRows: rows.filter((r) => r.id !== id),
    newMerged: nextMerged,
  };
};

export const addColumn = (
  columns: TableColumn[],
  nextColId: () => string,
): TableColumn => {
  const label = `Column ${String.fromCharCode(65 + columns.length)}`;
  return { id: nextColId(), label };
};

export const removeColumn = (
  id: string,
  columns: TableColumn[],
  rows: TableRow[],
  mergedCells: Map<string, MergedCell>,
): {
  newColumns: TableColumn[];
  newRows: TableRow[];
  newMerged: Map<string, MergedCell>;
} => {
  const hasChild = columns.some((c) => c.parentId === id);
  if (hasChild) {
    return { newColumns: columns, newRows: rows, newMerged: mergedCells };
  }

  const nextCols = columns.filter((c) => c.id !== id);
  const nextRows = rows.map((r) => {
    const { [id]: _, ...rest } = r.cells;
    return { ...r, cells: rest };
  });
  const nextMerged = new Map(mergedCells);
  // Remove merged cells that reference this column
  for (const [key, merged] of nextMerged.entries()) {
    if (merged.colId === id) {
      nextMerged.delete(key);
    }
  }

  return { newColumns: nextCols, newRows: nextRows, newMerged: nextMerged };
};

export const updateColumnLabel = (
  id: string,
  label: string,
  columns: TableColumn[],
): TableColumn[] => {
  return columns.map((c) => (c.id === id ? { ...c, label } : c));
};

export const updateRowLabel = (
  id: string,
  label: string,
  rows: TableRow[],
): TableRow[] => {
  return rows.map((r) => (r.id === id ? { ...r, label } : r));
};

export const updateCell = (
  rowId: string,
  colId: string,
  value: string,
  rows: TableRow[],
): TableRow[] => {
  return rows.map((r) =>
    r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
  );
};
