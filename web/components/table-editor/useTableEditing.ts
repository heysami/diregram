import { useState, useRef, useEffect, useCallback } from 'react';
import { TableRow, RowType } from '../DimensionTableEditor';
import { CellSelection } from './selectionUtils';

interface UseTableEditingProps {
  rows: TableRow[];
  dimensionValues: string[];
  onCellUpdate: (rowId: string, colId: string, value: string) => void;
  getAllColumnIds: () => string[];
}

export function useTableEditing({
  rows,
  dimensionValues,
  onCellUpdate,
  getAllColumnIds,
}: UseTableEditingProps) {
  const [editingCell, setEditingCell] = useState<CellSelection | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null!);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      // For textarea, select all text
      inputRef.current.setSelectionRange(0, inputRef.current.value.length);
    }
  }, [editingCell]);

  const startEditing = useCallback(
    (rowId: string, colId: string) => {
      const row = rows.find((r) => r.id === rowId);
      const value = row?.cells[colId] || '';
      setEditingCell({ rowId, colId });
      setEditingValue(value);
      // Show suggestions upfront for header rows when input is empty
      if (row?.rowType === 'header' && dimensionValues.length > 0 && value === '') {
        setSuggestions(dimensionValues.slice(0, 10));
      } else {
        setSuggestions([]);
      }
      setSuggestionIndex(null);
    },
    [rows, dimensionValues],
  );

  const finishEditing = useCallback(
    (commitValue = true, value?: string) => {
      if (!editingCell) return;
      if (commitValue) {
        const valueToCommit = value !== undefined ? value : editingValue;
        onCellUpdate(editingCell.rowId, editingCell.colId, valueToCommit);
      }
      setEditingCell(null);
      setEditingValue('');
      setSuggestions([]);
      setSuggestionIndex(null);
    },
    [editingCell, editingValue, onCellUpdate],
  );

  const handleCellInput = useCallback(
    (value: string) => {
      setEditingValue(value);
      const row = rows.find((r) => r.id === editingCell?.rowId);
      if (row?.rowType === 'header' && dimensionValues.length > 0) {
        if (value.trim() === '') {
          // Show all suggestions when input is empty
          setSuggestions(dimensionValues.slice(0, 10));
        } else {
          const filtered = dimensionValues.filter((v) =>
            v.toLowerCase().includes(value.toLowerCase()),
          );
          setSuggestions(filtered.slice(0, 10));
        }
        setSuggestionIndex(null);
      } else {
        setSuggestions([]);
      }
    },
    [rows, dimensionValues, editingCell],
  );

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return;

      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSuggestionIndex((prev) => {
            if (prev === null) return 0;
            return Math.min(prev + 1, suggestions.length - 1);
          });
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSuggestionIndex((prev) => {
            if (prev === null) return suggestions.length - 1;
            return Math.max(prev - 1, -1);
          });
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (suggestionIndex !== null && suggestionIndex >= 0 && suggestionIndex < suggestions.length) {
            finishEditing(true, suggestions[suggestionIndex]);
          } else {
            finishEditing(true);
          }
          return;
        }
        // Shift+Enter allows newline, don't prevent default
        if (e.key === 'Escape') {
          e.preventDefault();
          setSuggestions([]);
          setSuggestionIndex(null);
          return;
        }
      }

      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        finishEditing(true);
        // Move to next cell
        const allColIds = getAllColumnIds();
        const currentColIndex = allColIds.indexOf(editingCell.colId);
        const currentRowIndex = rows.findIndex((r) => r.id === editingCell.rowId);
        if (e.key === 'Tab' && !e.shiftKey) {
          if (currentColIndex < allColIds.length - 1) {
            startEditing(editingCell.rowId, allColIds[currentColIndex + 1]);
          } else if (currentRowIndex < rows.length - 1) {
            startEditing(rows[currentRowIndex + 1].id, allColIds[0]);
          }
        } else if (e.key === 'Tab' && e.shiftKey) {
          if (currentColIndex > 0) {
            startEditing(editingCell.rowId, allColIds[currentColIndex - 1]);
          } else if (currentRowIndex > 0) {
            startEditing(rows[currentRowIndex - 1].id, allColIds[allColIds.length - 1]);
          }
        } else if (e.key === 'Enter' && !e.shiftKey) {
          if (currentRowIndex < rows.length - 1) {
            startEditing(rows[currentRowIndex + 1].id, editingCell.colId);
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        finishEditing(false);
        return;
      }
    },
    [editingCell, suggestions, suggestionIndex, finishEditing, startEditing, getAllColumnIds, rows],
  );

  return {
    editingCell,
    editingValue,
    suggestions,
    suggestionIndex,
    inputRef,
    startEditing,
    finishEditing,
    handleCellInput,
    handleCellKeyDown,
  };
}
