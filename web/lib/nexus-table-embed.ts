import { loadGridDoc, type GridDoc, type GridSheetV1, type GridTableV1 } from '@/lib/gridjson';

export type NexusTableSource =
  | { type: 'gridTable'; fileId: string; sheetId: string; tableId: string }
  | { type: 'gridSheet'; fileId: string; sheetId: string };

export type NexusTableSpec = {
  id: string;
  mode?: 'intersection' | 'union';
  sources: NexusTableSource[];
};

export type NormalizedTable = {
  sourceLabel: string;
  columns: string[]; // display names
  columnsKey: string[]; // normalized keys (same length)
  rows: Array<Record<string, string>>; // keyed by normalized column key
};

function colLabel(idx: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = idx + 1;
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out || 'A';
}

function findGridTable(doc: GridDoc, sheetId: string, tableId: string): { sheet: GridSheetV1; table: GridTableV1 } | null {
  const sheet = (doc.sheets || []).find((s) => s.id === sheetId) || null;
  if (!sheet) return null;
  const table = (sheet.grid.tables || []).find((t) => t.id === tableId) || null;
  if (!table) return null;
  return { sheet, table };
}

function findGridSheet(doc: GridDoc, sheetId: string): GridSheetV1 | null {
  return (doc.sheets || []).find((s) => s.id === sheetId) || null;
}

function normalizeColKey(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function disambiguate(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = String(n || '').trim() || 'Column';
    const k = base.toLowerCase();
    const next = (seen.get(k) || 0) + 1;
    seen.set(k, next);
    return next === 1 ? base : `${base} (${next})`;
  });
}

function gridTableToNormalized(markdown: string, src: Extract<NexusTableSource, { type: 'gridTable' }>): NormalizedTable | null {
  const loaded = loadGridDoc(markdown);
  const found = findGridTable(loaded.doc, src.sheetId, src.tableId);
  if (!found) return null;
  const { sheet, table } = found;

  const hr = Math.max(0, Math.round(table.headerRows || 0));
  const fr = Math.max(0, Math.round(table.footerRows || 0));
  const headerRowId = table.rowIds[Math.max(0, Math.min(table.rowIds.length - 1, hr > 0 ? hr - 1 : 0))] || table.rowIds[0] || '';
  const dataRowIds = table.rowIds.slice(hr, Math.max(hr, table.rowIds.length - fr));

  // Column display names come from the header row, falling back to A/B/C…
  const colNamesRaw = table.colIds.map((colId, idx) => {
    const k = `${headerRowId}:${colId}`;
    const v = String(sheet.grid.cells[k]?.value ?? '').trim();
    return v || colLabel(idx);
  });
  const colNames = disambiguate(colNamesRaw);
  const colKeys = colNames.map((n) => normalizeColKey(n));

  const rows: Array<Record<string, string>> = dataRowIds.map((rowId) => {
    const rec: Record<string, string> = {};
    table.colIds.forEach((colId, idx) => {
      const k = `${rowId}:${colId}`;
      const v = String(sheet.grid.cells[k]?.value ?? '');
      rec[colKeys[idx] || `c:${idx}`] = v;
    });
    return rec;
  });

  return {
    sourceLabel: `${src.fileId}:${src.sheetId}:${src.tableId}`,
    columns: colNames,
    columnsKey: colKeys,
    rows,
  };
}

