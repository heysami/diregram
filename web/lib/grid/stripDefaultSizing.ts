import type { GridColumnV1, GridDoc, GridRowV1, GridSheetV1 } from '@/lib/gridjson';

function clone<T>(v: T): T {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return structuredClone(v) as T;
  } catch {
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

export function stripDefaultSizingFromSheet(
  sheet: GridSheetV1,
  defaults?: {
    colWidth?: number;
    rowHeight?: number;
  },
): GridSheetV1 {
  const colW = defaults?.colWidth ?? 88;
  const rowH = defaults?.rowHeight ?? 22;
  const next = clone(sheet);
  const cols = (next.grid?.columns || []) as GridColumnV1[];
  const rows = (next.grid?.rows || []) as GridRowV1[];
  next.grid = {
    ...next.grid,
    columns: cols.map((c) => {
      if ((c.width ?? colW) === colW) {
        const { width, ...rest } = c as any;
        return rest as GridColumnV1;
      }
      return c;
    }),
    rows: rows.map((r) => {
      if ((r.height ?? rowH) === rowH) {
        const { height, ...rest } = r as any;
        return rest as GridRowV1;
      }
      return r;
    }),
  };
  return next;
}

export function stripDefaultSizingFromDoc(
  doc: GridDoc,
  defaults?: {
    colWidth?: number;
    rowHeight?: number;
  },
): GridDoc {
  const next = clone(doc);
  next.sheets = (next.sheets || []).map((s) => stripDefaultSizingFromSheet(s, defaults));
  return next;
}

