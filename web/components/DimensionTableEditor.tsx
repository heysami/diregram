import { useState, useEffect, useMemo } from 'react';
import { Plus, Merge } from 'lucide-react';
import { getAllColumnIds as getAllColumnIdsUtil } from './table-editor/tableUtils';
import { mergeCells as mergeCellsUtil, unmergeCell as unmergeCellUtil } from './table-editor/mergeUtils';
import { useTableMove } from './table-editor/useTableMove';
import { useTableEditing } from './table-editor/useTableEditing';
import { useTableSelection } from './table-editor/useTableSelection';
import {
  addRow as addRowUtil,
  removeRow as removeRowUtil,
  addColumn as addColumnUtil,
  removeColumn as removeColumnUtil,
  updateColumnLabel as updateColumnLabelUtil,
  updateRowLabel as updateRowLabelUtil,
  updateCell as updateCellUtil,
} from './table-editor/tableOperations';
import { TableHeaderCell } from './table-editor/TableHeaderCell';
import { TableDataCell } from './table-editor/TableDataCell';
import { TableRowLabelCell } from './table-editor/TableRowLabelCell';

export type RowType = 'header' | 'content';

export interface TableColumn {
  id: string;
  label: string;
  parentId?: string;
}

export interface MergedCell {
  rowId: string;
  colId: string;
  colspan: number;
  rowspan: number;
}

export interface TableRow {
  id: string;
  label: string;
  rowType: RowType;
  cells: Record<string, string>;
}

interface Props {
  initialColumns?: TableColumn[];
  initialRows?: TableRow[];
  dimensionValues?: string[];
  onChange?: (columns: TableColumn[], rows: TableRow[], mergedCells?: Map<string, MergedCell>) => void;
}

let colCounter = 1;
let rowCounter = 1;
const nextColId = () => `col-${colCounter++}`;
const nextRowId = () => `row-${rowCounter++}`;

// Normalize and ensure unique IDs for rows
const normalizeRows = (rows: TableRow[]): TableRow[] => {
  const seenIds = new Set<string>();
  return rows.map((row, index) => {
    if (seenIds.has(row.id)) {
      // Generate a new unique ID
      let newId = `row-${Date.now()}-${index}`;
      while (seenIds.has(newId)) {
        newId = `row-${Date.now()}-${Math.random()}-${index}`;
      }
      seenIds.add(newId);
      return { ...row, id: newId };
    }
    seenIds.add(row.id);
    return row;
  });
};