function gridSheetToNormalized(markdown: string, src: Extract<NexusTableSource, { type: 'gridSheet' }>): NormalizedTable | null {
  const loaded = loadGridDoc(markdown);
  const sheet = findGridSheet(loaded.doc, src.sheetId);
  if (!sheet) return null;

  if (sheet.mode === 'database') {
    const props = Array.isArray(sheet.database?.properties) ? sheet.database.properties : [];
    const colNames = disambiguate(props.map((p: any) => String(p?.name || p?.id || 'Property')));
    const colKeys = colNames.map((n) => normalizeColKey(n));
    const rows = (Array.isArray(sheet.database?.rows) ? sheet.database.rows : []).map((rw: any) => {
      const rec: Record<string, string> = {};
      props.forEach((p: any, idx: number) => {
        const pid = String(p?.id || '');
        const v = (rw && typeof rw === 'object' ? (rw as any).cells?.[pid] : undefined) as any;
        const str =
          v === null || v === undefined
            ? ''
            : Array.isArray(v)
              ? v.map((x) => (x === null || x === undefined ? '' : String(x))).filter(Boolean).join(', ')
              : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v);
        rec[colKeys[idx] || `c:${idx}`] = str;
      });
      return rec;
    });
    return {
      sourceLabel: `${src.fileId}:${src.sheetId}:database`,
      columns: colNames,
      columnsKey: colKeys,
      rows,
    };
  }

  // Spreadsheet mode: best-effort "whole sheet" view (bounded + trimmed on bottom/right).
  const MAX_COLS = 20;
  const MAX_ROWS = 50;
  const colIdsAll = (sheet.grid.columns || []).map((c) => c.id).slice(0, MAX_COLS);
  const rowIdsAll = (sheet.grid.rows || []).map((r) => r.id).slice(0, MAX_ROWS + 1);
  const headerRowId = rowIdsAll[0] || '';
  const dataRowIdsAll = rowIdsAll.slice(1);

  const lastColIdx = (() => {
    let last = -1;
    for (let i = 0; i < colIdsAll.length; i += 1) {
      const colId = colIdsAll[i]!;
      const headerKey = `${headerRowId}:${colId}`;
      const headerVal = String(sheet.grid.cells[headerKey]?.value ?? '').trim();
      if (headerVal) last = i;
      for (let r = 0; r < dataRowIdsAll.length; r += 1) {
        const rowId = dataRowIdsAll[r]!;
        const k = `${rowId}:${colId}`;
        const v = String(sheet.grid.cells[k]?.value ?? '').trim();
        if (v) {
          last = i;
          break;
        }
      }
    }
    return last;
  })();
  const colIds = colIdsAll.slice(0, Math.max(1, lastColIdx + 1));

  const colNamesRaw = colIds.map((colId, idx) => {
    const k = `${headerRowId}:${colId}`;
    const v = String(sheet.grid.cells[k]?.value ?? '').trim();
    return v || colLabel(idx);
  });
  const colNames = disambiguate(colNamesRaw);
  const colKeys = colNames.map((n) => normalizeColKey(n));

  const lastRowIdx = (() => {
    let last = -1;
    for (let r = 0; r < dataRowIdsAll.length; r += 1) {
      const rowId = dataRowIdsAll[r]!;
      let any = false;
      for (let c = 0; c < colIds.length; c += 1) {
        const colId = colIds[c]!;
        const k = `${rowId}:${colId}`;
        const v = String(sheet.grid.cells[k]?.value ?? '').trim();
        if (v) {
          any = true;
          break;
        }
      }
      if (any) last = r;
    }
    return last;
  })();
  const dataRowIds = dataRowIdsAll.slice(0, Math.max(0, lastRowIdx + 1));

  const rows = dataRowIds.map((rowId) => {
    const rec: Record<string, string> = {};
    colIds.forEach((colId, idx) => {
      const k = `${rowId}:${colId}`;
      const v = String(sheet.grid.cells[k]?.value ?? '');
      rec[colKeys[idx] || `c:${idx}`] = v;
    });
    return rec;
  });

  return {
    sourceLabel: `${src.fileId}:${src.sheetId}:sheet`,
    columns: colNames,
    columnsKey: colKeys,
    rows,
  };
}

export function normalizeNexusTableSource(markdown: string, src: NexusTableSource): NormalizedTable | null {
  if (src.type === 'gridTable') return gridTableToNormalized(markdown, src);
  if (src.type === 'gridSheet') return gridSheetToNormalized(markdown, src);
  return null;
}

