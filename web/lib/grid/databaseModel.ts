import type { GridDatabasePropertyType, GridDatabaseV1, GridSheetV1 } from '@/lib/gridjson';

function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  existing.forEach((id) => {
    const m = String(id).match(/-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${max + 1}`;
}

export function addDbProperty(sheet: GridSheetV1, type: GridDatabasePropertyType): GridSheetV1 {
  const db = sheet.database;
  const props = db.properties || [];
  const rows = db.rows || [];
  const id = nextId('prop', props.map((p) => p.id));
  const nextProps = [...props, { id, name: `Property ${props.length + 1}`, type }];
  const nextRows = rows.map((r) => ({ ...r, cells: { ...(r.cells || {}), [id]: (r.cells || {})[id] ?? '' } }));
  const nextDb: GridDatabaseV1 = { ...db, properties: nextProps, rows: nextRows };
  return { ...sheet, database: nextDb };
}

export function deleteDbProperty(sheet: GridSheetV1, propId: string): GridSheetV1 {
  const db = sheet.database;
  const props = db.properties || [];
  const rows = db.rows || [];
  const nextProps = props.filter((p) => p.id !== propId);
  const nextRows = rows.map((r) => {
    const nextCells = { ...(r.cells || {}) };
    delete nextCells[propId];
    return { ...r, cells: nextCells };
  });
  return { ...sheet, database: { ...db, properties: nextProps, rows: nextRows } };
}

export function addDbRow(sheet: GridSheetV1): GridSheetV1 {
  const db = sheet.database;
  const props = db.properties || [];
  const rows = db.rows || [];
  const id = nextId('dbrow', rows.map((r) => r.id));
  const cells: Record<string, unknown> = {};
  props.forEach((p) => (cells[p.id] = p.type === 'checkbox' ? false : ''));
  return { ...sheet, database: { ...db, rows: [...rows, { id, cells }] } };
}

export function setDbCellValue(sheet: GridSheetV1, rowId: string, propId: string, value: unknown): GridSheetV1 {
  const db = sheet.database;
  const rows = db.rows || [];
  const nextRows = rows.map((r) => (r.id === rowId ? { ...r, cells: { ...(r.cells || {}), [propId]: value } } : r));
  return { ...sheet, database: { ...db, rows: nextRows } };
}

export function deleteDbRow(sheet: GridSheetV1, rowId: string): GridSheetV1 {
  const db = sheet.database;
  const rows = db.rows || [];
  const nextRows = rows.filter((r) => r.id !== rowId);
  return { ...sheet, database: { ...db, rows: nextRows } };
}

export function moveDbRow(sheet: GridSheetV1, rowId: string, dir: 'up' | 'down'): GridSheetV1 {
  const db = sheet.database;
  const rows = db.rows || [];
  const idx = rows.findIndex((r) => r.id === rowId);
  if (idx < 0) return sheet;
  const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= rows.length) return sheet;
  const nextRows = rows.slice();
  const tmp = nextRows[idx];
  nextRows[idx] = nextRows[nextIdx];
  nextRows[nextIdx] = tmp;
  return { ...sheet, database: { ...db, rows: nextRows } };
}

export function moveDbProperty(sheet: GridSheetV1, propId: string, dir: 'left' | 'right'): GridSheetV1 {
  const db = sheet.database;
  const props = db.properties || [];
  const idx = props.findIndex((p) => p.id === propId);
  if (idx < 0) return sheet;
  const nextIdx = dir === 'left' ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= props.length) return sheet;
  const nextProps = props.slice();
  const tmp = nextProps[idx];
  nextProps[idx] = nextProps[nextIdx];
  nextProps[nextIdx] = tmp;
  return { ...sheet, database: { ...db, properties: nextProps } };
}

