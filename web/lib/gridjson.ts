import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { parseTableFromMarkdown } from '@/lib/table-serialization';

export type GridDocV1 = {
  version: 1;
  activeSheetId: string;
  sheets: GridSheetV1[];
  /** Optional global people directory (shared across sheets). */
  peopleDirectory?: GridPersonV1[];
};

export type GridSheetMode = 'spreadsheet' | 'database';

export type GridColumnV1 = { id: string; width?: number };
export type GridRowV1 = { id: string; height?: number };

export type GridCellValueV1 = {
  value: string;
};

export type GridPersonV1 = {
  id: string;
  name: string;
  /** Optional icon tag (future); when present, UI can render icon instead of initials. */
  icon?: string;
};

/**
 * A non-rectangular merged cell region. Each coordinate can belong to at most one region.
 * Value is stored on the region (not per coord).
 */
export type GridRegionV1 = {
  id: string;
  /** Array of coord keys: `${rowId}:${colId}` */
  cells: string[];
  /**
   * Deprecated: older versions stored a single value at the region.
   * Current UX treats regions as visual grouping only (cell values remain per-cell).
   */
  value: string;
};

export type GridCardV1 = {
  id: string;
  /** Top-left anchor in grid coordinates */
  rowId: string;
  colId: string;
  /** Rectangular span in whole cells */
  rowspan: number;
  colspan: number;
  /** Card content (markdown-compatible in future) */
  content: string;
};

export type GridTableV1 = {
  id: string;
  /** Ordered, contiguous row ids (table height). */
  rowIds: string[];
  /** Ordered, contiguous column ids (table width). */
  colIds: string[];
  /** Number of header rows, starting from the top (0..rowIds.length). */
  headerRows: number;
  /** Number of header columns, starting from the left (0..colIds.length). */
  headerCols: number;
  /** Number of footer rows, starting from the bottom (0..rowIds.length). */
  footerRows: number;
  /** Per-table "type"/behavior mode (used for future semantics + transforms). */
  kind?: 'normal' | 'sourceData' | 'groupingCellValue' | 'groupingHeaderValue';
  /**
   * For `kind='sourceData'`: which table column is the primary key id.
   * Default: first data column after header columns.
   */
  keyColId?: string;
  /** Optional hidden row ids (table-scoped; used for collapse view). */
  hiddenRows?: string[];
  /** Optional hidden column ids (table-scoped; used for collapse view). */
  hiddenCols?: string[];
  /** Optional per-table filters (Excel-like), scoped to this table only. */
  filters?: Record<
    string,
    {
      /** free-text contains match (case-insensitive) */
      q?: string;
      /** value whitelist (deduped, per-kind). Row matches if any item in cell intersects. */
      in?: string[];
    }
  >;
  /** Optional per-table pills/tag settings and registry. */
  pills?: {
    expandAll?: boolean;
    options?: Array<{ id: string; label: string }>;
  };

  /**
   * Optional link to a Data Object stored in another (diagram) document.
   * When present, the table can be materialized from (and synced to) that object.
   */
  dataObjectLink?: {
    /** Layout mode for linked tables. */
    mode?: 'columns' | 'kvRows';
    /** File id (Supabase uuid or local id) of the source diagram doc. */
    diagramFileId: string;
    /** Cached room name for Yjs/Hocuspocus. When missing, fall back to `file-${diagramFileId}`. */
    diagramRoomName?: string;
    /** The linked data object id within the diagram doc store (e.g. do-12). */
    dataObjectId: string;
    /** The table column id that holds the object's name (and is treated as the key id). */
    objectNameColId: string;
    /** Attribute id -> column id (keeps columns stable across re-materialization). */
    attributeColIds?: Record<string, string>;
    /** The table row id that holds sample values for the linked object. */
    dataRowId: string;

    /** For mode='kvRows': the value column id. */
    valueColId?: string;
    /** For mode='kvRows': which row holds the object name value. */
    objectNameRowId?: string;
    /** For mode='kvRows': attribute id -> row id. */
    attributeRowIds?: Record<string, string>;
  };
};

