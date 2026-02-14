import type { GridSheetMode, GridSheetV1 } from '@/lib/gridjson';

export function createDefaultSheet(opts: { id: string; name: string; mode?: GridSheetMode }): GridSheetV1 {
  const { id, name, mode = 'spreadsheet' } = opts;
  return {
    id,
    name,
    mode,
    grid: {
      columns: Array.from({ length: 12 }).map((_, i) => ({ id: `c-${i + 1}`, width: 88 })),
      rows: Array.from({ length: 50 }).map((_, i) => ({ id: `r-${i + 1}`, height: 22 })),
      cells: {},
      regions: [],
      tables: [],
    },
    cards: [],
    database: {
      properties: [],
      rows: [],
      views: [{ id: 'view-1', name: 'Table', kind: 'table' }],
      activeViewId: 'view-1',
    },
  };
}

