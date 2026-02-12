import React from 'react';
import { Split, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableColumn, MergedCell } from '../DimensionTableEditor';
import { getMergedCell, isMergedCell, isMergedCellSpan } from './tableUtils';
import { isCellInSelection, CellSelection } from './selectionUtils';
import { getCellOutlineClasses } from './cellStyles';

interface Props {
  column: TableColumn;
  isChild: boolean;
  mergedCells: Map<string, MergedCell>;
  selectionStart: CellSelection | null;
  selectedCell: CellSelection | null;
  editingCell: CellSelection | null;
  editingValue: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  getAllColumnIds: () => string[];
  onMouseDown: (rowId: string, colId: string, e: React.MouseEvent) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
  onInputKeyDown: (e: React.KeyboardEvent) => void;
  onColumnLabelChange: (colId: string, label: string) => void;
  onRemoveColumn: (colId: string) => void;
  onMoveColumn: (colId: string, direction: 'left' | 'right') => void;
  onUnmerge: (rowId: string, colId: string) => void;
  onClearSelection: () => void;
  colIndex: number;
  totalCols: number;
}

export function TableHeaderCell({
  column,
  isChild,
  mergedCells,
  selectionStart,
  selectedCell,
  editingCell,
  editingValue,
  inputRef,
  getAllColumnIds,
  onMouseDown,
  onInputChange,
  onInputBlur,
  onInputKeyDown,
  onColumnLabelChange,
  onRemoveColumn,
  onMoveColumn,
  onUnmerge,
  onClearSelection,
  colIndex,
  totalCols,
}: Props) {
  const merged = getMergedCell('thead', column.id, mergedCells);
  const isSpan = isMergedCellSpan('thead', column.id, mergedCells, [], getAllColumnIds);
  if (isSpan) return null;

  const isSelected = isCellInSelection('thead', column.id, selectionStart, selectedCell, [], getAllColumnIds);
  const isEditing = editingCell?.rowId === 'thead' && editingCell?.colId === column.id;
  const outlineClasses = getCellOutlineClasses(isSelected);
  const canMoveLeft = colIndex > 0;
  const canMoveRight = colIndex < totalCols - 1;

  return (
    <th
      colSpan={merged?.colspan || 1}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        onMouseDown('thead', column.id, e);
      }}
      className={`border-b border-r border-slate-200 px-2 py-1 text-center text-[10px] font-semibold text-slate-700 relative bg-slate-100 ${outlineClasses}`}
    >
      <div className="flex items-center justify-center gap-1">
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={editingValue}
          onChange={(e) => onInputChange(e.target.value)}
          onBlur={onInputBlur}
          onKeyDown={onInputKeyDown}
          className="w-24 text-[10px] border border-blue-500 rounded px-1 py-0.5 focus:outline-none bg-transparent text-center resize-none"
          rows={1}
          style={{ 
            height: 'auto',
            minHeight: '20px',
          }}
          onInput={(e) => {
            // Auto-resize textarea
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = `${Math.min(target.scrollHeight, 80)}px`;
          }}
        />
        ) : (
          <>
            <input
              type="text"
              value={column.label}
              onChange={(e) => onColumnLabelChange(column.id, e.target.value)}
              className="w-24 text-[10px] border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-blue-500 bg-transparent text-center"
              placeholder={isChild ? 'Child' : 'Column'}
              onClick={(e) => e.stopPropagation()}
            />
            {!isChild && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveColumn(column.id, 'left');
                  }}
                  disabled={!canMoveLeft}
                  className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move column left"
                >
                  <ChevronLeft size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveColumn(column.id, 'right');
                  }}
                  disabled={!canMoveRight}
                  className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move column right"
                >
                  <ChevronRight size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveColumn(column.id);
                  }}
                  className="text-slate-300 hover:text-red-500"
                  title="Remove column"
                >
                  <Trash2 size={10} />
                </button>
              </>
            )}
          </>
        )}
      </div>
      {isMergedCell('thead', column.id, mergedCells) && (
        <div className="absolute top-1 right-1 group">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onUnmerge('thead', column.id);
              onClearSelection();
            }}
            className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 bg-white border border-slate-200 rounded shadow-sm"
          >
            <Split size={12} />
          </button>
          <div className="pointer-events-none absolute -top-6 right-0 hidden rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white text-center whitespace-nowrap shadow group-hover:block">
            Unmerge Cells
          </div>
        </div>
      )}
    </th>
  );
}
