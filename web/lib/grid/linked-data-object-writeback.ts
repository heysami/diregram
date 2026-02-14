import type { GridTableV1 } from '@/lib/gridjson';
import type { NexusDataObject } from '@/lib/data-object-storage';
import { loadDataObjectAttributes, upsertDataObjectAttributes } from '@/lib/data-object-attributes';
import { listRecognizedMacros } from '@/lib/grid-cell-macros';

function parseSegSelectedValue(raw: string): string | null {
  const macros = listRecognizedMacros(raw || '');
  const seg = macros.find((m) => String(m.inner || '').startsWith('seg:')) || null;
  if (!seg) return null;
  const body = String(seg.inner || '').slice('seg:'.length);
  const parts = body
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const kv: Record<string, string> = {};
  parts.forEach((p) => {
    const eq = p.indexOf('=');
    if (eq === -1) return;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (k) kv[k] = v;
  });
  return kv.value ? String(kv.value) : null;
}

function splitCommaList(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function setCommaListIndex(list: string[], idx: number, value: string): string[] {
  const out = list.slice();
  while (out.length <= idx) out.push('');
  out[idx] = String(value || '').trim();
  return out;
}

/**
 * Apply a grid cell edit (in a linked columns-mode table) to the diagram Data Object.
 *
 * Returns updated object if the edit should write back; otherwise null.
 */
export function applyLinkedColumnsModeCellEditToDataObject(opts: {
  obj: NexusDataObject;
  link: NonNullable<GridTableV1['dataObjectLink']>;
  tableRowIds: string[];
  rowId: string;
  colId: string;
  nextValue: string;
}): NexusDataObject | null {
  const { obj, link, tableRowIds, rowId, colId, nextValue } = opts;
  const attrs = loadDataObjectAttributes(obj.data);
  const normalized = String(nextValue || '').trim();

  const attrIdByColId = new Map<string, string>();
  Object.entries(link.attributeColIds || {}).forEach(([attrId, c]) => {
    const cid = String(c || '').trim();
    if (cid) attrIdByColId.set(cid, attrId);
  });
  const attrId = attrIdByColId.get(colId) || null;

  const headerRowId = tableRowIds[0] || '';
  const isHeaderRow = rowId === headerRowId;

  if (isHeaderRow) {
    // Header edits:
    // - first col header is the object name value -> rename object
    // - attribute headers rename attributes
    if (colId === link.objectNameColId) {
      const nextName = normalized || obj.id;
      return { ...obj, name: nextName };
    }
    if (attrId) {
      const nextAttrName = normalized.split('\n')[0]?.trim() || '';
      if (!nextAttrName) return null;
      const nextAttrs = attrs.map((a) => (a.id === attrId ? { ...a, name: nextAttrName } : a));
      return { ...obj, data: upsertDataObjectAttributes(obj.data, nextAttrs) };
    }
    return null;
  }

  // Data rows:
  // - first column is intentionally not writable back (object name is stored in header only)
  if (colId === link.objectNameColId) return null;
  if (!attrId) return null;

  const current = attrs.find((a) => a.id === attrId) || null;
  if (!current) return null;

  const rowIdxInTable = tableRowIds.indexOf(rowId);
  const dataIdx = Math.max(0, rowIdxInTable - 1); // headerRows=1

  const nextSampleSingle = current.type === 'status' ? parseSegSelectedValue(nextValue) ?? normalized : String(nextValue || '');
  const prevList = splitCommaList(current.sample || '');
  const nextList = setCommaListIndex(prevList, dataIdx, nextSampleSingle);
  const compact = nextList.map((x) => x.trim()).filter(Boolean).join(', ');
  const nextAttrs = attrs.map((a) => (a.id === attrId ? { ...a, sample: compact } : a));
  return { ...obj, data: upsertDataObjectAttributes(obj.data, nextAttrs) };
}