export type GridDatabasePropertyType = 'text' | 'number' | 'select' | 'multiSelect' | 'checkbox' | 'date';
export type GridDatabasePropertyV1 = {
  id: string;
  name: string;
  type: GridDatabasePropertyType;
  options?: string[]; // for select/multiSelect
};
export type GridDatabaseRowV1 = {
  id: string;
  cells: Record<string, unknown>; // propertyId -> value (typed by property.type)
};
export type GridDatabaseViewKind = 'table';
export type GridDatabaseViewV1 = {
  id: string;
  name: string;
  kind: GridDatabaseViewKind;
};
export type GridDatabaseV1 = {
  properties: GridDatabasePropertyV1[];
  rows: GridDatabaseRowV1[];
  views: GridDatabaseViewV1[];
  activeViewId: string | null;
};

export type GridSheetV1 = {
  id: string;
  name: string;
  mode: GridSheetMode;
  grid: {
    columns: GridColumnV1[];
    rows: GridRowV1[];
    /** Sparse map keyed by `${rowId}:${colId}` */
    cells: Record<string, GridCellValueV1>;
    regions: GridRegionV1[];
    tables: GridTableV1[];
  };
  cards: GridCardV1[];
  database: GridDatabaseV1;
};

export type GridDoc = GridDocV1;

export type LoadGridDocResult = {
  doc: GridDoc;
  source: 'gridjson' | 'legacyTableJson' | 'default';
};

