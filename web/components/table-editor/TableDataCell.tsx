import React from 'react';
import { Link2, Split } from 'lucide-react';
import { TableRow, MergedCell } from '../DimensionTableEditor';
import { getMergedCell, isMergedCell, isMergedCellSpan } from './tableUtils';
import { isCellInSelection, CellSelection } from './selectionUtils';
import { getCellBackgroundColor, getCellOutlineClasses, isEditing } from './cellStyles';

interface Props {
  row: TableRow;
  colId: string;
  mergedCells: Map<string, MergedCell>;
  linkedValuesSet: Set<string>;
  selectionStart: CellSelection | null;
  selectedCell: CellSelection | null;
  editingCell: CellSelection | null;
  editingValue: string;
  suggestions: string[];
  suggestionIndex: number | null;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  getAllColumnIds: () => string[];
  rows: TableRow[];
  onMouseDown: (rowId: string, colId: string, e: React.MouseEvent) => void;
  onMouseEnter: (rowId: string, colId: string) => void;
  onMouseUp: () => void;
  onDoubleClick: (rowId: string, colId: string) => void;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
  onInputKeyDown: (e: React.KeyboardEvent) => void;
  onSuggestionClick: (suggestion: string) => void;
  onUnmerge: (rowId: string, colId: string) => void;
  onClearSelection: () => void;
}

export function TableDataCell({
  row,
  colId,
  mergedCells,
  linkedValuesSet,
  selectionStart,
  selectedCell,
  editingCell,
  editingValue,
  suggestions,
  suggestionIndex,
  inputRef,
  getAllColumnIds,
  rows,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onDoubleClick,
  onInputChange,
  onInputBlur,
  onInputKeyDown,
  onSuggestionClick,
  onUnmerge,
  onClearSelection,
}: Props) {
  const merged = getMergedCell(row.id, colId, mergedCells);
  const isSpan = isMergedCellSpan(row.id, colId, mergedCells, rows, getAllColumnIds);
  if (isSpan) return null;

  const value = row.cells[colId] || '';
  const editing = isEditing(row.id, colId, editingCell);
  const isSelected = isCellInSelection(row.id, colId, selectionStart, selectedCell, rows, getAllColumnIds) && !editing;
  const showSuggestions = editing && suggestions.length > 0;
  const isLinked = !editing && linkedValuesSet.has(value.trim());

  const baseBg = getCellBackgroundColor(row.rowType, isSelected);
  const outlineClasses = getCellOutlineClasses(isSelected);

  return (
    <td
      key={`${row.id}-${colId}`}
      colSpan={merged?.colspan || 1}
      rowSpan={merged?.rowspan || 1}
      className={`border border-slate-200 px-2 py-1 relative ${baseBg} ${outlineClasses}`}
      onMouseDown={(e) => onMouseDown(row.id, colId, e)}
      onMouseEnter={() => onMouseEnter(row.id, colId)}
      onMouseUp={onMouseUp}
    >
      {editing ? (
        <div className="relative w-full">
          <textarea
            ref={inputRef}
            value={editingValue}
            onChange={(e) => onInputChange(e.target.value)}
            onBlur={(e) => {
              // Don't blur if clicking on a suggestion or dropdown
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (relatedTarget?.closest('.suggestion-item') || relatedTarget?.closest('[class*="absolute z-50"]')) {
                return;
              }
              onInputBlur();
            }}
            onKeyDown={onInputKeyDown}
            className="w-full text-[11px] border border-blue-500 rounded px-1 py-0.5 focus:outline-none resize-none"
            rows={1}
            autoFocus
            style={{ 
              height: 'auto',
              minHeight: '20px',
            }}
            onInput={(e) => {
              // Auto-resize textarea
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          {showSuggestions && (
            <div 
              className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto"
              onMouseDown={(e) => {
                // Prevent blur event from firing when clicking anywhere in the dropdown
                e.preventDefault();
              }}
            >
              {suggestions.map((suggestion, idx) => (
                <div
                  key={suggestion}
                  onMouseDown={(e) => {
                    // Prevent blur event from firing
                    e.preventDefault();
                    onSuggestionClick(suggestion);
                  }}
                  className={`suggestion-item px-2 py-1 text-[11px] cursor-pointer hover:bg-blue-50 ${
                    idx === suggestionIndex ? 'bg-blue-100' : ''
                  }`}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`w-full text-[11px] px-1 py-0.5 min-h-[20px] cursor-cell select-none whitespace-pre-wrap flex items-start gap-1 ${
            row.rowType === 'header' ? 'font-semibold' : ''
          } ${isSelected ? 'text-blue-900' : ''}`}
          onDoubleClick={() => onDoubleClick(row.id, colId)}
        >
          {isLinked ? (
            <span className="mt-[1px] text-slate-400" title="Linked to a dimension value">
              <Link2 size={12} />
            </span>
          ) : null}
          <span className="flex-1">{value || '\u00A0'}</span>
        </div>
      )}
      {merged && isSelected && (
        <div className="absolute top-1 right-1 group">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onUnmerge(row.id, colId);
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
    </td>
  );
}
