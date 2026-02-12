import { RowType } from '../DimensionTableEditor';
import { CellSelection } from './selectionUtils';

export const getCellBackgroundColor = (
  rowType: RowType | 'thead',
  isSelected: boolean,
): string => {
  if (rowType === 'header' || rowType === 'thead') {
    return 'bg-slate-100';
  }
  return isSelected ? 'bg-blue-100' : 'bg-white';
};

export const getCellOutlineClasses = (isSelected: boolean): string => {
  return isSelected
    ? 'ring-2 ring-blue-500 ring-inset'
    : 'hover:ring-2 hover:ring-blue-300 hover:ring-inset';
};

export const getRowLabelCellBackground = (rowType: RowType): string => {
  return rowType === 'header' ? 'bg-slate-100' : '';
};

export const isEditing = (
  rowId: string,
  colId: string,
  editingCell: CellSelection | null,
): boolean => {
  return editingCell?.rowId === rowId && editingCell?.colId === colId;
};
