import type { GridSheetV1, GridTableV1 } from '@/lib/gridjson';
import type { NexusDataObject } from '@/lib/data-object-storage';
import { loadDataObjectAttributes, type DataObjectAttribute } from '@/lib/data-object-attributes';
import {
  insertTableColumnAfter as insertTableColumnAfterModel,
  insertTableRowAfter as insertTableRowAfterModel,
  setCellValue as setCellValueModel,
  setTableHeaderCols as setTableHeaderColsModel,
  setTableHeaderRows as setTableHeaderRowsModel,
  setTableFooterRows as setTableFooterRowsModel,
  setTableKind as setTableKindModel,
  setTableKeyColId as setTableKeyColIdModel,
} from '@/lib/grid/spreadsheetModel';

function segMacro(opts: string[], selected?: string): string {
  const cleaned = (opts || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!cleaned.length) return '';
  const sel = selected && cleaned.includes(selected) ? selected : cleaned[0]!;
  return `{{${cleaned.map((o) => (o === sel ? `*${o}` : o)).join('|')}}}`;
}

function splitSamples(raw: string | undefined): string[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  // Split by comma, trim, drop empties.
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function findTable(sheet: GridSheetV1, tableId: string): GridTableV1 | null {
  return (sheet.grid.tables || []).find((t) => t.id === tableId) || null;
}

/**
 * Structure-only sync for a linked table in **columns mode**.
 *
 * This will:
 * - ensure table semantics (sourceData, headerRows=1, etc.)
 * - ensure the attribute columns exist and are mapped stably
 * - update the header row labels
 *
 * It will NOT:
 * - resize/trim rows based on samples
 * - write sample values into cells (so user edits are preserved)
 */
export function syncLinkedDataObjectTableStructure(opts: {
  sheet: GridSheetV1;
  tableId: string;
  diagramFileId: string;
  diagramRoomName: string;
  dataObject: NexusDataObject;
  previousLink?: GridTableV1['dataObjectLink'];
}): { sheet: GridSheetV1; link: NonNullable<GridTableV1['dataObjectLink']> } {
  const { tableId, diagramFileId, diagramRoomName, dataObject, previousLink } = opts;
  let sheet = opts.sheet;

  let t = findTable(sheet, tableId);
  if (!t) throw new Error(`Table not found: ${tableId}`);
  if (!t.rowIds.length || !t.colIds.length) throw new Error(`Invalid table (empty): ${tableId}`);

  // Normalize table shape/semantics.
  sheet = setTableHeaderRowsModel(sheet, tableId, 1);
  sheet = setTableHeaderColsModel(sheet, tableId, 0);
  sheet = setTableFooterRowsModel(sheet, tableId, 0);
  sheet = setTableKindModel(sheet, tableId, 'sourceData');
  t = findTable(sheet, tableId)!;

  const headerRowId = t.rowIds[0]!;
  const objectNameColId = t.colIds[0]!;

  const attrs: DataObjectAttribute[] = loadDataObjectAttributes(dataObject.data);
  const prevMap = previousLink?.attributeColIds || {};

  const used = new Set<string>([objectNameColId]);
  const colIdByAttrId: Record<string, string> = {};
  const reserveOrAppend = (preferredColId: string | null): string => {
    if (preferredColId && t.colIds.includes(preferredColId) && !used.has(preferredColId)) {
      used.add(preferredColId);
      return preferredColId;
    }
    for (const cid of t.colIds.slice(1)) {
      if (!used.has(cid)) {
        used.add(cid);
        return cid;
      }
    }
    const after = t.colIds[t.colIds.length - 1]!;
    sheet = insertTableColumnAfterModel(sheet, tableId, after);
    t = findTable(sheet, tableId)!;
    const nextCid = t.colIds[t.colIds.length - 1]!;
    used.add(nextCid);
    return nextCid;
  };

  attrs.forEach((a) => {
    const preferred = typeof prevMap[a.id] === 'string' ? prevMap[a.id]! : null;
    colIdByAttrId[a.id] = reserveOrAppend(preferred);
  });

  // Keep table columns aligned to the data object attributes.
  const desiredColIds = [objectNameColId, ...attrs.map((a) => colIdByAttrId[a.id]!)].filter(Boolean);
  sheet = {
    ...sheet,
    grid: {
      ...sheet.grid,
      tables: (sheet.grid.tables || []).map((tb) => (tb.id === tableId ? { ...tb, colIds: desiredColIds } : tb)),
    },
  };
  t = findTable(sheet, tableId)!;

  // Key column: object name col.
  sheet = setTableKeyColIdModel(sheet, tableId, objectNameColId);

  // Header labels only (no data writes).
  sheet = setCellValueModel(sheet, headerRowId, objectNameColId, (dataObject.name || '').trim() || dataObject.id);
  attrs.forEach((a) => {
    const colId = colIdByAttrId[a.id]!;
    sheet = setCellValueModel(sheet, headerRowId, colId, a.name);
  });

  const link: NonNullable<GridTableV1['dataObjectLink']> = {
    mode: 'columns',
    diagramFileId,
    diagramRoomName,
    dataObjectId: dataObject.id,
    objectNameColId,
    attributeColIds: colIdByAttrId,
    dataRowId: t.rowIds[1] || t.rowIds[0]!, // best-effort
  };

  sheet = {
    ...sheet,
    grid: {
      ...sheet.grid,
      tables: (sheet.grid.tables || []).map((tb) => (tb.id === tableId ? { ...tb, dataObjectLink: link } : tb)),
    },
  };

  return { sheet, link };
}

/**
 * Materialize a linked table in **columns mode**:
 * - First column is Object name (key id)
 * - Each attribute becomes a column
 * - Sample values are split by comma into multiple data rows
 */
export function materializeLinkedDataObjectTable(opts: {
  sheet: GridSheetV1;
  tableId: string;
  diagramFileId: string;
  diagramRoomName: string;
  dataObject: NexusDataObject;
  previousLink?: GridTableV1['dataObjectLink'];
}): { sheet: GridSheetV1; link: NonNullable<GridTableV1['dataObjectLink']> } {
  const { tableId, diagramFileId, diagramRoomName, dataObject, previousLink } = opts;
  let sheet = opts.sheet;

  let t = findTable(sheet, tableId);
  if (!t) throw new Error(`Table not found: ${tableId}`);
  if (!t.rowIds.length || !t.colIds.length) throw new Error(`Invalid table (empty): ${tableId}`);

  // Normalize table shape/semantics.
  sheet = setTableHeaderRowsModel(sheet, tableId, 1);
  sheet = setTableHeaderColsModel(sheet, tableId, 0);
  sheet = setTableFooterRowsModel(sheet, tableId, 0);
  sheet = setTableKindModel(sheet, tableId, 'sourceData');
  t = findTable(sheet, tableId)!;

  const objectNameColId = t.colIds[0]!;

  // Build attribute list + stable mapping to columns.
  const attrs: DataObjectAttribute[] = loadDataObjectAttributes(dataObject.data);

  const prevMap = previousLink?.attributeColIds || {};
  // Track assigned columns. Start with the object-name column reserved.
  // IMPORTANT: do NOT pre-seed with prevMap values, or we will never be able to reuse the preferred columns
  // and we will keep appending new columns on every materialization.
  const used = new Set<string>([objectNameColId]);

  const colIdByAttrId: Record<string, string> = {};
  const reserveOrAppend = (preferredColId: string | null): string => {
    if (preferredColId && t.colIds.includes(preferredColId) && !used.has(preferredColId)) {
      used.add(preferredColId);
      return preferredColId;
    }
    for (const cid of t.colIds.slice(1)) {
      if (!used.has(cid)) {
        used.add(cid);
        return cid;
      }
    }
    const after = t.colIds[t.colIds.length - 1]!;
    sheet = insertTableColumnAfterModel(sheet, tableId, after);
    t = findTable(sheet, tableId)!;
    const nextCid = t.colIds[t.colIds.length - 1]!;
    used.add(nextCid);
    return nextCid;
  };

  attrs.forEach((a) => {
    const preferred = typeof prevMap[a.id] === 'string' ? prevMap[a.id]! : null;
    colIdByAttrId[a.id] = reserveOrAppend(preferred);
  });

  // Trim table columns to exactly: objectName + attributes (in attribute order).
  const desiredColIds = [objectNameColId, ...attrs.map((a) => colIdByAttrId[a.id]!)].filter(Boolean);
  sheet = {
    ...sheet,
    grid: {
      ...sheet.grid,
      tables: (sheet.grid.tables || []).map((tb) => (tb.id === tableId ? { ...tb, colIds: desiredColIds } : tb)),
    },
  };
  t = findTable(sheet, tableId)!;

  // Compute data row count from comma-separated samples.
  const sampleColumns = attrs.map((a) => ({ attr: a, samples: splitSamples(a.sample) }));
  const maxSamples = Math.max(1, ...sampleColumns.map((x) => x.samples.length));
  const requiredRows = 1 /* header */ + maxSamples;

  // Ensure enough rows.
  while (t.rowIds.length < requiredRows) {
    const afterRowId = t.rowIds[t.rowIds.length - 1]!;
    sheet = insertTableRowAfterModel(sheet, tableId, afterRowId);
    t = findTable(sheet, tableId)!;
  }
  // Trim extra rows to avoid leftover stale sample rows.
  if (t.rowIds.length > requiredRows) {
    const trimmed = t.rowIds.slice(0, requiredRows);
    sheet = {
      ...sheet,
      grid: { ...sheet.grid, tables: (sheet.grid.tables || []).map((tb) => (tb.id === tableId ? { ...tb, rowIds: trimmed } : tb)) },
    };
    t = findTable(sheet, tableId)!;
  }

  const headerRowId = t.rowIds[0]!;

  // Key column: Object name.
  sheet = setTableKeyColIdModel(sheet, tableId, objectNameColId);

  // Headers.
  // First column header should be the object's *name value* (not the words "Object name").
  sheet = setCellValueModel(sheet, headerRowId, objectNameColId, (dataObject.name || '').trim() || dataObject.id);
  attrs.forEach((a) => {
    const colId = colIdByAttrId[a.id]!;
    sheet = setCellValueModel(sheet, headerRowId, colId, a.name);
  });

  // Data rows.
  for (let i = 0; i < maxSamples; i++) {
    const rowId = t.rowIds[1 + i]!;
    // IMPORTANT: The first column header is the object name value; cells below should be blank.
    sheet = setCellValueModel(sheet, rowId, objectNameColId, '');
    sampleColumns.forEach(({ attr, samples }) => {
      const colId = colIdByAttrId[attr.id]!;
      const v = samples[i] || '';
      if (attr.type === 'status') sheet = setCellValueModel(sheet, rowId, colId, v ? segMacro(attr.values || [], v) : segMacro(attr.values || [], attr.values?.[0]));
      else sheet = setCellValueModel(sheet, rowId, colId, v);
    });
  }

  const link: NonNullable<GridTableV1['dataObjectLink']> = {
    mode: 'columns',
    diagramFileId,
    diagramRoomName,
    dataObjectId: dataObject.id,
    objectNameColId,
    attributeColIds: colIdByAttrId,
    dataRowId: t.rowIds[1]!, // first data row
  };

  // Persist the link block on the table itself.
  sheet = {
    ...sheet,
    grid: {
      ...sheet.grid,
      tables: (sheet.grid.tables || []).map((tb) => (tb.id === tableId ? { ...tb, dataObjectLink: link } : tb)),
    },
  };

  return { sheet, link };
}