export function mergeNormalizedTables(params: {
  tables: NormalizedTable[];
  mode: 'intersection' | 'union';
}): { kind: 'stacked' | 'joined'; columns: Array<{ key: string; name: string }>; rows: Array<Record<string, string>> } {
  const { tables, mode } = params;
  if (tables.length === 1) {
    const t = tables[0]!;
    return {
      kind: 'joined',
      columns: t.columnsKey.map((k, idx) => ({ key: k, name: t.columns[idx] || k })),
      rows: t.rows,
    };
  }
  const allKeys = new Set<string>();
  const keyCount = new Map<string, number>();
  const displayNameByKey = new Map<string, string>();
  tables.forEach((t) => {
    t.columnsKey.forEach((k, idx) => {
      allKeys.add(k);
      keyCount.set(k, (keyCount.get(k) || 0) + 1);
      if (!displayNameByKey.has(k)) displayNameByKey.set(k, t.columns[idx] || k);
    });
  });

  const commonKeys = Array.from(allKeys).filter((k) => (keyCount.get(k) || 0) === tables.length);
  const finalKeys = (mode === 'intersection' ? commonKeys : Array.from(allKeys)).filter(Boolean);
  const columns = finalKeys.map((k) => ({ key: k, name: displayNameByKey.get(k) || k }));

  const canJoin = commonKeys.length > 0;
  if (!canJoin) {
    const includeSourceCol = tables.length > 1;
    const stackedCols = includeSourceCol ? [{ key: '__source', name: 'source' }, ...columns] : columns;
    const rows = tables.flatMap((t) =>
      t.rows.map((r) => {
        const out: Record<string, string> = includeSourceCol ? { __source: t.sourceLabel } : {};
        columns.forEach((c) => {
          out[c.key] = String(r[c.key] ?? '');
        });
        return out;
      }),
    );
    return { kind: 'stacked', columns: stackedCols, rows };
  }

  const joinKeyFor = (row: Record<string, string>) => {
    const parts = commonKeys.map((k) => String(row[k] ?? '').trim().toLowerCase());
    const key = parts.join('||');
    return key.replace(/\|+/g, '|').replace(/^\|+|\|+$/g, '');
  };

  const allRows = tables.flatMap((t) => t.rows.map((r) => ({ t, r })));
  const keys = allRows.map(({ r }) => joinKeyFor(r));
  const valid = keys.filter((k) => k.trim().length > 0);
  const uniq = new Set(valid).size;
  const total = keys.length;
  const validRatio = total > 0 ? valid.length / total : 0;
  const uniqRatio = valid.length > 0 ? uniq / valid.length : 0;

  if (validRatio < 0.5 || uniqRatio < 0.3) {
    const includeSourceCol = tables.length > 1;
    const stackedCols = includeSourceCol ? [{ key: '__source', name: 'source' }, ...columns] : columns;
    const rows = tables.flatMap((t) =>
      t.rows.map((r) => {
        const out: Record<string, string> = includeSourceCol ? { __source: t.sourceLabel } : {};
        columns.forEach((c) => {
          out[c.key] = String(r[c.key] ?? '');
        });
        return out;
      }),
    );
    return { kind: 'stacked', columns: stackedCols, rows };
  }

  const merged = new Map<string, Record<string, string>>();
  allRows.forEach(({ t, r }) => {
    const k = joinKeyFor(r);
    if (!k.trim()) return;
    const existing = merged.get(k) || {};
    existing.__source = existing.__source || t.sourceLabel;
    finalKeys.forEach((colKey) => {
      const v = String(r[colKey] ?? '').trim();
      if (!v) return;
      if (!existing[colKey]) existing[colKey] = v;
    });
    merged.set(k, existing);
  });

  const rows = Array.from(merged.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, r]) => r);

  return { kind: 'joined', columns, rows };
}

