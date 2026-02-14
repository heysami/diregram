import { upsertHeader } from '@/lib/nexus-doc-header';
import { saveGridDoc } from '@/lib/gridjson';

/**
 * Minimal starter content for a Grid document.
 *
 * v1: a nexus-doc header + a single gridjson block (full-fidelity JSON).
 */
export function makeStarterGridMarkdown(): string {
  const withHeader = upsertHeader('', { kind: 'grid', version: 1 });
  return saveGridDoc(withHeader, {
    version: 1,
    activeSheetId: 'sheet-1',
    sheets: [
      {
        id: 'sheet-1',
        name: 'Sheet 1',
        mode: 'spreadsheet',
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
      },
    ],
  });
}

