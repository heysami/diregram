import { type GridColumnV1, type GridDoc, type GridRowV1, type GridSheetV1, type GridTableV1 } from '@/lib/gridjson';

function normalizeNewlines(s: string): string {
  return String(s ?? '').replace(/\r\n?/g, '\n');
}

function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractFencedBody(src: string, fence: string): string {
  const s = normalizeNewlines(src).trim();
  const re = new RegExp('```' + fence + '[ \\t]*\\n([\\s\\S]*?)\\n```');
  const m = s.match(re);
  return (m ? m[1] : s).trim();
}

export function parseGridSheetTemplatePayload(rendered: string): { version: 1; sheet: Omit<GridSheetV1, 'id'> & { id?: string } } {
  const body = extractFencedBody(rendered, 'nexus-grid-sheet');
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid grid sheet template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported grid sheet template version.');
  if (!parsed.sheet || typeof parsed.sheet !== 'object') throw new Error('Invalid sheet template payload.');
  return parsed as any;
}

export type GridTableTemplateV1 = {
  version: 1;
  rows: number;
  cols: number;
  headerRows: number;
  headerCols: number;
  footerRows: number;
  cells: Record<string, string>; // `${rIdx}:${cIdx}` -> value
};

export function parseGridTableTemplatePayload(rendered: string): GridTableTemplateV1 {
  const body = extractFencedBody(rendered, 'nexus-grid-table');
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid table template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported table template version.');
  const rows = Number(parsed.rows);
  const cols = Number(parsed.cols);
  const headerRows = Number(parsed.headerRows);
  const headerCols = Number(parsed.headerCols);
  const footerRows = Number(parsed.footerRows);
  if (!Number.isFinite(rows) || rows <= 0) throw new Error('Invalid rows.');
  if (!Number.isFinite(cols) || cols <= 0) throw new Error('Invalid cols.');
  const cellsRaw = parsed.cells && typeof parsed.cells === 'object' ? (parsed.cells as Record<string, unknown>) : {};
  const cells: Record<string, string> = {};
  Object.entries(cellsRaw).forEach(([k, v]) => {
    if (typeof v !== 'string') return;
    const kk = String(k);
    if (!/^\d+:\d+$/.test(kk)) return;
    cells[kk] = v;
  });
  return {
    version: 1,
    rows: Math.min(500, Math.max(1, Math.floor(rows))),
    cols: Math.min(200, Math.max(1, Math.floor(cols))),
    headerRows: Number.isFinite(headerRows) ? Math.max(0, Math.floor(headerRows)) : 0,
    headerCols: Number.isFinite(headerCols) ? Math.max(0, Math.floor(headerCols)) : 0,
    footerRows: Number.isFinite(footerRows) ? Math.max(0, Math.floor(footerRows)) : 0,
    cells,
  };
}

export function buildPreviewDocFromGridTableTemplate(tpl: GridTableTemplateV1): GridDoc {
  const cols: GridColumnV1[] = Array.from({ length: tpl.cols }).map((_, i) => ({ id: `c-${i + 1}`, width: 88 }));
  const rows: GridRowV1[] = Array.from({ length: tpl.rows }).map((_, i) => ({ id: `r-${i + 1}`, height: 22 }));
  const rowIds = rows.map((r) => r.id);
  const colIds = cols.map((c) => c.id);
  const cells: Record<string, any> = {};
  Object.entries(tpl.cells || {}).forEach(([k, v]) => {
    const [rStr, cStr] = String(k).split(':');
    const rIdx = Math.floor(Number(rStr));
    const cIdx = Math.floor(Number(cStr));
    if (!Number.isFinite(rIdx) || !Number.isFinite(cIdx)) return;
    if (rIdx < 0 || cIdx < 0) return;
    if (rIdx >= rowIds.length || cIdx >= colIds.length) return;
    const key = `${rowIds[rIdx]}:${colIds[cIdx]}`;
    cells[key] = { value: String(v ?? '') };
  });
  const table: GridTableV1 = {
    id: 'tbl-1',
    rowIds,
    colIds,
    headerRows: Math.max(0, Math.min(rowIds.length, tpl.headerRows || 0)),
    headerCols: Math.max(0, Math.min(colIds.length, tpl.headerCols || 0)),
    footerRows: Math.max(0, Math.min(Math.max(0, rowIds.length), tpl.footerRows || 0)),
  };
  const sheetId = 'sheet-1';
  const sheet: GridSheetV1 = {
    id: sheetId,
    name: 'Preview',
    mode: 'spreadsheet',
    grid: { columns: cols, rows, cells, regions: [], tables: [table] },
    cards: [],
    database: { properties: [], rows: [], views: [{ id: 'view-1', name: 'Table', kind: 'table' }], activeViewId: 'view-1' },
  };
  return { version: 1, activeSheetId: sheetId, sheets: [sheet] } as any;
}

