import type { GridCellValueV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';
import { extractTableFilterItems } from '@/lib/grid/tableFilterItems';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function firstLine(s: string): string {
  return String(s || '').split('\n')[0]?.trim() || '';
}

function quote(s: string): string {
  const t = String(s || '');
  if (!t) return '""';
  if (/[\s"\\]/.test(t)) return JSON.stringify(t);
  return `"${t}"`;
}

function formatCellSemantic(v: string): string {
  const trimmed = String(v || '').trim();
  if (!trimmed) return '';
  const items = extractTableFilterItems(trimmed);
  if (!items.length) return quote(trimmed);
  if (items.length === 1 && items[0]!.kind === 'text') return quote(items[0]!.label);

  const nonText = items.filter((x) => x.kind !== 'text');
  const byKind = new Map<string, string[]>();
  for (const it of nonText) {
    const arr = byKind.get(it.kind) || [];
    arr.push(it.label);
    byKind.set(it.kind, arr);
  }
  const parts: string[] = [];
  for (const [k, vals] of byKind.entries()) {
    const uniq = Array.from(new Set(vals.map((x) => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) continue;
    if (uniq.length === 1) parts.push(`${k}=${quote(uniq[0]!)}`);
    else parts.push(`${k}=[${uniq.map(quote).join(', ')}]`);
  }
  parts.sort((a, b) => a.localeCompare(b));
  // Always include raw for mixed/macro content so meaning is explicit.
  return `raw=${quote(trimmed)} ${parts.join(' ')}`.trim();
}

function getCell(cells: Record<string, GridCellValueV1>, rowId: string, colId: string): string {
  return cells[`${rowId}:${colId}`]?.value ?? '';
}

function getDataRowIds(t: GridTableV1): { headerRowIds: string[]; dataRowIds: string[]; footerRowIds: string[] } {
  const hr = clamp(Math.round(t.headerRows || 0), 0, t.rowIds.length);
  const fr = clamp(Math.round(t.footerRows || 0), 0, Math.max(0, t.rowIds.length - hr));
  const headerRowIds = t.rowIds.slice(0, hr);
  const footerRowIds = t.rowIds.slice(Math.max(hr, t.rowIds.length - fr));
  const dataRowIds = t.rowIds.slice(hr, Math.max(hr, t.rowIds.length - fr));
  return { headerRowIds, dataRowIds, footerRowIds };
}

function getDataColIds(t: GridTableV1): { headerColIds: string[]; dataColIds: string[] } {
  const hc = clamp(Math.round(t.headerCols || 0), 0, t.colIds.length);
  const headerColIds = t.colIds.slice(0, hc);
  const dataColIds = t.colIds.slice(hc);
  return { headerColIds, dataColIds };
}

function buildColumnLabels(opts: {
  table: GridTableV1;
  cells: Record<string, GridCellValueV1>;
  dataColIds: string[];
  headerRowId: string | null;
}): Map<string, string> {
  const { table: t, cells, dataColIds, headerRowId } = opts;
  const out = new Map<string, string>();
  dataColIds.forEach((colId, idx) => {
    const base = `col#${idx + 1}`;
    const h = headerRowId ? firstLine(getCell(cells, headerRowId, colId)) : '';
    out.set(colId, h ? `${h}` : base);
  });
  // Keep stable for any missing columns.
  t.colIds.forEach((colId, idx) => {
    if (!out.has(colId)) out.set(colId, `col#${idx + 1}`);
  });
  return out;
}

function buildRowLabels(opts: {
  table: GridTableV1;
  cells: Record<string, GridCellValueV1>;
  dataRowIds: string[];
  headerColIds: string[];
}): Map<string, string> {
  const { cells, dataRowIds, headerColIds } = opts;
  const out = new Map<string, string>();
  dataRowIds.forEach((rowId, idx) => {
    const parts = headerColIds.map((colId) => firstLine(getCell(cells, rowId, colId))).filter(Boolean);
    out.set(rowId, parts.length ? parts.join(' / ') : `row#${idx + 1}`);
  });
  return out;
}

export function buildGroupingSemanticTreeForSheet(sheet: GridSheetV1, opts?: { maxRows?: number; maxCols?: number; maxCells?: number }): string {
  const maxRows = opts?.maxRows ?? 30;
  const maxCols = opts?.maxCols ?? 20;
  const maxCells = opts?.maxCells ?? 250;

  const tables = sheet.grid.tables || [];
  const cells = sheet.grid.cells || {};
  const relevant = tables.filter((t) => t.kind === 'groupingCellValue' || t.kind === 'groupingHeaderValue');

  const lines: string[] = [];
  lines.push('IMPORTANT: Grouping table types change the meaning of the grid.');
  lines.push('IMPORTANT: This interpretation is semantic — it is not just formatting.');
  lines.push('');

  if (!relevant.length) {
    lines.push('(No tables on this sheet are set to “Grouping — cell as value” or “Grouping — header as value”.)');
    return lines.join('\n');
  }

  let totalCellsEmitted = 0;

  for (const t of relevant) {
    const kindLabel = t.kind === 'groupingCellValue' ? 'Grouping — cell as value' : 'Grouping — header as value';
    lines.push(`TABLE ${t.id}`);
    lines.push(`  type: ${kindLabel}`);
    lines.push('  IMPORTANT: semantics below are significant.');

    const { headerRowIds, dataRowIds } = getDataRowIds(t);
    const { headerColIds, dataColIds } = getDataColIds(t);
    const headerRowId = headerRowIds.length ? headerRowIds[headerRowIds.length - 1]! : null;

    const colLabels = buildColumnLabels({ table: t, cells, dataColIds, headerRowId });
    const rowLabels = buildRowLabels({ table: t, cells, dataRowIds, headerColIds });

    if (t.kind === 'groupingCellValue') {
      lines.push('  interpretation: each DATA ROW is an object; each non-empty DATA CELL adds an attribute (from the column).');
      lines.push('  rows:');

      const rowsToShow = dataRowIds.slice(0, maxRows);
      const colsToShow = dataColIds.slice(0, maxCols);

      for (const rowId of rowsToShow) {
        const rLabel = rowLabels.get(rowId) || rowId;
        lines.push(`    - ${rLabel}`);
        let emittedAny = false;
        for (const colId of colsToShow) {
          const v = getCell(cells, rowId, colId);
          const sem = formatCellSemantic(v);
          if (!sem) continue;
          emittedAny = true;
          totalCellsEmitted += 1;
          const attr = colLabels.get(colId) || colId;
          lines.push(`        ${attr}: ${sem}`);
          if (totalCellsEmitted >= maxCells) break;
        }
        if (!emittedAny) lines.push('        (no attributes: all visible data cells empty)');
        if (totalCellsEmitted >= maxCells) break;
      }
    } else {
      lines.push('  interpretation: each non-empty DATA CELL is an object; its position (row/column headers) provides meaning.');
      lines.push('  cells:');

      const rowsToShow = dataRowIds.slice(0, maxRows);
      const colsToShow = dataColIds.slice(0, maxCols);

      for (const rowId of rowsToShow) {
        const rLabel = rowLabels.get(rowId) || rowId;
        for (const colId of colsToShow) {
          const v = getCell(cells, rowId, colId);
          const sem = formatCellSemantic(v);
          if (!sem) continue;
          totalCellsEmitted += 1;
          const cLabel = colLabels.get(colId) || colId;
          lines.push(`    - item: ${sem}`);
          lines.push(`        row: ${quote(rLabel)}`);
          lines.push(`        column: ${quote(cLabel)}`);
          if (totalCellsEmitted >= maxCells) break;
        }
        if (totalCellsEmitted >= maxCells) break;
      }
    }

    if (dataRowIds.length > maxRows || dataColIds.length > maxCols || totalCellsEmitted >= maxCells) {
      lines.push('');
      lines.push(
        `  (preview limited: showing up to ${maxRows} row(s), ${maxCols} col(s), ${maxCells} non-empty cell(s) across grouping tables)`,
      );
    }

    lines.push('');
    if (totalCellsEmitted >= maxCells) {
      lines.push('(Stopped early due to preview limit.)');
      break;
    }
  }

  return lines.join('\n');
}

