import { TableColumn, TableRow, MergedCell } from '@/components/DimensionTableEditor';

/**
 * Table Serialization Module
 * 
 * Handles serialization and deserialization of table data to/from markdown format.
 * The table is stored as a JSON structure in a markdown code block for full fidelity.
 */

export interface SerializedTableData {
  columns: TableColumn[];
  rows: Array<{
    id: string;
    label: string;
    rowType: 'header' | 'content';
    cells: Record<string, string>;
  }>;
  mergedCells: Array<{
    key: string;
    rowId: string;
    colId: string;
    colspan: number;
    rowspan: number;
  }>;
  keyValueCells: Array<{
    rowId: string;
    colId: string;
    isKeyValue: boolean;
  }>;
}

/**
 * Serializes table data to markdown format using a JSON code block.
 * Includes all columns, rows (with rowType), merged cells, and key value cell markers.
 */
export function serializeTableToMarkdown(
  columns: TableColumn[],
  rows: TableRow[],
  mergedCells: Map<string, MergedCell> | null,
  dimensionValues: string[],
): string[] {
  if (!columns.length) return [];

  // Convert mergedCells Map to array for JSON serialization
  const mergedCellsArray = mergedCells
    ? Array.from(mergedCells.entries()).map(([key, merged]) => ({
        key,
        rowId: merged.rowId,
        colId: merged.colId,
        colspan: merged.colspan,
        rowspan: merged.rowspan,
      }))
    : [];

  // Determine which cells contain dimension values (key values)
  const keyValueCells: Array<{ rowId: string; colId: string; isKeyValue: boolean }> = [];
  rows.forEach((row) => {
    Object.keys(row.cells).forEach((colId) => {
      const cellValue = row.cells[colId];
      const isKeyValue = cellValue && dimensionValues.includes(cellValue);
      if (isKeyValue) {
        keyValueCells.push({ rowId: row.id, colId, isKeyValue: true });
      }
    });
  });

  // Create JSON structure with all table data
  const tableData: SerializedTableData = {
    columns,
    rows: rows.map((row) => ({
      id: row.id,
      label: row.label,
      rowType: row.rowType,
      cells: row.cells,
    })),
    mergedCells: mergedCellsArray,
    keyValueCells,
  };

  const lines: string[] = [];
  lines.push('```tablejson');
  lines.push(JSON.stringify(tableData, null, 2));
  lines.push('```');
  return lines;
}

/**
 * Parses table data from markdown format.
 * Extracts the JSON structure from the tablejson code block.
 */
export function parseTableFromMarkdown(bodyLines: string[]): {
  columns: TableColumn[];
  rows: TableRow[];
  mergedCells: Map<string, MergedCell>;
  keyValueCells: Array<{ rowId: string; colId: string }>;
} | null {
  const content = bodyLines.join('\n');
  const codeBlockMatch = content.match(/```tablejson\n([\s\S]*?)\n```/);
  
  if (!codeBlockMatch) {
    return null;
  }

  try {
    const tableData: SerializedTableData = JSON.parse(codeBlockMatch[1]);
    
    // Convert mergedCells array back to Map
    const mergedCells = new Map<string, MergedCell>();
    tableData.mergedCells.forEach((merged) => {
      mergedCells.set(merged.key, {
        rowId: merged.rowId,
        colId: merged.colId,
        colspan: merged.colspan,
        rowspan: merged.rowspan,
      });
    });

    // Convert rows back to TableRow format
    const rows: TableRow[] = tableData.rows.map((row) => ({
      id: row.id,
      label: row.label,
      rowType: row.rowType,
      cells: row.cells,
    }));

    // Extract keyValueCells
    const keyValueCells = tableData.keyValueCells.map((cell) => ({
      rowId: cell.rowId,
      colId: cell.colId,
    }));

    return {
      columns: tableData.columns,
      rows,
      mergedCells,
      keyValueCells,
    };
  } catch (error) {
    console.error('Failed to parse table JSON:', error);
    return null;
  }
}
