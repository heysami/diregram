import React, { useMemo, useState } from 'react';
import { Link2, Split, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableColumn, MergedCell } from '../DimensionTableEditor';
import { getMergedCell, isMergedCell, isMergedCellSpan } from './tableUtils';
import { isCellInSelection, CellSelection } from './selectionUtils';
import { getCellOutlineClasses } from './cellStyles';

interface Props {
  column: TableColumn;
  isChild: boolean;
  dimensionValues: string[];
  linkedValuesSet: Set<string>;
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
  dimensionValues,
  linkedValuesSet,
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

  const [headerSuggestionIndex, setHeaderSuggestionIndex] = useState<number | null>(null);
  const [headerSuggestionsOpen, setHeaderSuggestionsOpen] = useState(false);

  const headerSuggestions = useMemo(() => {
    if (!headerSuggestionsOpen) return [];
    const opts = (dimensionValues || []).map((v) => (v ?? '').trim()).filter(Boolean);
    if (!opts.length) return [];
    const q = (column.label || '').trim().toLowerCase();
    if (!q) return opts.slice(0, 10);
    return opts.filter((v) => v.toLowerCase().includes(q)).slice(0, 10);
  }, [headerSuggestionsOpen, dimensionValues, column.label]);

  const isLinked = linkedValuesSet.has((column.label || '').trim());

  return (
    <th
      colSpan={merged?.colspan || 1}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if ((e.target as HTMLElement).closest('input,textarea')) return;
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
            {isLinked ? (
              <span className="text-slate-400" title="Linked to a dimension value">
                <Link2 size={12} />
              </span>
            ) : null}
            <div className="relative">
              <input
                type="text"
                value={column.label}
                onChange={(e) => {
                  onColumnLabelChange(column.id, e.target.value);
                  setHeaderSuggestionIndex(null);
                  setHeaderSuggestionsOpen(true);
                }}
                onFocus={() => {
                  setHeaderSuggestionsOpen(true);
                  setHeaderSuggestionIndex(null);
                }}
                onBlur={() => {
                  setHeaderSuggestionsOpen(false);
                  setHeaderSuggestionIndex(null);
                }}
                onKeyDown={(e) => {
                  if (!headerSuggestionsOpen || headerSuggestions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHeaderSuggestionIndex((prev) => {
                      if (prev === null) return 0;
                      return Math.min(prev + 1, headerSuggestions.length - 1);
                    });
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHeaderSuggestionIndex((prev) => {
                      if (prev === null) return headerSuggestions.length - 1;
                      return Math.max(prev - 1, -1);
                    });
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    if (
                      headerSuggestionIndex !== null &&
                      headerSuggestionIndex >= 0 &&
                      headerSuggestionIndex < headerSuggestions.length
                    ) {
                      e.preventDefault();
                      onColumnLabelChange(column.id, headerSuggestions[headerSuggestionIndex]);
                      setHeaderSuggestionsOpen(false);
                      setHeaderSuggestionIndex(null);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setHeaderSuggestionsOpen(false);
                    setHeaderSuggestionIndex(null);
                  }
                }}
                className="w-24 text-[10px] border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-blue-500 bg-transparent text-center"
                placeholder={isChild ? 'Child' : 'Column'}
                onClick={(e) => e.stopPropagation()}
              />
              {headerSuggestionsOpen && headerSuggestions.length > 0 ? (
                <div
                  className="absolute z-50 mt-1 w-44 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto text-left"
                  onMouseDown={(e) => {
                    // Prevent blur while picking.
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  {headerSuggestions.map((s, idx) => (
                    <div
                      key={`${s}-${idx}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onColumnLabelChange(column.id, s);
                        setHeaderSuggestionsOpen(false);
                        setHeaderSuggestionIndex(null);
                      }}
                      className={`px-2 py-1 text-[11px] cursor-pointer hover:bg-blue-50 ${
                        idx === headerSuggestionIndex ? 'bg-blue-100' : ''
                      }`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
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