// Initialize row counter based on existing row IDs
const initializeRowCounter = (rows: TableRow[]) => {
  let maxNum = 0;
  for (const row of rows) {
    const match = row.id.match(/^row-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  rowCounter = maxNum + 1;
};

export function DimensionTableEditor({
  initialColumns,
  initialRows,
  dimensionValues = [],
  onChange,
}: Props) {
  const linkedValuesSet = useMemo(() => new Set(dimensionValues.map((v) => v.trim())), [dimensionValues]);
  const initialRowsNormalized = initialRows && initialRows.length
    ? normalizeRows(initialRows)
    : [
        { id: nextRowId(), label: 'Row 1', rowType: 'content' as RowType, cells: {} },
        { id: nextRowId(), label: 'Row 2', rowType: 'content' as RowType, cells: {} },
      ];

  initializeRowCounter(initialRowsNormalized);

  const [columns, setColumns] = useState<TableColumn[]>(
    initialColumns && initialColumns.length
      ? initialColumns
      : [
          { id: nextColId(), label: 'Column A' },
          { id: nextColId(), label: 'Column B' },
        ],
  );
  const [rows, setRows] = useState<TableRow[]>(initialRowsNormalized);
  const [mergedCells, setMergedCells] = useState<Map<string, MergedCell>>(new Map());

  const commit = (nextCols: TableColumn[], nextRows: TableRow[]) => {
    // Normalize before committing so IDs remain stable/unique without needing
    // an effect that re-writes state (which triggers lint warnings).
    const normalizedRows = normalizeRows(nextRows);
    initializeRowCounter(normalizedRows);
    setColumns(nextCols);
    setRows(normalizedRows);
    onChange?.(nextCols, normalizedRows, mergedCells);
  };

  const visibleColumns = columns.filter((c) => !c.parentId);
  const childColumns = (parentId: string) => columns.filter((c) => c.parentId === parentId);

  const getAllColumnIds = (): string[] => {
    return getAllColumnIdsUtil(visibleColumns, childColumns);
  };

  // Use modularized editing hook
  const {
    editingCell,
    editingValue,
    suggestions,
    suggestionIndex,
    inputRef,
    startEditing,
    finishEditing,
    handleCellInput,
    handleCellKeyDown,
  } = useTableEditing({
    rows,
    dimensionValues,
    onCellUpdate: (rowId, colId, value) => {
      const newRows = updateCellUtil(rowId, colId, value, rows);
      commit(columns, newRows);
    },
    getAllColumnIds,
  });

  // Use modularized selection hook
  const {
    selectedCell,
    selectionStart,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    clearSelection,
    setSelectedCell,
    setSelectionStart,
  } = useTableSelection({
    rows,
    mergedCells,
    getAllColumnIds,
    onStartEditing: startEditing,
  });

  // Use the modularized move hook (after getAllColumnIds is defined)
  const { errorMessage, moveRow, moveColumn } = useTableMove({
    rows,
    columns,
    mergedCells,
    getAllColumnIds,
    onRowsChange: (newRows) => commit(columns, newRows),
    onColumnsChange: (newColumns) => commit(newColumns, rows),
    onMergedCellsChange: setMergedCells,
  });

  const addRow = (rowType: RowType = 'content') => {
    const newRow = addRowUtil(rowType, rows, nextRowId);
    if (rowType === 'header') {
      // Insert header rows at the top
      commit(columns, [newRow, ...rows]);
    } else {
      commit(columns, [...rows, newRow]);
    }
  };

  const removeRow = (id: string) => {
    const result = removeRowUtil(id, rows, mergedCells);
    setMergedCells(result.newMerged);
    commit(columns, result.newRows);
  };

  const addColumn = () => {
    const newCol = addColumnUtil(columns, nextColId);
    commit([...columns, newCol], rows);
  };

  const removeColumn = (id: string) => {
    const result = removeColumnUtil(id, columns, rows, mergedCells);
    setMergedCells(result.newMerged);
    commit(result.newColumns, result.newRows);
  };

  const updateColumnLabel = (id: string, label: string) => {
    const nextCols = updateColumnLabelUtil(id, label, columns);
    commit(nextCols, rows);
  };

  const updateRowLabel = (id: string, label: string) => {
    const nextRows = updateRowLabelUtil(id, label, rows);
    commit(columns, nextRows);
  };

  const toggleRowType = (id: string) => {
    const nextRows: TableRow[] = rows.map((r) =>
      r.id === id
        ? ({ ...r, rowType: r.rowType === 'header' ? 'content' : 'header' } satisfies TableRow)
        : r,
    );
    commit(columns, nextRows);
  };

  const mergeCells = (startRowId: string, startColId: string, endRowId: string, endColId: string) => {
    const result = mergeCellsUtil(
      startRowId,
      startColId,
      endRowId,
      endColId,
      rows,
      columns,
      mergedCells,
      getAllColumnIds,
    );
    setMergedCells(result.nextMerged);
    if (result.nextRows) {
      commit(columns, result.nextRows);
    }
    if (result.nextCols) {
      commit(result.nextCols, rows);
    }
  };

  const handleUnmergeCell = (rowId: string, colId: string) => {
    const nextMerged = unmergeCellUtil(rowId, colId, mergedCells);
    setMergedCells(nextMerged);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (editingCell) return; // Let cell input handle its own keys
      }

      if (e.key === 'Escape') {
        clearSelection();
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'm' && selectionStart && selectedCell) {
        e.preventDefault();
        if (
          selectionStart.rowId !== selectedCell.rowId ||
          selectionStart.colId !== selectedCell.colId
        ) {
          mergeCells(selectionStart.rowId, selectionStart.colId, selectedCell.rowId, selectedCell.colId);
          clearSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionStart, selectedCell, editingCell, mergeCells, clearSelection]);



  return (
    <div className="flex flex-col gap-3 relative">
      {errorMessage && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-50 border border-red-200 text-red-800 px-4 py-2 text-sm rounded shadow-sm">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-gray-600">
          Spreadsheet-like table. Header rows can use dimension values. Select cells and merge them.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addColumn()}
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
          >
            <Plus size={12} /> Add Column
          </button>
          <button
            type="button"
            onClick={() => addRow('content')}
            className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800"
          >
            <Plus size={12} /> Add Row
          </button>
          <button
            type="button"
            onClick={() => addRow('header')}
            className="inline-flex items-center gap-1 text-[11px] text-green-600 hover:text-green-800"
          >
            <Plus size={12} /> Add Header
          </button>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="border-b border-r border-slate-200 px-2 py-1 text-left w-32 text-[10px] font-semibold text-slate-600 bg-slate-100">
              </th>
              {visibleColumns.flatMap((parent, parentIndex) => {
                const children = childColumns(parent.id);
                const allColIds = getAllColumnIds();
                if (children.length === 0) {
                  const colIndex = allColIds.indexOf(parent.id);
                  return [
                    <TableHeaderCell
                      key={parent.id}
                      column={parent}
                      isChild={false}
                      dimensionValues={dimensionValues}
                      linkedValuesSet={linkedValuesSet}
                      mergedCells={mergedCells}
                      selectionStart={selectionStart}
                      selectedCell={selectedCell}
                      editingCell={editingCell}
                      editingValue={editingValue}
                      inputRef={inputRef}
                      getAllColumnIds={getAllColumnIds}
                      onMouseDown={handleCellMouseDown}
                      onInputChange={handleCellInput}
                      onInputBlur={() => finishEditing()}
                      onInputKeyDown={handleCellKeyDown}
                      onColumnLabelChange={updateColumnLabel}
                      onRemoveColumn={removeColumn}
                      onMoveColumn={moveColumn}
                      onUnmerge={handleUnmergeCell}
                      onClearSelection={clearSelection}
                      colIndex={colIndex}
                      totalCols={allColIds.length}
                    />,
                  ];
                }
                return children.map((child, childIndex) => {
                  const colIndex = allColIds.indexOf(child.id);
                  return (
                    <TableHeaderCell
                      key={child.id}
                      column={child}
                      isChild={true}
                      dimensionValues={dimensionValues}
                      linkedValuesSet={linkedValuesSet}
                      mergedCells={mergedCells}
                      selectionStart={selectionStart}
                      selectedCell={selectedCell}
                      editingCell={editingCell}
                      editingValue={editingValue}
                      inputRef={inputRef}
                      getAllColumnIds={getAllColumnIds}
                      onMouseDown={handleCellMouseDown}
                      onInputChange={handleCellInput}
                      onInputBlur={() => finishEditing()}
                      onInputKeyDown={handleCellKeyDown}
                      onColumnLabelChange={updateColumnLabel}
                      onRemoveColumn={removeColumn}
                      onMoveColumn={moveColumn}
                      onUnmerge={handleUnmergeCell}
                      onClearSelection={clearSelection}
                      colIndex={colIndex}
                      totalCols={allColIds.length}
                    />
                  );
                });
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <TableRowLabelCell
                  row={row}
                  rowIndex={rowIndex}
                  totalRows={rows.length}
                  onLabelChange={updateRowLabel}
                  onRemoveRow={removeRow}
                  onMoveRow={moveRow}
                />
                {visibleColumns.flatMap((parent) => {
                  const children = childColumns(parent.id);
                  if (children.length === 0) {
                    return [
                      <TableDataCell
                        key={parent.id}
                        row={row}
                        colId={parent.id}
                        mergedCells={mergedCells}
                        linkedValuesSet={linkedValuesSet}
                        selectionStart={selectionStart}
                        selectedCell={selectedCell}
                        editingCell={editingCell}
                        editingValue={editingValue}
                        suggestions={suggestions}
                        suggestionIndex={suggestionIndex}
                        inputRef={inputRef}
                        getAllColumnIds={getAllColumnIds}
                        rows={rows}
                        onMouseDown={handleCellMouseDown}
                        onMouseEnter={handleCellMouseEnter}
                        onMouseUp={handleCellMouseUp}
                        onDoubleClick={startEditing}
                        onInputChange={handleCellInput}
                        onInputBlur={() => finishEditing(true)}
                        onInputKeyDown={handleCellKeyDown}
                        onSuggestionClick={(suggestion) => {
                          finishEditing(true, suggestion);
                        }}
                        onUnmerge={handleUnmergeCell}
                        onClearSelection={() => {
                          setSelectionStart(null);
                          setSelectedCell(null);
                        }}
                      />,
                    ];
                  }
                  return children.map((child) => (
                    <TableDataCell
                      key={child.id}
                      row={row}
                      colId={child.id}
                      mergedCells={mergedCells}
                      linkedValuesSet={linkedValuesSet}
                      selectionStart={selectionStart}
                      selectedCell={selectedCell}
                      editingCell={editingCell}
                      editingValue={editingValue}
                      suggestions={suggestions}
                      suggestionIndex={suggestionIndex}
                      inputRef={inputRef}
                      getAllColumnIds={getAllColumnIds}
                      rows={rows}
                      onMouseDown={handleCellMouseDown}
                      onMouseEnter={handleCellMouseEnter}
                      onMouseUp={handleCellMouseUp}
                      onDoubleClick={startEditing}
                      onInputChange={handleCellInput}
                      onInputBlur={() => finishEditing(true)}
                      onInputKeyDown={handleCellKeyDown}
                      onSuggestionClick={(suggestion) => {
                        finishEditing(true, suggestion);
                      }}
                      onUnmerge={handleUnmergeCell}
                      onClearSelection={clearSelection}
                    />
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCell &&
        selectionStart &&
        (selectionStart.rowId !== selectedCell.rowId ||
          selectionStart.colId !== selectedCell.colId) && (
          <div className="absolute bottom-3 right-3">
            <div className="flex items-center gap-1 p-1.5 bg-white/90 border border-slate-200 rounded-full shadow-sm group">
              <button
                type="button"
                onClick={() => {
                  mergeCells(
                    selectionStart.rowId,
                    selectionStart.colId,
                    selectedCell.rowId,
                    selectedCell.colId,
                  );
                  setSelectionStart(null);
                  setSelectedCell(null);
                }}
                className="inline-flex items-center justify-center p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-full"
              >
                <Merge size={14} />
              </button>
              <div className="pointer-events-none absolute -top-7 right-0 hidden rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white text-center whitespace-nowrap shadow group-hover:block">
                Merge Cells
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