function normalize(s: string): string {
  return normalizeMarkdownNewlines(s || '');
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getGridJsonFullBlockRegex(): RegExp {
  return /```gridjson\n[\s\S]*?\n```/;
}

function getGridJsonBlockRegex(): RegExp {
  return /```gridjson\n([\s\S]*?)\n```/;
}

export function hasGridJson(markdown: string): boolean {
  return getGridJsonBlockRegex().test(normalize(markdown));
}

export function hasLegacyTableJson(markdown: string): boolean {
  return /```tablejson\n[\s\S]*?\n```/.test(normalize(markdown));
}

function defaultDoc(): GridDocV1 {
  const cols: GridColumnV1[] = Array.from({ length: 12 }).map((_, i) => ({ id: `c-${i + 1}`, width: 88 }));
  const rows: GridRowV1[] = Array.from({ length: 50 }).map((_, i) => ({ id: `r-${i + 1}`, height: 22 }));
  const sheet: GridSheetV1 = {
    id: 'sheet-1',
    name: 'Sheet 1',
    mode: 'spreadsheet',
    grid: {
      columns: cols,
      rows,
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
  return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
}

function coerceDoc(raw: unknown): GridDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const sheetsRaw = Array.isArray(r.sheets) ? (r.sheets as unknown[]) : [];
  const activeSheetId = typeof r.activeSheetId === 'string' && r.activeSheetId.trim().length ? r.activeSheetId : '';
  const peopleDirectory: GridPersonV1[] | undefined = (() => {
    const pd = (r as { peopleDirectory?: unknown }).peopleDirectory;
    if (!Array.isArray(pd)) return undefined;
    const out: GridPersonV1[] = [];
    pd.forEach((p, idx) => {
      if (!p || typeof p !== 'object') return;
      const po = p as Record<string, unknown>;
      const id = typeof po.id === 'string' && po.id.trim().length ? (po.id as string) : `p-${idx + 1}`;
      const name = typeof po.name === 'string' && po.name.trim().length ? (po.name as string) : '';
      if (!name) return;
      const icon = typeof po.icon === 'string' && po.icon.trim().length ? (po.icon as string) : undefined;
      out.push({ id, name, ...(icon ? { icon } : {}) });
    });
    return out.length ? out : undefined;
  })();
  const sheets: GridSheetV1[] = sheetsRaw
    .map((s): GridSheetV1 | null => {
      if (!s || typeof s !== 'object') return null;
      const ss = s as Record<string, unknown>;
      const id = typeof ss.id === 'string' && ss.id.trim().length ? ss.id : '';
      const name = typeof ss.name === 'string' && ss.name.trim().length ? ss.name : 'Sheet';
      const mode: GridSheetMode = ss.mode === 'database' ? 'database' : 'spreadsheet';

      const gridRaw = (ss.grid && typeof ss.grid === 'object' ? (ss.grid as Record<string, unknown>) : null) || null;
      const columns = Array.isArray(gridRaw?.columns)
        ? (gridRaw!.columns as unknown[])
            .map((c, idx): GridColumnV1 => {
              const cc = c as Record<string, unknown>;
              const cid = typeof cc?.id === 'string' && cc.id.trim().length ? (cc.id as string) : `c-${idx + 1}`;
              const width = typeof cc?.width === 'number' && Number.isFinite(cc.width) ? (cc.width as number) : undefined;
              return { id: cid, ...(width ? { width } : {}) };
            })
        : [];
      const rows = Array.isArray(gridRaw?.rows)
        ? (gridRaw!.rows as unknown[])
            .map((rr, idx): GridRowV1 => {
              const ro = rr as Record<string, unknown>;
              const rid = typeof ro?.id === 'string' && ro.id.trim().length ? (ro.id as string) : `r-${idx + 1}`;
              const height = typeof ro?.height === 'number' && Number.isFinite(ro.height) ? (ro.height as number) : undefined;
              return { id: rid, ...(height ? { height } : {}) };
            })
        : [];

      const cellsRaw = gridRaw?.cells && typeof gridRaw.cells === 'object' ? (gridRaw.cells as Record<string, unknown>) : {};
      const cells: Record<string, GridCellValueV1> = {};
      Object.entries(cellsRaw || {}).forEach(([k, v]) => {
        const key = String(k || '').trim();
        if (!key) return;
        const vv = v as Record<string, unknown>;
        const value = typeof vv?.value === 'string' ? (vv.value as string) : typeof v === 'string' ? (v as string) : '';
        cells[key] = { value };
      });

      const regions: GridRegionV1[] = Array.isArray(gridRaw?.regions)
        ? (gridRaw!.regions as unknown[])
            .map((rg, idx): GridRegionV1 | null => {
              if (!rg || typeof rg !== 'object') return null;
              const ro = rg as Record<string, unknown>;
              const rid = typeof ro.id === 'string' && ro.id.trim().length ? (ro.id as string) : `reg-${idx + 1}`;
              const cellsArr = Array.isArray(ro.cells) ? (ro.cells as unknown[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
              if (cellsArr.length === 0) return null;
              const value = typeof ro.value === 'string' ? (ro.value as string) : '';
              return { id: rid, cells: cellsArr, value };
            })
            .filter((x): x is GridRegionV1 => x !== null)
        : [];

      const tables: GridTableV1[] = Array.isArray(gridRaw?.tables)
        ? (gridRaw!.tables as unknown[])
            .map((tb, idx): GridTableV1 | null => {
              if (!tb || typeof tb !== 'object') return null;
              const to = tb as Record<string, unknown>;
              const id = typeof to.id === 'string' && to.id.trim().length ? (to.id as string) : `tbl-${idx + 1}`;
              const rowIds = Array.isArray(to.rowIds) ? (to.rowIds as unknown[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
              const colIds = Array.isArray(to.colIds) ? (to.colIds as unknown[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
              if (!rowIds.length || !colIds.length) return null;
              const headerRowsRaw = typeof to.headerRows === 'number' && Number.isFinite(to.headerRows) ? (to.headerRows as number) : 1;
              const headerRows = Math.max(0, Math.min(rowIds.length, Math.round(headerRowsRaw)));
              const headerColsRaw = typeof to.headerCols === 'number' && Number.isFinite(to.headerCols) ? (to.headerCols as number) : 0;
              const headerCols = Math.max(0, Math.min(colIds.length, Math.round(headerColsRaw)));
              const footerRowsRaw = typeof to.footerRows === 'number' && Number.isFinite(to.footerRows) ? (to.footerRows as number) : 0;
              // Avoid overlapping header + footer.
              const footerRows = Math.max(0, Math.min(Math.max(0, rowIds.length - headerRows), Math.round(footerRowsRaw)));
              const kindRaw = typeof to.kind === 'string' ? String(to.kind || '').trim() : '';
              const kind: GridTableV1['kind'] | undefined =
                kindRaw === 'sourceData' || kindRaw === 'groupingCellValue' || kindRaw === 'groupingHeaderValue' || kindRaw === 'normal'
                  ? (kindRaw as GridTableV1['kind'])
                  : undefined;
              const keyColIdRaw = typeof to.keyColId === 'string' ? String(to.keyColId || '').trim() : '';
              const keyColId =
                keyColIdRaw && colIds.includes(keyColIdRaw)
                  ? keyColIdRaw
                  : kind === 'sourceData'
                    ? (colIds[Math.max(0, Math.min(colIds.length - 1, headerCols))] || undefined)
                    : undefined;
              const hiddenRowsRaw = Array.isArray(to.hiddenRows)
                ? (to.hiddenRows as unknown[]).map((x) => String(x || '').trim()).filter(Boolean)
                : [];
              const hiddenColsRaw = Array.isArray(to.hiddenCols)
                ? (to.hiddenCols as unknown[]).map((x) => String(x || '').trim()).filter(Boolean)
                : [];
              const hiddenRows = hiddenRowsRaw.filter((id) => rowIds.includes(id));
              const hiddenCols = hiddenColsRaw.filter((id) => colIds.includes(id));
              const filtersRaw = (to.filters && typeof to.filters === 'object' ? (to.filters as Record<string, unknown>) : null) || null;
              const filters: GridTableV1['filters'] | undefined = filtersRaw
                ? Object.fromEntries(
                    Object.entries(filtersRaw)
                      .map(([colId, v]) => {
                        const id = String(colId || '').trim();
                        if (!id) return null;
                        if (!v || typeof v !== 'object') return [id, {}] as const;
                        const vv = v as Record<string, unknown>;
                        const q = typeof vv.q === 'string' && vv.q.trim().length ? (vv.q as string) : undefined;
                        const inVals = Array.isArray(vv.in)
                          ? (vv.in as unknown[]).map((x) => String(x || '')).map((s) => s.trim()).filter(Boolean).slice(0, 500)
                          : undefined;
                        return [id, { ...(q ? { q } : {}), ...(inVals?.length ? { in: inVals } : {}) }] as const;
                      })
                      .filter(Boolean) as Array<[string, { q?: string; in?: string[] }]>,
                  )
                : undefined;
              const pillsRaw = (to.pills && typeof to.pills === 'object' ? (to.pills as Record<string, unknown>) : null) || null;
              const expandAll = typeof pillsRaw?.expandAll === 'boolean' ? (pillsRaw.expandAll as boolean) : undefined;
              const options =
                Array.isArray(pillsRaw?.options)
                  ? (pillsRaw!.options as unknown[])
                      .map((o, oIdx) => {
                        if (!o || typeof o !== 'object') return null;
                        const oo = o as Record<string, unknown>;
                        const oid = typeof oo.id === 'string' && oo.id.trim().length ? (oo.id as string) : `opt-${oIdx + 1}`;
                        const label = typeof oo.label === 'string' && oo.label.trim().length ? (oo.label as string) : '';
                        if (!label) return null;
                        return { id: oid, label };
                      })
                      .filter((x): x is { id: string; label: string } => x !== null)
                  : undefined;
              const pills = expandAll !== undefined || (options && options.length) ? { ...(expandAll !== undefined ? { expandAll } : {}), ...(options?.length ? { options } : {}) } : undefined;
              const hasFilters = filters && Object.keys(filters).length;

              const linkRaw =
                (to.dataObjectLink && typeof to.dataObjectLink === 'object' ? (to.dataObjectLink as Record<string, unknown>) : null) || null;
              const dataObjectLink: GridTableV1['dataObjectLink'] | undefined = (() => {
                if (!linkRaw) return undefined;
                const modeRaw = typeof linkRaw.mode === 'string' ? linkRaw.mode.trim() : '';
                const mode: GridTableV1['dataObjectLink']['mode'] | undefined =
                  modeRaw === 'kvRows' || modeRaw === 'columns' ? (modeRaw as any) : undefined;
                const diagramFileId = typeof linkRaw.diagramFileId === 'string' ? linkRaw.diagramFileId.trim() : '';
                const diagramRoomName = typeof linkRaw.diagramRoomName === 'string' ? linkRaw.diagramRoomName.trim() : '';
                const dataObjectId = typeof linkRaw.dataObjectId === 'string' ? linkRaw.dataObjectId.trim() : '';
                const objectNameColIdRaw = typeof linkRaw.objectNameColId === 'string' ? linkRaw.objectNameColId.trim() : '';
                const dataRowIdRaw = typeof linkRaw.dataRowId === 'string' ? linkRaw.dataRowId.trim() : '';

                if (!diagramFileId || !dataObjectId) return undefined;

                const objectNameColId = objectNameColIdRaw && colIds.includes(objectNameColIdRaw) ? objectNameColIdRaw : colIds[0] || '';
                const dataRowId = dataRowIdRaw && rowIds.includes(dataRowIdRaw) ? dataRowIdRaw : rowIds[Math.min(rowIds.length - 1, headerRows)] || '';
                if (!objectNameColId || !dataRowId) return undefined;

                const attrMapRaw = linkRaw.attributeColIds && typeof linkRaw.attributeColIds === 'object' ? (linkRaw.attributeColIds as Record<string, unknown>) : null;
                const attributeColIds =
                  attrMapRaw && Object.keys(attrMapRaw).length
                    ? Object.fromEntries(
                        Object.entries(attrMapRaw)
                          .map(([attrId, v]) => {
                            const aid = String(attrId || '').trim();
                            const cid = typeof v === 'string' ? v.trim() : '';
                            if (!aid || !cid) return null;
                            if (!colIds.includes(cid)) return null;
                            return [aid, cid] as const;
                          })
                          .filter(Boolean) as Array<[string, string]>,
                      )
                    : undefined;

                const valueColIdRaw = typeof linkRaw.valueColId === 'string' ? linkRaw.valueColId.trim() : '';
                const valueColId = valueColIdRaw && colIds.includes(valueColIdRaw) ? valueColIdRaw : undefined;

                const objectNameRowIdRaw = typeof linkRaw.objectNameRowId === 'string' ? linkRaw.objectNameRowId.trim() : '';
                const objectNameRowId = objectNameRowIdRaw && rowIds.includes(objectNameRowIdRaw) ? objectNameRowIdRaw : undefined;

                const rowMapRaw = linkRaw.attributeRowIds && typeof linkRaw.attributeRowIds === 'object' ? (linkRaw.attributeRowIds as Record<string, unknown>) : null;
                const attributeRowIds =
                  rowMapRaw && Object.keys(rowMapRaw).length
                    ? Object.fromEntries(
                        Object.entries(rowMapRaw)
                          .map(([attrId, v]) => {
                            const aid = String(attrId || '').trim();
                            const rid = typeof v === 'string' ? v.trim() : '';
                            if (!aid || !rid) return null;
                            if (!rowIds.includes(rid)) return null;
                            return [aid, rid] as const;
                          })
                          .filter(Boolean) as Array<[string, string]>,
                      )
                    : undefined;

                return {
                  ...(mode ? { mode } : {}),
                  diagramFileId,
                  ...(diagramRoomName ? { diagramRoomName } : {}),
                  dataObjectId,
                  objectNameColId,
                  ...(attributeColIds && Object.keys(attributeColIds).length ? { attributeColIds } : {}),
                  dataRowId,
                  ...(valueColId ? { valueColId } : {}),
                  ...(objectNameRowId ? { objectNameRowId } : {}),
                  ...(attributeRowIds && Object.keys(attributeRowIds).length ? { attributeRowIds } : {}),
                };
              })();

              return {
                id,
                rowIds,
                colIds,
                headerRows,
                headerCols,
                footerRows,
                ...(kind ? { kind } : {}),
                ...(keyColId ? { keyColId } : {}),
                ...(hiddenRows.length ? { hiddenRows } : {}),
                ...(hiddenCols.length ? { hiddenCols } : {}),
                ...(hasFilters ? { filters } : {}),
                ...(pills ? { pills } : {}),
                ...(dataObjectLink ? { dataObjectLink } : {}),
              };
            })
            .filter((x): x is GridTableV1 => x !== null)
        : [];

      const dbRaw = (ss.database && typeof ss.database === 'object' ? (ss.database as Record<string, unknown>) : null) || null;
      const database: GridDatabaseV1 = {
        properties: Array.isArray(dbRaw?.properties)
          ? (dbRaw!.properties as unknown[])
              .map((p, idx): GridDatabasePropertyV1 | null => {
                if (!p || typeof p !== 'object') return null;
                const po = p as Record<string, unknown>;
                const pid = typeof po.id === 'string' && po.id.trim().length ? (po.id as string) : `prop-${idx + 1}`;
                const name = typeof po.name === 'string' && po.name.trim().length ? (po.name as string) : `Property ${idx + 1}`;
                const type: GridDatabasePropertyType =
                  po.type === 'number' || po.type === 'select' || po.type === 'multiSelect' || po.type === 'checkbox' || po.type === 'date'
                    ? (po.type as GridDatabasePropertyType)
                    : 'text';
                const options = Array.isArray(po.options)
                  ? (po.options as unknown[]).map((x) => String(x || '').trim()).filter(Boolean)
                  : undefined;
                return { id: pid, name, type, ...(options && options.length ? { options } : {}) };
              })
              .filter((x): x is GridDatabasePropertyV1 => x !== null)
          : [],
        rows: Array.isArray(dbRaw?.rows)
          ? (dbRaw!.rows as unknown[])
              .map((rw, idx): GridDatabaseRowV1 | null => {
                if (!rw || typeof rw !== 'object') return null;
                const ro = rw as Record<string, unknown>;
                const rid = typeof ro.id === 'string' && ro.id.trim().length ? (ro.id as string) : `dbrow-${idx + 1}`;
                const cells = ro.cells && typeof ro.cells === 'object' ? (ro.cells as Record<string, unknown>) : {};
                return { id: rid, cells };
              })
              .filter((x): x is GridDatabaseRowV1 => x !== null)
          : [],
        views: Array.isArray(dbRaw?.views)
          ? (dbRaw!.views as unknown[])
              .map((vw, idx): GridDatabaseViewV1 | null => {
                if (!vw || typeof vw !== 'object') return null;
                const vo = vw as Record<string, unknown>;
                const vid = typeof vo.id === 'string' && vo.id.trim().length ? (vo.id as string) : `view-${idx + 1}`;
                const name = typeof vo.name === 'string' && vo.name.trim().length ? (vo.name as string) : `View ${idx + 1}`;
                const kind: GridDatabaseViewKind = vo.kind === 'table' ? 'table' : 'table';
                return { id: vid, name, kind };
              })
              .filter((x): x is GridDatabaseViewV1 => x !== null)
          : [],
        activeViewId: typeof dbRaw?.activeViewId === 'string' ? (dbRaw!.activeViewId as string) : null,
      };

      // Legacy migration: if a region stored a single value, distribute it to all region cells,
      // then clear the region value. Regions remain visual grouping only.
      const distributedCells = { ...cells };
      const normalizedRegions = regions.map((rg) => {
        if (!rg.value || !rg.value.trim()) return rg;
        for (const k of rg.cells) {
          if (!distributedCells[k]) distributedCells[k] = { value: rg.value };
        }
        return { ...rg, value: '' };
      });

      const grid = {
        columns: (() => {
          const base = columns.length ? columns : Array.from({ length: 12 }).map((_, i) => ({ id: `c-${i + 1}`, width: 88 }));
          const min = 12;
          if (base.length >= min) return base;
          const next = base.slice();
          for (let i = base.length; i < min; i++) next.push({ id: `c-${i + 1}`, width: 88 });
          return next;
        })(),
        rows: (() => {
          const base = rows.length ? rows : Array.from({ length: 50 }).map((_, i) => ({ id: `r-${i + 1}`, height: 22 }));
          const min = 50;
          if (base.length >= min) return base;
          const next = base.slice();
          for (let i = base.length; i < min; i++) next.push({ id: `r-${i + 1}`, height: 22 });
          return next;
        })(),
        cells: distributedCells,
        regions: normalizedRegions,
        tables,
      };

      // Cards (grid-aligned). Back-compat: accept legacy pixel cards and snap to nearest cell.
      const cards: GridCardV1[] = (() => {
        const rawCards = Array.isArray(ss.cards) ? (ss.cards as unknown[]) : [];
        if (!rawCards.length) return [];
        const colIds = grid.columns.map((c) => c.id);
        const rowIds = grid.rows.map((r) => r.id);
        const defaultColW = 88;
        const defaultRowH = 22;
        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
        const nearestCol = (x: number) => clamp(Math.round(x / defaultColW), 0, Math.max(0, colIds.length - 1));
        const nearestRow = (y: number) => clamp(Math.round(y / defaultRowH), 0, Math.max(0, rowIds.length - 1));
        const spanCols = (w: number) => clamp(Math.max(1, Math.round(w / defaultColW)), 1, Math.max(1, colIds.length));
        const spanRows = (h: number) => clamp(Math.max(1, Math.round(h / defaultRowH)), 1, Math.max(1, rowIds.length));

        return rawCards
          .map((c, idx): GridCardV1 | null => {
            if (!c || typeof c !== 'object') return null;
            const co = c as Record<string, unknown>;
            const id = typeof co.id === 'string' && co.id.trim().length ? (co.id as string) : `card-${idx + 1}`;

            // New format
            const rowId = typeof co.rowId === 'string' ? co.rowId.trim() : '';
            const colId = typeof co.colId === 'string' ? co.colId.trim() : '';
            const rowspanRaw = typeof co.rowspan === 'number' ? co.rowspan : 1;
            const colspanRaw = typeof co.colspan === 'number' ? co.colspan : 1;
            const content = typeof co.content === 'string' ? co.content : typeof co.body === 'string' ? (co.body as string) : '';
            if (rowId && colId && rowIds.includes(rowId) && colIds.includes(colId)) {
              return {
                id,
                rowId,
                colId,
                rowspan: clamp(Math.round(rowspanRaw), 1, rowIds.length),
                colspan: clamp(Math.round(colspanRaw), 1, colIds.length),
                content,
              };
            }

            // Legacy pixel format
            const x = typeof co.x === 'number' && Number.isFinite(co.x) ? (co.x as number) : 0;
            const y = typeof co.y === 'number' && Number.isFinite(co.y) ? (co.y as number) : 0;
            const w = typeof co.w === 'number' && Number.isFinite(co.w) ? (co.w as number) : defaultColW;
            const h = typeof co.h === 'number' && Number.isFinite(co.h) ? (co.h as number) : defaultRowH;
            const rIdx = nearestRow(y);
            const cIdx = nearestCol(x);
            return {
              id,
              rowId: rowIds[rIdx] || 'r-1',
              colId: colIds[cIdx] || 'c-1',
              rowspan: spanRows(h),
              colspan: spanCols(w),
              content,
            };
          })
          .filter((x): x is GridCardV1 => x !== null);
      })();

      return { id, name, mode, grid, cards, database };
    })
    .filter((x): x is GridSheetV1 => x !== null);

  if (!sheets.length) return null;
  const effectiveActive = activeSheetId && sheets.some((s) => s.id === activeSheetId) ? activeSheetId : sheets[0].id;
  return { version: 1, activeSheetId: effectiveActive, sheets, ...(peopleDirectory ? { peopleDirectory } : {}) };
}

function rectRegionCells(rows: string[], cols: string[], startRowIdx: number, startColIdx: number, rowspan: number, colspan: number) {
  const out: string[] = [];
  for (let r = startRowIdx; r < startRowIdx + rowspan; r++) {
    for (let c = startColIdx; c < startColIdx + colspan; c++) {
      const rowId = rows[r];
      const colId = cols[c];
      if (!rowId || !colId) continue;
      out.push(`${rowId}:${colId}`);
    }
  }
  return out;
}

export function convertLegacyTableJsonToGridDoc(markdown: string): GridDoc {
  const parsed = parseTableFromMarkdown(normalize(markdown).split('\n'));
  if (!parsed) return defaultDoc();

  // Map legacy column/row ids to new grid ids (keep stable ordering; reuse if already c-/r-).
  // Also pad to a sensible default so legacy 2x2 grids open like a spreadsheet.
  const legacyColIds = parsed.columns.map((c, i) => (String(c.id || '').startsWith('c-') ? String(c.id) : `c-${i + 1}`));
  const legacyRowIds = parsed.rows.map((r, i) => (String(r.id || '').startsWith('r-') ? String(r.id) : `r-${i + 1}`));
  const colIds = (() => {
    const min = 12;
    const base = legacyColIds.slice();
    for (let i = base.length; i < min; i++) base.push(`c-${i + 1}`);
    return base;
  })();
  const rowIds = (() => {
    const min = 50;
    const base = legacyRowIds.slice();
    for (let i = base.length; i < min; i++) base.push(`r-${i + 1}`);
    return base;
  })();

  const columns: GridColumnV1[] = colIds.map((id) => ({ id, width: 88 }));
  const rows: GridRowV1[] = rowIds.map((id) => ({ id, height: 22 }));

  const cells: Record<string, GridCellValueV1> = {};
  parsed.rows.forEach((row, rIdx) => {
    parsed.columns.forEach((col, cIdx) => {
      const value = (row.cells || {})[col.id] ?? '';
      const key = `${legacyRowIds[rIdx]}:${legacyColIds[cIdx]}`;
      if (typeof value === 'string' && value.length) cells[key] = { value };
    });
  });

  const regions: GridRegionV1[] = [];
  // mergedCells Map keys are `${rowId}:${colId}`; values include colspan/rowspan.
  let regionCounter = 1;
  parsed.mergedCells.forEach((m) => {
    const startRowIdx = parsed.rows.findIndex((r) => r.id === m.rowId);
    const startColIdx = parsed.columns.findIndex((c) => c.id === m.colId);
    if (startRowIdx < 0 || startColIdx < 0) return;
    const regionCells = rectRegionCells(rowIds, colIds, startRowIdx, startColIdx, m.rowspan, m.colspan);
    if (!regionCells.length) return;
    const anchorKey = regionCells[0];
    const value = cells[anchorKey]?.value ?? '';
    regions.push({ id: `reg-${regionCounter++}`, cells: regionCells, value });
  });

  const sheet: GridSheetV1 = {
    id: 'sheet-1',
    name: 'Sheet 1',
    mode: 'spreadsheet',
    grid: { columns, rows, cells, regions, tables: [] },
    cards: [],
    database: {
      properties: [],
      rows: [],
      views: [{ id: 'view-1', name: 'Table', kind: 'table' }],
      activeViewId: 'view-1',
    },
  };
  return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
}

export function loadGridDoc(markdown: string): LoadGridDocResult {
  const text = normalize(markdown);
  const match = text.match(getGridJsonBlockRegex());
  if (match) {
    const parsed = safeJsonParse((match[1] || '').trim());
    const coerced = coerceDoc(parsed);
    if (coerced) return { doc: coerced, source: 'gridjson' };
  }
  if (hasLegacyTableJson(text)) {
    return { doc: convertLegacyTableJsonToGridDoc(text), source: 'legacyTableJson' };
  }
  return { doc: defaultDoc(), source: 'default' };
}

export function saveGridDoc(markdown: string, doc: GridDoc): string {
  const text = normalize(markdown);
  const payload = JSON.stringify(doc, null, 2);
  const block = ['```gridjson', payload, '```'].join('\n');
  if (getGridJsonFullBlockRegex().test(text)) {
    return text.replace(getGridJsonFullBlockRegex(), block);
  }
  const needsLeadingNewline = text.length > 0 && !text.endsWith('\n');
  const sep = text.trim().length === 0 ? '' : '\n\n';
  return text + (needsLeadingNewline ? '\n' : '') + sep + block + '\n';
}

