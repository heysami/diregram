'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import type { GridCardV1, GridDoc, GridPersonV1, GridRegionV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';
import { listRecognizedMacros, replaceMacroOccurrence } from '@/lib/grid-cell-macros';
import type { NexusDataObject, NexusDataObjectStore } from '@/lib/data-object-storage';
import { materializeLinkedDataObjectTable, syncLinkedDataObjectTableStructure } from '@/lib/grid/linked-data-object-table';
import { loadDataObjectAttributes, newDataObjectAttributeId, upsertDataObjectAttributes } from '@/lib/data-object-attributes';
import { applyLinkedColumnsModeCellEditToDataObject } from '@/lib/grid/linked-data-object-writeback';
import { CellMarkdown } from '@/components/grid/cell/CellMarkdown';
import { DatePopover, PeoplePopover, PillsPopover } from '@/components/grid/cell/MacroPopovers';
import { MarkdownHelpModal } from '@/components/grid/cell/markdown/MarkdownHelpModal';
import { CommentEar } from '@/components/grid/comments/CommentEar';
import { TableFilterPopover } from '@/components/grid/spreadsheet/components/TableFilterPopover';
import { TableVisibilityPopover } from '@/components/grid/spreadsheet/components/TableVisibilityPopover';
import {
  addColumn as addGridColumn,
  addRow as addGridRow,
  createTableFromSelection as createTableFromSelectionModel,
  createRegionFromCells,
  deleteRegion,
  insertTableColumnAfter as insertTableColumnAfterModel,
  insertTableRowAfter as insertTableRowAfterModel,
  setTableFooterRows as setTableFooterRowsModel,
  setTableHeaderCols as setTableHeaderColsModel,
  setTableHeaderRows as setTableHeaderRowsModel,
  setTablePillsExpandAll as setTablePillsExpandAllModel,
  setTableHiddenCols as setTableHiddenColsModel,
  setTableHiddenRows as setTableHiddenRowsModel,
  setTableKind as setTableKindModel,
  setTableKeyColId as setTableKeyColIdModel,
  setCellValue as setCellValueModel,
  upsertTablePillsOptions,
} from '@/lib/grid/spreadsheetModel';
import { useTableFilterPopover } from '@/components/grid/spreadsheet/hooks/useTableFilterPopover';
import { computeAllTableFilterViews } from '@/lib/grid/table-filter-view';
import { computeAllTableHiddenColumnViews } from '@/lib/grid/table-hidden-columns';
import { isEnterEditShortcut } from '@/components/grid/spreadsheet/editShortcuts';
import { buildCopyTsv, isCopyShortcut, isPasteShortcut, applyPasteTsvToCells } from '@/components/grid/spreadsheet/gridClipboard';
import { selectedCellStyle, stickyInnerCellStyle } from '@/components/grid/spreadsheet/selectionStyles';
import { maybeAutoExpandColumnWidth } from '@/components/grid/spreadsheet/autoColumnWidth';
import { maybeAutoExpandRowHeight } from '@/components/grid/spreadsheet/autoRowHeight';
import { getCellSemanticBackground } from '@/components/grid/spreadsheet/semanticCellBackground';
import { useAutoFitRowHeights } from '@/components/grid/spreadsheet/hooks/useAutoFitRowHeights';
import { useAnchoredPopover } from '@/components/grid/spreadsheet/hooks/useAnchoredPopover';
import { StickyBars } from '@/components/grid/spreadsheet/components/StickyBars';
import { useTableDragDeleteKeys } from '@/components/grid/spreadsheet/hooks/useTableDragDeleteKeys';
import { buildGridCardCommentTargetKey, buildGridCellCommentTargetKey, parseGridCommentTargetKey } from '@/lib/grid-comments';
import { useDragRectSelection, type CellPos as DragCellPos } from '@/components/grid/spreadsheet/hooks/useDragRectSelection';

type CellPos = { r: number; c: number };

type TableDragState = {
  kind: 'col' | 'row';
  tableId: string;
  draggedId: string;
  overIndex: number;
  startScrollLeft: number;
  startScrollTop: number;
};

function colLabel(idx0: number): string {
  let n = idx0 + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function parseCoordKey(key: string): { rowId: string; colId: string } | null {
  const i = key.indexOf(':');
  if (i === -1) return null;
  const rowId = key.slice(0, i).trim();
  const colId = key.slice(i + 1).trim();
  if (!rowId || !colId) return null;
  return { rowId, colId };
}

function computeRegionAnchors(opts: { regions: GridRegionV1[]; rowIndexById: Map<string, number>; colIndexById: Map<string, number> }) {
  const { regions, rowIndexById, colIndexById } = opts;
  const anchorByRegionId = new Map<string, string>(); // regionId -> coordKey
  const regionIdByCoord = new Map<string, string>(); // coordKey -> regionId
  for (const reg of regions) {
    for (const k of reg.cells) {
      regionIdByCoord.set(k, reg.id);
    }
    let best: { row: number; col: number; key: string } | null = null;
    for (const k of reg.cells) {
      const parsed = parseCoordKey(k);
      if (!parsed) continue;
      const row = rowIndexById.get(parsed.rowId);
      const col = colIndexById.get(parsed.colId);
      if (row === undefined || col === undefined) continue;
      if (!best || row < best.row || (row === best.row && col < best.col)) best = { row, col, key: k };
    }
    if (best) anchorByRegionId.set(reg.id, best.key);
  }
  return { anchorByRegionId, regionIdByCoord };
}

export function SpreadsheetView({
  doc,
  sheet,
  activeTool,
  onOpenComments,
  commentTargetKeys,
  scrollToCommentTargetKey,
  onChangeSheet,
  onChangeDoc,
  diagramFiles,
  linkedDiagramFileId,
  onLinkedDiagramFileIdChange,
  linkedDiagramStatusLabel,
  linkedDataObjectStore,
  canEditLinkedDiagramFile,
  upsertLinkedDataObject,
}: {
  doc: GridDoc;
  sheet: GridSheetV1;
  activeTool?: 'select' | 'comment';
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  commentTargetKeys?: Set<string>;
  scrollToCommentTargetKey?: string | null;
  onChangeSheet: (next: GridSheetV1) => void;
  onChangeDoc: (next: GridDoc) => void;
  diagramFiles: Array<{ id: string; name: string; roomName: string; kind: string; canEdit: boolean }>;
  linkedDiagramFileId: string | null;
  onLinkedDiagramFileIdChange?: (nextFileId: string | null) => void;
  linkedDiagramStatusLabel?: string;
  linkedDataObjectStore: NexusDataObjectStore | null;
  canEditLinkedDiagramFile: boolean;
  upsertLinkedDataObject?: (obj: NexusDataObject) => void;
}) {
  const cols = sheet.grid.columns || [];
  const rows = sheet.grid.rows || [];
  const cells = sheet.grid.cells || {};
  const regions = sheet.grid.regions || [];
  const tables = sheet.grid.tables || [];
  const cards = sheet.cards || [];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<GridSheetV1>(sheet);
  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);
  const sheetAreaRef = useRef<HTMLDivElement | null>(null);

  const mutateSheet = useMemo(() => {
    return (fn: (s: GridSheetV1) => GridSheetV1) => {
      const base = sheetRef.current;
      const next = fn(base);
      if (next === base) return;
      sheetRef.current = next;
      onChangeSheet(next);
    };
  }, [onChangeSheet]);

  const docRef = useRef<GridDoc>(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const mutateDoc = useMemo(() => {
    return (fn: (d: GridDoc) => GridDoc) => {
      const base = docRef.current;
      const next = fn(base);
      if (next === base) return;
      docRef.current = next;
      onChangeDoc(next);
    };
  }, [onChangeDoc]);

  const colIndexById = useMemo(() => new Map(cols.map((c, idx) => [c.id, idx])), [cols]);
  const rowIndexById = useMemo(() => new Map(rows.map((r, idx) => [r.id, idx])), [rows]);

  const { anchorByRegionId, regionIdByCoord } = useMemo(
    () => computeRegionAnchors({ regions, rowIndexById, colIndexById }),
    [regions, rowIndexById, colIndexById],
  );
  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);

  const [selected, setSelected] = useState<CellPos>({ r: 0, c: 0 });
  // Anchor used for Shift+click rectangular ranges (file-browser semantics).
  const [selectionStart, setSelectionStart] = useState<CellPos | null>(null);
  // Current multi-selection set (used for both Shift ranges and Cmd/Ctrl toggles).
  const [cellSelection, setCellSelection] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<{ r: number; c: number } | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [tableDrag, setTableDrag] = useState<TableDragState | null>(null);
  const tableDragRef = useRef<TableDragState | null>(null);
  useEffect(() => {
    tableDragRef.current = tableDrag;
  }, [tableDrag]);
  const [tableControlsHover, setTableControlsHover] = useState<null | { tableId: string; showCols: boolean; showRows: boolean }>(null);

  const peopleDirectory = useMemo<GridPersonV1[]>(() => doc.peopleDirectory || [], [doc.peopleDirectory]);

  const {
    state: macroPopover,
    open: openMacroPopover,
    close: closeMacroPopover,
    setState: setMacroPopover,
  } = useAnchoredPopover<{
    kind: 'pills' | 'people' | 'date';
    occ: number;
    rIdx: number;
    cIdx: number;
    body: string;
    anchor: { left: number; top: number; width: number; height: number };
    tableId: string | null;
  }>({ popoverSelector: '[data-macro-popover="1"]' });

  const {
    state: cardMacroPopover,
    setState: setCardMacroPopover,
  } = useAnchoredPopover<{
    kind: 'pills' | 'people' | 'date';
    occ: number;
    cardId: string;
    body: string;
    anchor: { left: number; top: number; width: number; height: number };
  }>({ popoverSelector: '[data-card-macro-popover="1"]' });

  const tableFilterPopoverApi = useTableFilterPopover({
    sheetRef,
    tables,
    cells,
    mutateSheet,
  });
  const tableFilterPopover = tableFilterPopoverApi.state;
  const setTableFilterPopover = tableFilterPopoverApi.setState;

  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);

  const tableFilterViewById = useMemo(() => computeAllTableFilterViews({ tables, cells }), [tables, cells]);
  const tableHiddenColViewById = useMemo(() => computeAllTableHiddenColumnViews(tables), [tables]);

  const linkedObjSigRef = useRef<Map<string, string>>(new Map());

  const {
    state: tableVisibilityPopover,
    open: openTableVisibilityPopover,
    close: closeTableVisibilityPopover,
  } = useAnchoredPopover<{
    tableId: string;
    anchor: { left: number; top: number; width: number; height: number };
  }>({ popoverSelector: '[data-table-visibility-popover="1"]' });

  const [linkDraft, setLinkDraft] = useState<{ tableId: string; diagramFileId: string; dataObjectId: string } | null>(null);

  // Diagram -> Grid: when the linked data object changes, re-materialize linked tables on this sheet.
  useEffect(() => {
    if (!linkedDiagramFileId) return;
    if (!linkedDataObjectStore) return;
    const linkedTables = (sheet.grid.tables || []).filter((tb) => tb.dataObjectLink?.diagramFileId === linkedDiagramFileId);
    if (linkedTables.length === 0) return;

    const pending: Array<{ tableId: string; link: NonNullable<GridTableV1['dataObjectLink']>; obj: NexusDataObject }> = [];
    linkedTables.forEach((tb) => {
      const link = tb.dataObjectLink;
      if (!link) return;
      const obj = linkedDataObjectStore.objects.find((o) => o.id === link.dataObjectId) || null;
      if (!obj) return;
      const sig = JSON.stringify({ name: obj.name, attrs: loadDataObjectAttributes(obj.data) });
      const key = `${sheet.id}:${tb.id}:${link.dataObjectId}`;
      const prev = linkedObjSigRef.current.get(key);
      if (prev === sig) return;
      linkedObjSigRef.current.set(key, sig);
      pending.push({ tableId: tb.id, link, obj });
    });
    if (pending.length === 0) return;

    mutateSheet((s) => {
      let next = s;
      for (const p of pending) {
        const currentTable = (next.grid.tables || []).find((tb) => tb.id === p.tableId) || null;
        const currentLink = currentTable?.dataObjectLink || null;
        if (!currentTable || !currentLink) continue;
        if (currentLink.diagramFileId !== linkedDiagramFileId) continue;
        if (currentLink.dataObjectId !== p.obj.id) continue;
        // IMPORTANT: structure-only sync to avoid overwriting user-edited cell values on open.
        next = syncLinkedDataObjectTableStructure({
          sheet: next,
          tableId: p.tableId,
          diagramFileId: currentLink.diagramFileId,
          diagramRoomName: currentLink.diagramRoomName || `file-${currentLink.diagramFileId}`,
          dataObject: p.obj,
          previousLink: currentLink,
        }).sheet;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedDataObjectStore, linkedDiagramFileId, sheet.id]);

  // Card-cells (grid-snapped cards)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState('');
  const dragRef = useRef<{ id: string; startX: number; startY: number; originR: number; originC: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; originRowspan: number; originColspan: number } | null>(null);

  const updateCardContent = useCallback(
    (cardId: string, nextContent: string) => {
      mutateSheet((s) => {
        const nextCards = (s.cards || []).map((c) => (c.id === cardId ? { ...c, content: nextContent } : c));
        return { ...s, cards: nextCards };
      });
    },
    [mutateSheet],
  );

  const clampPos = (p: CellPos): CellPos => ({ r: Math.max(0, Math.min(rows.length - 1, p.r)), c: Math.max(0, Math.min(cols.length - 1, p.c)) });

  const getCoordKey = (rIdx: number, cIdx: number) => `${rows[rIdx]?.id}:${cols[cIdx]?.id}`;

  const getSelectionKeyForCell = useCallback(
    (rIdx: number, cIdx: number): string | null => {
      const destRowId = rows[rIdx]?.id;
      const destColId = cols[cIdx]?.id;
      if (!destRowId || !destColId) return null;
      const rowId = destRowId;
      const colId = destColId;
      const cellTable = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) || null;
      const tableFilterView = cellTable ? tableFilterViewById.get(cellTable.id) || null : null;
      const tableHiddenColView = cellTable ? tableHiddenColViewById.get(cellTable.id) || null : null;
      const tr = cellTable ? cellTable.rowIds.indexOf(rowId) : -1;
      const tc = cellTable ? cellTable.colIds.indexOf(colId) : -1;
      const hr = cellTable ? Math.max(0, Math.min(cellTable.rowIds.length, cellTable.headerRows || 0)) : 0;
      const hc = cellTable ? Math.max(0, Math.min(cellTable.colIds.length, cellTable.headerCols || 0)) : 0;
      const fr = cellTable
        ? Math.max(0, Math.min(Math.max(0, cellTable.rowIds.length - hr), cellTable.footerRows || 0))
        : 0;

      const mappedRowId =
        tableFilterView && cellTable && tr >= hr && tr < cellTable.rowIds.length - fr
          ? (tableFilterView.destToSourceRowId[rowId] ?? null)
          : rowId;
      const mappedColId =
        tableHiddenColView && cellTable && tc >= hc ? (tableHiddenColView.destToSourceColId[colId] ?? null) : colId;
      if (mappedRowId === null || mappedColId === null) return null;
      return `${mappedRowId}:${mappedColId}`;
    },
    [rows, cols, tables, tableFilterViewById, tableHiddenColViewById],
  );

  const dragRect = useDragRectSelection({
    getSelectionKeyForCell,
    setSelected: (p: DragCellPos) => setSelected(p),
    setCellSelection: (ns) => setCellSelection(ns),
  });

  useEffect(() => {
    const k = String(scrollToCommentTargetKey || '').trim();
    if (!k) return;
    if (!containerRef.current) return;

    const parsed = parseGridCommentTargetKey(k);
    if (!parsed) return;
    if (parsed.sheetId !== sheet.id) return;

    const scrollToCell = (rIdx: number, cIdx: number) => {
      const left = 44 + cols.slice(0, cIdx).reduce((sum, cc) => sum + (cc.width ?? 88), 0);
      const top = 22 + rows.slice(0, rIdx).reduce((sum, rr) => sum + Math.max(36, rr.height ?? 22), 0);
      containerRef.current?.scrollTo({
        left: Math.max(0, left - 120),
        top: Math.max(0, top - 90),
        behavior: 'smooth',
      });
    };

    if (parsed.kind === 'cell') {
      const rIdx = rowIndexById.get(parsed.rowId);
      const cIdx = colIndexById.get(parsed.colId);
      if (rIdx === undefined || cIdx === undefined) return;
      setSelected({ r: rIdx, c: cIdx });
      setSelectionStart({ r: rIdx, c: cIdx });
      setCellSelection(new Set([`${parsed.rowId}:${parsed.colId}`]));
      setSelectedCardId(null);
      setEditingCardId(null);
      scrollToCell(rIdx, cIdx);
      containerRef.current?.focus({ preventScroll: true });
      return;
    }

    if (parsed.kind === 'card') {
      const card = cards.find((c) => c.id === parsed.cardId) || null;
      if (!card) return;
      const rIdx = rowIndexById.get(card.rowId);
      const cIdx = colIndexById.get(card.colId);
      if (rIdx === undefined || cIdx === undefined) return;
      setSelectedCardId(card.id);
      setEditingCardId(null);
      scrollToCell(rIdx, cIdx);
      containerRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToCommentTargetKey, sheet.id]);

  // Initialize selection to the initially focused cell.
  useEffect(() => {
    if (!rows.length || !cols.length) return;
    setCellSelection((prev) => {
      if (prev.size) return prev;
      return new Set([getCoordKey(selected.r, selected.c)]);
    });
    setSelectionStart((prev) => prev ?? selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, cols.length]);

  const selectionRect = useMemo(() => {
    if (cellSelection.size <= 1) return null;
    let r0 = Infinity;
    let r1 = -Infinity;
    let c0 = Infinity;
    let c1 = -Infinity;
    let count = 0;
    for (const k of cellSelection) {
      const parsed = parseCoordKey(k);
      if (!parsed) continue;
      const rr = rowIndexById.get(parsed.rowId);
      const cc = colIndexById.get(parsed.colId);
      if (rr === undefined || cc === undefined) continue;
      count++;
      r0 = Math.min(r0, rr);
      r1 = Math.max(r1, rr);
      c0 = Math.min(c0, cc);
      c1 = Math.max(c1, cc);
    }
    if (!Number.isFinite(r0) || !Number.isFinite(c0) || count <= 1) return null;
    const area = (r1 - r0 + 1) * (c1 - c0 + 1);
    // Only treat as rectangle if selection fully covers it.
    if (area !== count) return null;
    return { r0, r1, c0, c1 };
  }, [cellSelection, rowIndexById, colIndexById]);

  const activeTable: GridTableV1 | null = useMemo(() => {
    // "Active table" should mean explicitly selected table only.
    // If nothing is selected, we want no Header rows/cols/footer controls visible.
    if (!tables.length) return null;
    if (!activeTableId) return null;
    return tables.find((x) => x.id === activeTableId) || null;
  }, [tables, activeTableId]);

  const activeTableInfo = useMemo(() => {
    if (!activeTable) return null;
    const rowSet = new Set(activeTable.rowIds);
    const colSet = new Set(activeTable.colIds);
    const rowPos = new Map(activeTable.rowIds.map((id, i) => [id, i]));
    const colPos = new Map(activeTable.colIds.map((id, i) => [id, i]));
    const rowIdxs = activeTable.rowIds.map((id) => rowIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    const colIdxs = activeTable.colIds.map((id) => colIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (!rowIdxs.length || !colIdxs.length) return null;
    const r0 = rowIdxs[0];
    const r1 = rowIdxs[rowIdxs.length - 1];
    const c0 = colIdxs[0];
    const c1 = colIdxs[colIdxs.length - 1];
    return { rowSet, colSet, rowPos, colPos, r0, r1, c0, c1 };
  }, [activeTable, rowIndexById, colIndexById]);

  const hoverTable: GridTableV1 | null = useMemo(() => {
    if (!tableControlsHover) return null;
    return tables.find((t) => t.id === tableControlsHover.tableId) || null;
  }, [tables, tableControlsHover]);

  const hoverTableInfo = useMemo(() => {
    if (!hoverTable) return null;
    const rowSet = new Set(hoverTable.rowIds);
    const colSet = new Set(hoverTable.colIds);
    const rowPos = new Map(hoverTable.rowIds.map((id, i) => [id, i]));
    const colPos = new Map(hoverTable.colIds.map((id, i) => [id, i]));
    const rowIdxs = hoverTable.rowIds.map((id) => rowIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    const colIdxs = hoverTable.colIds.map((id) => colIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (!rowIdxs.length || !colIdxs.length) return null;
    const r0 = rowIdxs[0];
    const r1 = rowIdxs[rowIdxs.length - 1];
    const c0 = colIdxs[0];
    const c1 = colIdxs[colIdxs.length - 1];
    return { rowSet, colSet, rowPos, colPos, r0, r1, c0, c1 };
  }, [hoverTable, rowIndexById, colIndexById]);

  const controlsTable: GridTableV1 | null = useMemo(() => {
    if (tableDrag) return tables.find((t) => t.id === tableDrag.tableId) || null;
    return hoverTable;
  }, [tableDrag, tables, hoverTable]);

  const controlsTableInfo = useMemo(() => {
    if (!controlsTable) return null;
    const rowIdxs = controlsTable.rowIds.map((id) => rowIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    const colIdxs = controlsTable.colIds.map((id) => colIndexById.get(id)).filter((x): x is number => x !== undefined).sort((a, b) => a - b);
    if (!rowIdxs.length || !colIdxs.length) return null;
    const r0 = rowIdxs[0];
    const r1 = rowIdxs[rowIdxs.length - 1];
    const c0 = colIdxs[0];
    const c1 = colIdxs[colIdxs.length - 1];
    return { r0, r1, c0, c1 };
  }, [controlsTable, rowIndexById, colIndexById]);

  const activeTableSticky = useMemo(() => {
    if (!activeTableId) return null;
    const t = tables.find((x) => x.id === activeTableId) || null;
    if (!t) return null;
    const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
    const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
    if (!hr && !hc) return { tableId: t.id, topByRowId: new Map<string, number>(), leftByColId: new Map<string, number>(), hr, hc };

    // Sticky table header cells should sit just below the sheet's column-label row (22px).
    // The top controls are outside the scroll container, so they do not contribute here.
    const baseTop = 22;
    const baseLeft = 44; // row-number column width

    const topByRowId = new Map<string, number>();
    let accTop = 0;
    for (let i = 0; i < hr; i++) {
      const rid = t.rowIds[i];
      if (!rid) continue;
      topByRowId.set(rid, baseTop + accTop);
      const idx = rowIndexById.get(rid);
      const h = idx === undefined ? 36 : Math.max(36, rows[idx]?.height ?? 22);
      accTop += h;
    }

    const leftByColId = new Map<string, number>();
    let accLeft = 0;
    for (let i = 0; i < hc; i++) {
      const cid = t.colIds[i];
      if (!cid) continue;
      leftByColId.set(cid, baseLeft + accLeft);
      const idx = colIndexById.get(cid);
      const w = idx === undefined ? 88 : (cols[idx]?.width ?? 88);
      accLeft += w;
    }

    return { tableId: t.id, topByRowId, leftByColId, hr, hc };
  }, [activeTableId, tables, rowIndexById, colIndexById, rows, cols]);

  const getDisplayValue = (rIdx: number, cIdx: number): { value: string; isRegion: boolean; regionId?: string } => {
    const destRowId = rows[rIdx]?.id;
    const destColId = cols[cIdx]?.id;
    if (!destRowId || !destColId) return { value: '', isRegion: false as const };

    const t = tables.find((tb) => tb.rowIds.includes(destRowId) && tb.colIds.includes(destColId)) || null;
    let rowId: string | null = destRowId;
    let colId: string | null = destColId;
    if (t) {
      const tr = t.rowIds.indexOf(destRowId);
      const tc = t.colIds.indexOf(destColId);
      const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
      const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
      const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
      const fv = tableFilterViewById.get(t.id) || null;
      if (fv && tr >= hr && tr < t.rowIds.length - fr) rowId = fv.destToSourceRowId[destRowId] ?? null;
      const cv = tableHiddenColViewById.get(t.id) || null;
      if (cv && tc >= hc) colId = cv.destToSourceColId[destColId] ?? null;
    }
    if (!rowId || !colId) return { value: '', isRegion: false as const };

    const key = `${rowId}:${colId}`;
    const regId = regionIdByCoord.get(key);
    return { value: cells[key]?.value ?? '', isRegion: Boolean(regId), ...(regId ? { regionId: regId } : {}) };
  };

  const commitEdit = (rIdx: number, cIdx: number, nextValue: string) => {
    mutateSheet((s) => {
      const destRowId = s.grid.rows?.[rIdx]?.id;
      const destColId = s.grid.columns?.[cIdx]?.id;
      if (!destRowId || !destColId) return s;

      const t = s.grid.tables?.find((tb) => tb.rowIds.includes(destRowId) && tb.colIds.includes(destColId)) || null;
      let rowId: string | null = destRowId;
      let colId: string | null = destColId;
      if (t) {
        const tr = t.rowIds.indexOf(destRowId);
        const tc = t.colIds.indexOf(destColId);
        const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
        const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
        const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
        const fv = tableFilterViewById.get(t.id) || null;
        if (fv && tr >= hr && tr < t.rowIds.length - fr) rowId = fv.destToSourceRowId[destRowId] ?? null;
        const cv = tableHiddenColViewById.get(t.id) || null;
        if (cv && tc >= hc) colId = cv.destToSourceColId[destColId] ?? null;
      }
      if (!rowId || !colId) return s;

      // If this cell is part of a linked data-object table, mirror edits back into the linked diagram doc.
      const link = t?.dataObjectLink || null;
      if (
        t &&
        link &&
        upsertLinkedDataObject &&
        canEditLinkedDiagramFile &&
        linkedDiagramFileId === link.diagramFileId &&
        linkedDataObjectStore
      ) {
        const obj = linkedDataObjectStore.objects.find((o) => o.id === link.dataObjectId) || null;
        if (obj) {
          const nextObj = applyLinkedColumnsModeCellEditToDataObject({
            obj,
            link,
            tableRowIds: t.rowIds,
            rowId,
            colId,
            nextValue,
          });
          if (nextObj) upsertLinkedDataObject(nextObj);
        }
      }

      const next = setCellValueModel(s, rowId, colId, nextValue);
      const srcCIdx = (next.grid.columns || []).findIndex((cc) => cc.id === colId);
      const srcRIdx = (next.grid.rows || []).findIndex((rr) => rr.id === rowId);
      if (srcCIdx === -1 || srcRIdx === -1) return next;
      const next2 = maybeAutoExpandColumnWidth(next, srcCIdx, nextValue);
      const colW = next2.grid.columns?.[srcCIdx]?.width ?? 88;
      return maybeAutoExpandRowHeight(next2, srcRIdx, nextValue, { colWidthPx: colW });
    });
  };

  // Auto-fit model row heights so wrapped/multiline content is visible without breaking card snapping.
  useAutoFitRowHeights({ cells, columns: cols, rows, mutateSheet });

  const sortedCoordKeys = (keys: string[]) => {
    const asKey = (k: string) => {
      const p = parseCoordKey(k);
      if (!p) return { r: 1e9, c: 1e9 };
      return { r: rowIndexById.get(p.rowId) ?? 1e9, c: colIndexById.get(p.colId) ?? 1e9 };
    };
    return keys
      .slice()
      .map((k) => ({ k, ...asKey(k) }))
      .sort((a, b) => (a.r - b.r) || (a.c - b.c) || a.k.localeCompare(b.k))
      .map((x) => x.k);
  };

  const addRow = () => {
    mutateSheet((s) => addGridRow(s));
  };

  const addColumn = () => {
    const t = activeTableId ? (tables.find((x) => x.id === activeTableId) || null) : null;
    if (t?.dataObjectLink && t.colIds.length) {
      insertTableColumnAfter(t.colIds[t.colIds.length - 1]!);
      return;
    }
    mutateSheet((s) => addGridColumn(s));
  };

  const createTableFromSelection = () => {
    if (!selectionRect) return;
    let createdId = '';
    mutateSheet((s) => {
      const res = createTableFromSelectionModel(s, selectionRect);
      createdId = res.tableId;
      return res.sheet;
    });
    if (createdId) setActiveTableId(createdId);
  };

  const setActiveTableHeaderRows = (nextHeaderRows: number) => {
    mutateSheet((s) => (activeTableId ? setTableHeaderRowsModel(s, activeTableId, nextHeaderRows) : s));
  };

  const setActiveTableHeaderCols = (nextHeaderCols: number) => {
    mutateSheet((s) => (activeTableId ? setTableHeaderColsModel(s, activeTableId, nextHeaderCols) : s));
  };

  const setActiveTableFooterRows = (nextFooterRows: number) => {
    mutateSheet((s) => (activeTableId ? setTableFooterRowsModel(s, activeTableId, nextFooterRows) : s));
  };

  const setActiveTablePillsExpandAll = (expandAll: boolean) => {
    mutateSheet((s) => (activeTableId ? setTablePillsExpandAllModel(s, activeTableId, expandAll) : s));
  };

  // Keep active table in sync with keyboard selection as well.
  useEffect(() => {
    const rowId = rows[selected.r]?.id;
    const colId = cols[selected.c]?.id;
    if (!rowId || !colId) return;
    const hit = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) || null;
    setActiveTableId(hit ? hit.id : null);
    if (!hit) setTableControlsHover(null);
  }, [selected, rows, cols, tables]);

  const canOperateOnColumn = (colId: string): boolean => {
    // Disallow if any card spans multiple columns and overlaps this column.
    const cardBlocks = cards.some((c) => c.colspan > 1 && (() => {
      const c0 = colIndexById.get(c.colId) ?? 0;
      const idx = colIndexById.get(colId);
      if (idx === undefined) return false;
      return idx >= c0 && idx < c0 + c.colspan;
    })());
    if (cardBlocks) return false;

    // Disallow if any region spans multiple columns and includes this column.
    for (const reg of regions) {
      let includes = false;
      const colsIn = new Set<string>();
      for (const k of reg.cells) {
        const p = parseCoordKey(k);
        if (!p) continue;
        colsIn.add(p.colId);
        if (p.colId === colId) includes = true;
        if (includes && colsIn.size > 1) return false;
      }
    }
    return true;
  };

  const canOperateOnRow = (rowId: string): boolean => {
    const cardBlocks = cards.some((c) => c.rowspan > 1 && (() => {
      const r0 = rowIndexById.get(c.rowId) ?? 0;
      const idx = rowIndexById.get(rowId);
      if (idx === undefined) return false;
      return idx >= r0 && idx < r0 + c.rowspan;
    })());
    if (cardBlocks) return false;

    for (const reg of regions) {
      let includes = false;
      const rowsIn = new Set<string>();
      for (const k of reg.cells) {
        const p = parseCoordKey(k);
        if (!p) continue;
        rowsIn.add(p.rowId);
        if (p.rowId === rowId) includes = true;
        if (includes && rowsIn.size > 1) return false;
      }
    }
    return true;
  };

  const insertTableColumnAfter = (afterColId: string) => {
    mutateSheet((s) => {
      const existing = s.grid.tables || [];
      const t =
        (activeTableId && existing.find((x) => x.id === activeTableId)) ||
        existing.find((tb) => tb.colIds.includes(afterColId)) ||
        existing[0] ||
        null;
      if (!t) return s;
      const before = t;
      let next = insertTableColumnAfterModel(s, t.id, afterColId, { canOperateOnColumn });

      // If this is a linked table, adding a column should create a new attribute on the linked data object.
      const link = before.dataObjectLink || null;
      if (
        link &&
        upsertLinkedDataObject &&
        canEditLinkedDiagramFile &&
        linkedDiagramFileId === link.diagramFileId &&
        linkedDataObjectStore
      ) {
        const after = (next.grid.tables || []).find((x) => x.id === before.id) || null;
        const newColId = after ? after.colIds.find((cid) => !before.colIds.includes(cid)) || null : null;
        if (after && newColId) {
          const obj = linkedDataObjectStore.objects.find((o) => o.id === link.dataObjectId) || null;
          if (obj) {
            const attrs = loadDataObjectAttributes(obj.data);
            const attrId = newDataObjectAttributeId();
            const newAttr = { id: attrId, name: 'NewAttribute', type: 'text' as const, sample: '' };
            upsertLinkedDataObject({ ...obj, data: upsertDataObjectAttributes(obj.data, [...attrs, newAttr]) });

            const headerRowId = after.rowIds[0] || '';
            const nextAttrMap = { ...(link.attributeColIds || {}), [attrId]: newColId };
            next = setCellValueModel(next, headerRowId, newColId, newAttr.name);
            next = {
              ...next,
              grid: {
                ...next.grid,
                tables: (next.grid.tables || []).map((tb) =>
                  tb.id === after.id ? { ...tb, dataObjectLink: { ...link, attributeColIds: nextAttrMap } } : tb,
                ),
              },
            };

            // Re-materialize to trim/reorder columns and ensure row count fits samples.
            const refreshed = syncLinkedDataObjectTableStructure({
              sheet: next,
              tableId: after.id,
              diagramFileId: link.diagramFileId,
              diagramRoomName: link.diagramRoomName || `file-${link.diagramFileId}`,
              dataObject: { ...obj, data: upsertDataObjectAttributes(obj.data, [...attrs, newAttr]) },
              previousLink: { ...link, attributeColIds: nextAttrMap },
            });
            next = refreshed.sheet;
          }
        }
      }

      return next;
    });
  };

  const insertTableRowAfter = (afterRowId: string) => {
    mutateSheet((s) => {
      const existing = s.grid.tables || [];
      const t =
        (activeTableId && existing.find((x) => x.id === activeTableId)) ||
        existing.find((tb) => tb.rowIds.includes(afterRowId)) ||
        existing[0] ||
        null;
      if (!t) return s;
      return insertTableRowAfterModel(s, t.id, afterRowId, { canOperateOnRow });
    });
  };

  const deleteTableColumnAt = useCallback(
    (tableId: string, colId: string) => {
      mutateSheet((s) => {
        const tablesNow = s.grid.tables || [];
        const t = tablesNow.find((x) => x.id === tableId) || null;
        if (!t) return s;
        const delIdx = t.colIds.indexOf(colId);
        if (delIdx < 0) return s;
        if (t.colIds.length <= 1) return s;
        for (let i = delIdx; i < t.colIds.length; i++) if (!canOperateOnColumn(t.colIds[i]!)) return s;

        const nextCells = { ...(s.grid.cells || {}) };
        const oldColIds = t.colIds.slice();

        // Shift table values left starting at delIdx, blanking the last column.
        for (const rowId of t.rowIds) {
          const vals: Array<string | null> = oldColIds.map((cid) => nextCells[`${rowId}:${cid}`]?.value ?? null);
          for (let i = delIdx; i < vals.length - 1; i++) vals[i] = vals[i + 1];
          vals[vals.length - 1] = null;
          oldColIds.forEach((cid, i) => {
            const v = vals[i];
            const k = `${rowId}:${cid}`;
            if (v === null || String(v).trim().length === 0) delete nextCells[k];
            else nextCells[k] = { value: String(v) };
          });
        }

        const newColIds = oldColIds.slice(0, -1);
        const rowSet = new Set(t.rowIds);
        const colSet = new Set(oldColIds);
        const rowsNow = s.grid.rows || [];
        const colsNow = s.grid.columns || [];
        const rowIdxById = new Map(rowsNow.map((r, i) => [r.id, i]));
        const colIdxById = new Map(colsNow.map((c, i) => [c.id, i]));

        const nextCards = (s.cards || []).flatMap((c) => {
          if (c.colspan !== 1) return [c];
          if (!colSet.has(c.colId)) return [c];
          const idx = oldColIds.indexOf(c.colId);
          if (idx < 0) return [c];

          const r0 = rowIdxById.get(c.rowId);
          const c0 = colIdxById.get(c.colId);
          if (r0 === undefined || c0 === undefined) return [c];
          for (let dr = 0; dr < c.rowspan; dr++) {
            const rid = rowsNow[r0 + dr]?.id;
            if (!rid || !rowSet.has(rid)) return [c];
          }

          if (idx === delIdx) return [];
          if (idx > delIdx) {
            const nextColId = oldColIds[idx - 1];
            return nextColId ? [{ ...c, colId: nextColId }] : [c];
          }
          return [c];
        });

        const nextRegions = (s.grid.regions || []).flatMap((rg) => {
          const colsIn = new Set<string>();
          const rowsIn = new Set<string>();
          for (const k of rg.cells) {
            const p = parseCoordKey(k);
            if (!p) continue;
            colsIn.add(p.colId);
            rowsIn.add(p.rowId);
          }
          if (colsIn.size !== 1) return [rg];
          const onlyCol = Array.from(colsIn)[0];
          if (!onlyCol || !colSet.has(onlyCol)) return [rg];
          for (const rid of rowsIn) if (!rowSet.has(rid)) return [rg];
          const idx = oldColIds.indexOf(onlyCol);
          if (idx < 0) return [rg];
          if (idx === delIdx) return [];
          if (idx > delIdx) {
            const nextColId = oldColIds[idx - 1];
            if (!nextColId) return [rg];
            const nextKeys = rg.cells.map((k) => {
              const p = parseCoordKey(k);
              if (!p) return k;
              return `${p.rowId}:${nextColId}`;
            });
            return [{ ...rg, cells: nextKeys }];
          }
          return [rg];
        });

        const nextTables = tablesNow.map((x) => {
          if (x.id !== t.id) return x;
          const nextHeaderCols = Math.max(0, Math.min(newColIds.length, x.headerCols || 0));
          return { ...x, colIds: newColIds, headerCols: nextHeaderCols };
        });

        return { ...s, cards: nextCards, grid: { ...s.grid, tables: nextTables, cells: nextCells, regions: nextRegions } };
      });
    },
    [mutateSheet, canOperateOnColumn],
  );

  const deleteTableRowAt = useCallback(
    (tableId: string, rowId: string) => {
      mutateSheet((s) => {
        const tablesNow = s.grid.tables || [];
        const t = tablesNow.find((x) => x.id === tableId) || null;
        if (!t) return s;
        const delIdx = t.rowIds.indexOf(rowId);
        if (delIdx < 0) return s;
        if (t.rowIds.length <= 1) return s;
        for (let i = delIdx; i < t.rowIds.length; i++) if (!canOperateOnRow(t.rowIds[i]!)) return s;

        const nextCells = { ...(s.grid.cells || {}) };
        const oldRowIds = t.rowIds.slice();

        // Shift table values up starting at delIdx, blanking the last row.
        for (const colId of t.colIds) {
          const vals: Array<string | null> = oldRowIds.map((rid) => nextCells[`${rid}:${colId}`]?.value ?? null);
          for (let i = delIdx; i < vals.length - 1; i++) vals[i] = vals[i + 1];
          vals[vals.length - 1] = null;
          oldRowIds.forEach((rid, i) => {
            const v = vals[i];
            const k = `${rid}:${colId}`;
            if (v === null || String(v).trim().length === 0) delete nextCells[k];
            else nextCells[k] = { value: String(v) };
          });
        }

        const newRowIds = oldRowIds.slice(0, -1);
        const rowSet = new Set(oldRowIds);
        const colSet = new Set(t.colIds);
        const rowsNow = s.grid.rows || [];
        const colsNow = s.grid.columns || [];
        const rowIdxById = new Map(rowsNow.map((r, i) => [r.id, i]));
        const colIdxById = new Map(colsNow.map((c, i) => [c.id, i]));

        const nextCards = (s.cards || []).flatMap((c) => {
          if (c.rowspan !== 1) return [c];
          if (!rowSet.has(c.rowId)) return [c];
          const idx = oldRowIds.indexOf(c.rowId);
          if (idx < 0) return [c];

          const r0 = rowIdxById.get(c.rowId);
          const c0 = colIdxById.get(c.colId);
          if (r0 === undefined || c0 === undefined) return [c];
          for (let dc = 0; dc < c.colspan; dc++) {
            const cid = colsNow[c0 + dc]?.id;
            if (!cid || !colSet.has(cid)) return [c];
          }

          if (idx === delIdx) return [];
          if (idx > delIdx) {
            const nextRowId = oldRowIds[idx - 1];
            return nextRowId ? [{ ...c, rowId: nextRowId }] : [c];
          }
          return [c];
        });

        const nextRegions = (s.grid.regions || []).flatMap((rg) => {
          const colsIn = new Set<string>();
          const rowsIn = new Set<string>();
          for (const k of rg.cells) {
            const p = parseCoordKey(k);
            if (!p) continue;
            colsIn.add(p.colId);
            rowsIn.add(p.rowId);
          }
          if (rowsIn.size !== 1) return [rg];
          const onlyRow = Array.from(rowsIn)[0];
          if (!onlyRow || !rowSet.has(onlyRow)) return [rg];
          for (const cid of colsIn) if (!colSet.has(cid)) return [rg];
          const idx = oldRowIds.indexOf(onlyRow);
          if (idx < 0) return [rg];
          if (idx === delIdx) return [];
          if (idx > delIdx) {
            const nextRowId = oldRowIds[idx - 1];
            if (!nextRowId) return [rg];
            const nextKeys = rg.cells.map((k) => {
              const p = parseCoordKey(k);
              if (!p) return k;
              return `${nextRowId}:${p.colId}`;
            });
            return [{ ...rg, cells: nextKeys }];
          }
          return [rg];
        });

        const nextTables = tablesNow.map((x) => {
          if (x.id !== t.id) return x;
          const nextHeaderRows = Math.max(0, Math.min(newRowIds.length, x.headerRows || 0));
          const nextFooterRows = Math.max(0, Math.min(Math.max(0, newRowIds.length - nextHeaderRows), x.footerRows ?? 0));
          return { ...x, rowIds: newRowIds, headerRows: nextHeaderRows, footerRows: nextFooterRows };
        });

        return { ...s, cards: nextCards, grid: { ...s.grid, tables: nextTables, cells: nextCells, regions: nextRegions } };
      });
    },
    [mutateSheet, canOperateOnRow],
  );

  const swapTableColumns = (aColId: string, bColId: string) => {
    mutateSheet((s) => {
      const existing = s.grid.tables || [];
      const t = (activeTableId && existing.find((x) => x.id === activeTableId)) || existing[0] || null;
      if (!t) return s;
      if (!canOperateOnColumn(aColId) || !canOperateOnColumn(bColId)) return s;
      const colsNow = s.grid.columns || [];
      const idxById = new Map(colsNow.map((c, i) => [c.id, i]));
      const aIdx = idxById.get(aColId);
      const bIdx = idxById.get(bColId);
      if (aIdx === undefined || bIdx === undefined) return s;
      const nextColumns = colsNow.slice();
      [nextColumns[aIdx], nextColumns[bIdx]] = [nextColumns[bIdx], nextColumns[aIdx]];

      const aPos = t.colIds.indexOf(aColId);
      const bPos = t.colIds.indexOf(bColId);
      if (aPos < 0 || bPos < 0) return s;
      const nextColIds = t.colIds.slice();
      [nextColIds[aPos], nextColIds[bPos]] = [nextColIds[bPos], nextColIds[aPos]];
      const nextTables = existing.map((x) => (x.id === t.id ? { ...x, colIds: nextColIds } : x));
      return { ...s, grid: { ...s.grid, columns: nextColumns, tables: nextTables } };
    });
  };

  const swapTableRows = (aRowId: string, bRowId: string) => {
    mutateSheet((s) => {
      const existing = s.grid.tables || [];
      const t = (activeTableId && existing.find((x) => x.id === activeTableId)) || existing[0] || null;
      if (!t) return s;
      if (!canOperateOnRow(aRowId) || !canOperateOnRow(bRowId)) return s;
      const rowsNow = s.grid.rows || [];
      const idxById = new Map(rowsNow.map((r, i) => [r.id, i]));
      const aIdx = idxById.get(aRowId);
      const bIdx = idxById.get(bRowId);
      if (aIdx === undefined || bIdx === undefined) return s;
      const nextRows = rowsNow.slice();
      [nextRows[aIdx], nextRows[bIdx]] = [nextRows[bIdx], nextRows[aIdx]];

      const aPos = t.rowIds.indexOf(aRowId);
      const bPos = t.rowIds.indexOf(bRowId);
      if (aPos < 0 || bPos < 0) return s;
      const nextRowIds = t.rowIds.slice();
      [nextRowIds[aPos], nextRowIds[bPos]] = [nextRowIds[bPos], nextRowIds[aPos]];
      const nextTables = existing.map((x) => (x.id === t.id ? { ...x, rowIds: nextRowIds } : x));
      return { ...s, grid: { ...s.grid, rows: nextRows, tables: nextTables } };
    });
  };

  const rowIndexOf = (rowId: string) => rowIndexById.get(rowId) ?? 0;
  const colIndexOf = (colId: string) => colIndexById.get(colId) ?? 0;
  const cardOccupies = (card: GridCardV1, rIdx: number, cIdx: number) => {
    const r0 = rowIndexOf(card.rowId);
    const c0 = colIndexOf(card.colId);
    return rIdx >= r0 && rIdx < r0 + card.rowspan && cIdx >= c0 && cIdx < c0 + card.colspan;
  };
  const cardAt = (rIdx: number, cIdx: number) => {
    for (const card of cards) if (cardOccupies(card, rIdx, cIdx)) return card;
    return null;
  };

  const ensureGridSizeOn = (s: GridSheetV1, minRows: number, minCols: number): GridSheetV1 => {
    const nextRows = (s.grid.rows || []).slice();
    const nextCols = (s.grid.columns || []).slice();
    for (let i = nextRows.length; i < minRows; i++) nextRows.push({ id: `r-${i + 1}`, height: 22 });
    for (let i = nextCols.length; i < minCols; i++) nextCols.push({ id: `c-${i + 1}`, width: 88 });
    if (nextRows.length === (s.grid.rows || []).length && nextCols.length === (s.grid.columns || []).length) return s;
    return { ...s, grid: { ...s.grid, rows: nextRows, columns: nextCols } };
  };

  const addCardAt = (
    rIdx: number,
    cIdx: number,
    template?: {
      rowspan: number;
      colspan: number;
    },
  ) => {
    mutateSheet((s0) => {
      const s = ensureGridSizeOn(s0, rIdx + 1, cIdx + 1);
      const nextRows = s.grid.rows || [];
      const nextCols = s.grid.columns || [];
      const cardsNow = s.cards || [];

      const existing = (() => {
        const rr = Math.min(rIdx, nextRows.length - 1);
        const cc = Math.min(cIdx, nextCols.length - 1);
        const kRow = nextRows[rr]?.id;
        const kCol = nextCols[cc]?.id;
        if (!kRow || !kCol) return null;
        for (const card of cardsNow) {
          const r0 = rowIndexById.get(card.rowId) ?? 0;
          const c0 = colIndexById.get(card.colId) ?? 0;
          if (rr >= r0 && rr < r0 + card.rowspan && cc >= c0 && cc < c0 + card.colspan) return card;
        }
        return null;
      })();

      if (existing) {
        setSelectedCardId(existing.id);
        setEditingCardId(existing.id);
        setCardDraft(existing.content || '');
        return s;
      }

      const max = Math.max(0, ...cardsNow.map((c) => Number(String(c.id).split('-').pop()) || 0));
      const id = `card-${max + 1}`;
      const rowspan = Math.max(1, Math.round(template?.rowspan ?? 1));
      const colspan = Math.max(1, Math.round(template?.colspan ?? 1));
      const nextCard: GridCardV1 = {
        id,
        rowId: nextRows[rIdx]?.id || 'r-1',
        colId: nextCols[cIdx]?.id || 'c-1',
        rowspan: Math.min(rowspan, Math.max(1, nextRows.length - rIdx)),
        colspan: Math.min(colspan, Math.max(1, nextCols.length - cIdx)),
        content: '',
      };
      const nextCards = [...cardsNow, nextCard];
      setSelectedCardId(id);
      setEditingCardId(id);
      setCardDraft('');
      return { ...s, cards: nextCards };
    });
  };

  const addCard = () => {
    addCardAt(selected.r, selected.c);
  };

  const mergePickedCells = () => {
    const picked = Array.from(cellSelection.values()).map((k) => k.trim()).filter(Boolean);
    if (picked.length < 2) return;
    // Enforce uniqueness: remove any coords already owned by a region.
    const filtered = picked.filter((k) => !regionIdByCoord.get(k));
    if (filtered.length < 2) return;
    let nextId = '';
    mutateSheet((s) => {
      const res = createRegionFromCells(s, sortedCoordKeys(filtered));
      nextId = res.regionId;
      return res.sheet;
    });
    if (nextId) setActiveRegionId(nextId);
  };

  const unmergeActiveRegion = () => {
    if (!activeRegionId) return;
    // Regions are visual grouping only; cell values remain per-cell.
    mutateSheet((s) => deleteRegion(s, activeRegionId));
    setActiveRegionId(null);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKeyDown = async (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      // When any popover is open, don't let sheet shortcuts/typing hijack keystrokes.
      if (macroPopover || tableFilterPopover || tableVisibilityPopover) return;
      // While editing a card, do not allow the sheet to interpret keystrokes.
      if (editingCardId) return;
      if (editing) return;

      // Excel-ish shortcuts to enter edit mode on selected cell.
      // - Cmd/Ctrl+Enter: edit (without triggering table row insert behavior)
      // - F2: edit
      if (isEnterEditShortcut(e)) {
        e.preventDefault();
        setSelectedCardId(null);
        setEditingCardId(null);
        setSelectionStart(selected);
        setCellSelection(new Set([getCoordKey(selected.r, selected.c)]));
        const { value } = getDisplayValue(selected.r, selected.c);
        setEditing({ r: selected.r, c: selected.c });
        setEditDraft(value);
        return;
      }

      // Card keyboard flow (diagram-node-like):
      // - selected card (not editing): Enter -> create/select card below, Tab -> right, Delete -> delete, typing -> edit
      if (selectedCardId) {
        const card = cards.find((c) => c.id === selectedCardId) || null;
        if (!card) {
          setSelectedCardId(null);
        } else if (!editingCardId) {
          const r0 = rowIndexOf(card.rowId);
          const c0 = colIndexOf(card.colId);

          if (e.key === 'Escape') {
            e.preventDefault();
            setSelectedCardId(null);
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            mutateSheet((s) => ({ ...s, cards: (s.cards || []).filter((c) => c.id !== selectedCardId) }));
            setSelectedCardId(null);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            addCardAt(r0 + card.rowspan, c0, { rowspan: card.rowspan, colspan: card.colspan });
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            addCardAt(r0, c0 + card.colspan, { rowspan: card.rowspan, colspan: card.colspan });
            return;
          }
          if (!isCmd && e.key.length === 1 && !e.altKey) {
            e.preventDefault();
            setEditingCardId(selectedCardId);
            setCardDraft(e.key);
            return;
          }
        }
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedCardId(null);
        setEditingCardId(null);
        const delta = e.key === 'ArrowUp' ? { dr: -1, dc: 0 } : e.key === 'ArrowDown' ? { dr: 1, dc: 0 } : e.key === 'ArrowLeft' ? { dr: 0, dc: -1 } : { dr: 0, dc: 1 };
        const next = clampPos({ r: selected.r + delta.dr, c: selected.c + delta.dc });
        if (e.shiftKey) {
          const start = selectionStart ?? selected;
          if (!selectionStart) setSelectionStart(selected);
          setSelected(next);
          const r0 = Math.min(start.r, next.r);
          const r1 = Math.max(start.r, next.r);
          const c0 = Math.min(start.c, next.c);
          const c1 = Math.max(start.c, next.c);
          const ns = new Set<string>();
          for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) ns.add(getCoordKey(rr, cc));
          setCellSelection(ns);
        } else {
          setSelected(next);
          setSelectionStart(next);
          setCellSelection(new Set([getCoordKey(next.r, next.c)]));
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        setSelectedCardId(null);
        setEditingCardId(null);
        // If we're in a table and at the last table row, Enter should insert a new table row.
        const rowId = rows[selected.r]?.id;
        const colId = cols[selected.c]?.id;
        const t = rowId && colId ? tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) : null;
        // In collapsed filter view, selection is mapped to source rows, so no extra guard needed here.
        if (t && rowId === t.rowIds[t.rowIds.length - 1]) {
          insertTableRowAfter(rowId);
          const nextR = Math.min(rows.length, selected.r + 1);
          setSelected({ r: nextR, c: selected.c });
          setSelectionStart({ r: nextR, c: selected.c });
          const nextRowId = rows[nextR]?.id;
          if (nextRowId && colId) setCellSelection(new Set([`${nextRowId}:${colId}`]));
          return;
        }
        setSelectionStart(selected);
        setCellSelection(new Set([getCoordKey(selected.r, selected.c)]));
        const { value } = getDisplayValue(selected.r, selected.c);
        setEditing({ r: selected.r, c: selected.c });
        setEditDraft(value);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedCardId(null);
        setEditingCardId(null);
        const rowId = rows[selected.r]?.id;
        const colId = cols[selected.c]?.id;
        const t = rowId && colId ? tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) : null;
        if (t && !e.shiftKey && colId === t.colIds[t.colIds.length - 1]) {
          insertTableColumnAfter(colId);
        }
        const next = clampPos({ r: selected.r, c: selected.c + (e.shiftKey ? -1 : 1) });
        setSelected(next);
        setSelectionStart(next);
        setCellSelection(new Set([getCoordKey(next.r, next.c)]));
        return;
      }

      if (e.key === 'Escape') {
        setSelectionStart(selected);
        setCellSelection(new Set([getCoordKey(selected.r, selected.c)]));
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setSelectedCardId(null);
        setEditingCardId(null);
        mutateSheet((s) => {
          const nextCells = { ...(s.grid.cells || {}) };
          const targets = cellSelection.size ? Array.from(cellSelection) : [getCoordKey(selected.r, selected.c)];
          for (const k of targets) delete nextCells[k];
          return { ...s, grid: { ...s.grid, cells: nextCells } };
        });
        return;
      }

      // Start editing on printable character.
      if (!isCmd && e.key.length === 1 && !e.altKey) {
        const ch = e.key;
        if (ch) {
          e.preventDefault();
          setSelectedCardId(null);
          setEditingCardId(null);
          setSelectionStart(selected);
          setCellSelection(new Set([getCoordKey(selected.r, selected.c)]));
          setEditing({ r: selected.r, c: selected.c });
          setEditDraft(ch);
          return;
        }
      }

      // Copy / Paste (TSV)
      if (isCopyShortcut(e)) {
        e.preventDefault();
        const rect = selectionRect || { r0: selected.r, r1: selected.r, c0: selected.c, c1: selected.c };
        const out = buildCopyTsv({ rect, getValue: (r, c) => getDisplayValue(r, c).value });
        try {
          await navigator.clipboard.writeText(out);
        } catch {
          // ignore
        }
        return;
      }
      if (isPasteShortcut(e)) {
        e.preventDefault();
        let text = '';
        try {
          text = await navigator.clipboard.readText();
        } catch {
          return;
        }
        if (!text) return;
        const nextCells = applyPasteTsvToCells({
          text,
          start: selected,
          rowsLen: rows.length,
          colsLen: cols.length,
          getCoordKey,
          baseCells: cells,
        });
        mutateSheet((s) => ({ ...s, grid: { ...s.grid, cells: nextCells } }));
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [
    cells,
    cols.length,
    cellSelection,
    editing,
    onChangeSheet,
    rows.length,
    selected,
    selectionRect,
    selectionStart,
    sheet,
    regionIdByCoord,
    selectedCardId,
    editingCardId,
    cards,
    macroPopover,
    tableFilterPopover,
  ]);

  // Drag / resize cards snapped to cell grid.
  useEffect(() => {
    const colStarts = (() => {
      const out = new Array(cols.length + 1).fill(0);
      for (let i = 0; i < cols.length; i++) out[i + 1] = out[i] + (cols[i]?.width ?? 88);
      return out;
    })();
    const rowStarts = (() => {
      const out = new Array(rows.length + 1).fill(0);
      for (let i = 0; i < rows.length; i++) out[i + 1] = out[i] + Math.max(36, rows[i]?.height ?? 22);
      return out;
    })();
    const idxAt = (starts: number[], x: number) => {
      // x is 0-based coordinate inside grid area (excluding labels).
      let lo = 0;
      let hi = starts.length - 2;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const a = starts[mid]!;
        const b = starts[mid + 1]!;
        if (x < a) hi = mid - 1;
        else if (x >= b) lo = mid + 1;
        else return mid;
      }
      return Math.max(0, Math.min(starts.length - 2, lo));
    };
    const pointInSheet = (clientX: number, clientY: number) => {
      const el = sheetAreaRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const r = resizeRef.current;
      if (!d && !r) return;
      e.preventDefault();
      if (d) {
        const card = cards.find((c) => c.id === d.id);
        if (!card) return;
        const p0 = pointInSheet(d.startX, d.startY);
        const p1 = pointInSheet(e.clientX, e.clientY);
        if (!p0 || !p1) return;
        const originLeft = 44 + colStarts[d.originC]!;
        const originTop = 22 + rowStarts[d.originR]!;
        const grabX = p0.x - originLeft;
        const grabY = p0.y - originTop;
        const nextLeft = p1.x - grabX;
        const nextTop = p1.y - grabY;
        const nextC = Math.max(0, Math.min(cols.length - card.colspan, idxAt(colStarts, nextLeft - 44)));
        const nextR = Math.max(0, Math.min(rows.length - card.rowspan, idxAt(rowStarts, nextTop - 22)));
        const nextCards = cards.map((c) => (c.id === d.id ? { ...c, colId: cols[nextC]?.id || c.colId, rowId: rows[nextR]?.id || c.rowId } : c));
        mutateSheet((s) => ({ ...s, cards: nextCards }));
      } else if (r) {
        const card = cards.find((c) => c.id === r.id);
        if (!card) return;
        const r0 = rowIndexOf(card.rowId);
        const c0 = colIndexOf(card.colId);
        const p1 = pointInSheet(e.clientX, e.clientY);
        if (!p1) return;
        const xGrid = p1.x - 44;
        const yGrid = p1.y - 22;
        const hitC = idxAt(colStarts, xGrid);
        const hitR = idxAt(rowStarts, yGrid);
        const nextColspan = Math.max(1, Math.min(cols.length - c0, hitC - c0 + 1));
        const nextRowspan = Math.max(1, Math.min(rows.length - r0, hitR - r0 + 1));
        const nextCards = cards.map((c) => (c.id === r.id ? { ...c, colspan: nextColspan, rowspan: nextRowspan } : c));
        mutateSheet((s) => ({ ...s, cards: nextCards }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [cards, cols, rows, mutateSheet, colIndexById, rowIndexById]);

  // Drag-reorder table columns/rows (with ghost indicator).
  useEffect(() => {
    if (!tableDrag) return;
    const preventWheel = (e: WheelEvent) => {
      const d = tableDragRef.current;
      if (!d) return;
      const host = containerRef.current;
      if (!host) return;
      const t = e.target as Node | null;
      if (t && host.contains(t)) {
        e.preventDefault();
        // Keep the scroll pinned.
        host.scrollLeft = d.startScrollLeft;
        host.scrollTop = d.startScrollTop;
      }
    };
    const preventTouchMove = (e: TouchEvent) => {
      const d = tableDragRef.current;
      if (!d) return;
      const host = containerRef.current;
      if (!host) return;
      const t = e.target as Node | null;
      if (t && host.contains(t)) {
        e.preventDefault();
        host.scrollLeft = d.startScrollLeft;
        host.scrollTop = d.startScrollTop;
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = tableDragRef.current;
      if (!d) return;
      e.preventDefault();
      const host = containerRef.current;
      const el = sheetAreaRef.current;
      if (!host) return;
      if (!el) return;
      // Lock scroll during drag to prevent pointer math "drifting" / offsetting.
      if (host.scrollLeft !== d.startScrollLeft) host.scrollLeft = d.startScrollLeft;
      if (host.scrollTop !== d.startScrollTop) host.scrollTop = d.startScrollTop;
      // Measure pointer relative to the table area (NOT the scroll container with sticky bars).
      const rect = el.getBoundingClientRect();
      const xIn = e.clientX - rect.left;
      const yIn = e.clientY - rect.top;
      const s = sheetRef.current;
      const tablesNow = s.grid.tables || [];
      const t = tablesNow.find((x) => x.id === d.tableId) || null;
      if (!t) return;
      const colsNow = s.grid.columns || [];
      const rowsNow = s.grid.rows || [];
      const colIdxById = new Map(colsNow.map((c, i) => [c.id, i]));
      const rowIdxById = new Map(rowsNow.map((r, i) => [r.id, i]));
      const colLeft = (colIdx: number) => 44 + colsNow.slice(0, colIdx).reduce((sum, cc) => sum + (cc.width ?? 88), 0);
      const rowTop = (rowIdx: number) =>
        22 + rowsNow.slice(0, rowIdx).reduce((sum, rr) => sum + Math.max(36, rr.height ?? 22), 0);

      if (d.kind === 'col') {
        // Clamp pointer to table bounds to avoid snapping to ends.
        let x = xIn;
        const leftIdx = t.colIds[0] ? (colIdxById.get(t.colIds[0]) ?? -1) : -1;
        const rightIdx = t.colIds[t.colIds.length - 1] ? (colIdxById.get(t.colIds[t.colIds.length - 1]) ?? -1) : -1;
        if (leftIdx >= 0 && rightIdx >= 0) {
          const left = colLeft(leftIdx);
          const right = colLeft(rightIdx) + (colsNow[rightIdx]?.width ?? 88);
          if (xIn < left - 200 || xIn > right + 200) return;
          x = Math.max(left, Math.min(right, xIn));
        }
        const centers = t.colIds
          .map((id, idxInTable) => {
            const idx = colIdxById.get(id);
            if (idx === undefined) return null;
            const left = colLeft(idx);
            const w = colsNow[idx]?.width ?? 88;
            return { idxInTable, mid: left + w / 2 };
          })
          .filter((v): v is { idxInTable: number; mid: number } => v !== null);
        if (!centers.length) return;
        let best = centers[0]!.idxInTable;
        let bestD = Infinity;
        centers.forEach((c) => {
          const d = Math.abs(x - c.mid);
          if (d < bestD) {
            bestD = d;
            best = c.idxInTable;
          }
        });
        setTableDrag((prev) => (prev ? { ...prev, overIndex: best } : prev));
      } else {
        let y = yIn;
        const topIdx = t.rowIds[0] ? (rowIdxById.get(t.rowIds[0]) ?? -1) : -1;
        const bottomIdx = t.rowIds[t.rowIds.length - 1] ? (rowIdxById.get(t.rowIds[t.rowIds.length - 1]) ?? -1) : -1;
        if (topIdx >= 0 && bottomIdx >= 0) {
          const top = rowTop(topIdx);
          const bottom = rowTop(bottomIdx) + Math.max(36, rowsNow[bottomIdx]?.height ?? 22);
          if (yIn < top - 200 || yIn > bottom + 200) return;
          y = Math.max(top, Math.min(bottom, yIn));
        }
        const centers = t.rowIds
          .map((id, idxInTable) => {
            const idx = rowIdxById.get(id);
            if (idx === undefined) return null;
            const top = rowTop(idx);
            const h = Math.max(36, rowsNow[idx]?.height ?? 22);
            return { idxInTable, mid: top + h / 2 };
          })
          .filter((v): v is { idxInTable: number; mid: number } => v !== null);
        if (!centers.length) return;
        let best = centers[0]!.idxInTable;
        let bestD = Infinity;
        centers.forEach((r) => {
          const d = Math.abs(y - r.mid);
          if (d < bestD) {
            bestD = d;
            best = r.idxInTable;
          }
        });
        setTableDrag((prev) => (prev ? { ...prev, overIndex: best } : prev));
      }
    };

    const onUp = () => {
      const d = tableDragRef.current;
      if (!d) return;
      tableDragRef.current = null;
      setTableDrag(null);
      mutateSheet((s) => {
        const tablesNow = s.grid.tables || [];
        const t = tablesNow.find((x) => x.id === d.tableId) || null;
        if (!t) return s;

        const move = <T,>(arr: T[], from: number, to: number) => {
          const next = arr.slice();
          const [it] = next.splice(from, 1);
          next.splice(to, 0, it);
          return next;
        };

        if (d.kind === 'col') {
          const from = t.colIds.indexOf(d.draggedId);
          const to = Math.max(0, Math.min(t.colIds.length - 1, d.overIndex));
          if (from < 0 || to === from) return s;
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          for (let i = lo; i <= hi; i++) if (!canOperateOnColumn(t.colIds[i])) return s;

          // Only reorder cell values inside the table region (do NOT reorder sheet columns).
          const nextOrder = move(t.colIds, from, to);
          const movedIdxs = move(
            Array.from({ length: t.colIds.length }).map((_, i) => i),
            from,
            to,
          );
          const newPosForOld: number[] = [];
          movedIdxs.forEach((oldIdx, newIdx) => {
            newPosForOld[oldIdx] = newIdx;
          });
          const nextCells = { ...(s.grid.cells || {}) };
          for (const rowId of t.rowIds) {
            const vals = t.colIds.map((colId) => nextCells[`${rowId}:${colId}`]?.value ?? null);
            const moved = move(vals, from, to);
            t.colIds.forEach((colId, idx) => {
              const v = moved[idx];
              const k = `${rowId}:${colId}`;
              if (v === null || String(v).trim().length === 0) delete nextCells[k];
              else nextCells[k] = { value: String(v) };
            });
          }
          // Also move cards/regions that do NOT cross columns (colspan==1 / single-col region) and are fully inside the table.
          const rowSet = new Set(t.rowIds);
          const colSet = new Set(t.colIds);
          const rowsNow = s.grid.rows || [];
          const colsNow = s.grid.columns || [];
          const rowIdxById = new Map(rowsNow.map((r, i) => [r.id, i]));
          const colIdxById = new Map(colsNow.map((c, i) => [c.id, i]));

          const nextCards = (s.cards || []).map((c) => {
            if (c.colspan !== 1) return c;
            if (!colSet.has(c.colId)) return c;
            const oldColIdx = t.colIds.indexOf(c.colId);
            if (oldColIdx < 0) return c;
            const nextColIdx = newPosForOld[oldColIdx];
            const nextColId = t.colIds[nextColIdx];
            if (!nextColId) return c;
            const r0 = rowIdxById.get(c.rowId);
            const c0 = colIdxById.get(c.colId);
            if (r0 === undefined || c0 === undefined) return c;
            for (let dr = 0; dr < c.rowspan; dr++) {
              const rid = rowsNow[r0 + dr]?.id;
              if (!rid || !rowSet.has(rid)) return c;
            }
            return { ...c, colId: nextColId };
          });

          const nextRegions = (s.grid.regions || []).map((rg) => {
            const colsIn = new Set<string>();
            const rowsIn = new Set<string>();
            for (const k of rg.cells) {
              const p = parseCoordKey(k);
              if (!p) continue;
              colsIn.add(p.colId);
              rowsIn.add(p.rowId);
            }
            if (colsIn.size !== 1) return rg;
            const onlyCol = Array.from(colsIn)[0];
            if (!onlyCol || !colSet.has(onlyCol)) return rg;
            for (const rid of rowsIn) if (!rowSet.has(rid)) return rg;
            const oldColIdx = t.colIds.indexOf(onlyCol);
            if (oldColIdx < 0) return rg;
            const nextColIdx = newPosForOld[oldColIdx];
            const nextColId = t.colIds[nextColIdx];
            if (!nextColId) return rg;
            const nextCellsKeys = rg.cells.map((k) => {
              const p = parseCoordKey(k);
              if (!p) return k;
              return `${p.rowId}:${nextColId}`;
            });
            return { ...rg, cells: nextCellsKeys };
          });

          // Keep table boundary (colIds) stable; values are permuted to simulate reorder.
          void nextOrder;
          return { ...s, cards: nextCards, grid: { ...s.grid, cells: nextCells, regions: nextRegions } };
        }

        const from = t.rowIds.indexOf(d.draggedId);
        const to = Math.max(0, Math.min(t.rowIds.length - 1, d.overIndex));
        if (from < 0 || to === from) return s;
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        for (let i = lo; i <= hi; i++) if (!canOperateOnRow(t.rowIds[i])) return s;

        const nextCells = { ...(s.grid.cells || {}) };
        for (const colId of t.colIds) {
          const vals = t.rowIds.map((rowId) => nextCells[`${rowId}:${colId}`]?.value ?? null);
          const moved = move(vals, from, to);
          t.rowIds.forEach((rowId, idx) => {
            const v = moved[idx];
            const k = `${rowId}:${colId}`;
            if (v === null || String(v).trim().length === 0) delete nextCells[k];
            else nextCells[k] = { value: String(v) };
          });
        }
        const movedIdxs = move(
          Array.from({ length: t.rowIds.length }).map((_, i) => i),
          from,
          to,
        );
        const newPosForOld: number[] = [];
        movedIdxs.forEach((oldIdx, newIdx) => {
          newPosForOld[oldIdx] = newIdx;
        });

        const rowSet = new Set(t.rowIds);
        const colSet = new Set(t.colIds);
        const rowsNow = s.grid.rows || [];
        const colsNow = s.grid.columns || [];
        const rowIdxById = new Map(rowsNow.map((r, i) => [r.id, i]));
        const colIdxById = new Map(colsNow.map((c, i) => [c.id, i]));

        const nextCards = (s.cards || []).map((c) => {
          if (c.rowspan !== 1) return c;
          if (!rowSet.has(c.rowId)) return c;
          const oldRowIdx = t.rowIds.indexOf(c.rowId);
          if (oldRowIdx < 0) return c;
          const nextRowIdx = newPosForOld[oldRowIdx];
          const nextRowId = t.rowIds[nextRowIdx];
          if (!nextRowId) return c;
          const r0 = rowIdxById.get(c.rowId);
          const c0 = colIdxById.get(c.colId);
          if (r0 === undefined || c0 === undefined) return c;
          for (let dc = 0; dc < c.colspan; dc++) {
            const cid = colsNow[c0 + dc]?.id;
            if (!cid || !colSet.has(cid)) return c;
          }
          return { ...c, rowId: nextRowId };
        });

        const nextRegions = (s.grid.regions || []).map((rg) => {
          const colsIn = new Set<string>();
          const rowsIn = new Set<string>();
          for (const k of rg.cells) {
            const p = parseCoordKey(k);
            if (!p) continue;
            colsIn.add(p.colId);
            rowsIn.add(p.rowId);
          }
          if (rowsIn.size !== 1) return rg;
          const onlyRow = Array.from(rowsIn)[0];
          if (!onlyRow || !rowSet.has(onlyRow)) return rg;
          for (const cid of colsIn) if (!colSet.has(cid)) return rg;
          const oldRowIdx = t.rowIds.indexOf(onlyRow);
          if (oldRowIdx < 0) return rg;
          const nextRowIdx = newPosForOld[oldRowIdx];
          const nextRowId = t.rowIds[nextRowIdx];
          if (!nextRowId) return rg;
          const nextKeys = rg.cells.map((k) => {
            const p = parseCoordKey(k);
            if (!p) return k;
            return `${nextRowId}:${p.colId}`;
          });
          return { ...rg, cells: nextKeys };
        });

        return { ...s, cards: nextCards, grid: { ...s.grid, cells: nextCells, regions: nextRegions } };
      });
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    // Stop trackpad/wheel scrolling from "pulling" the drag to the bottom.
    window.addEventListener('wheel', preventWheel, { passive: false });
    window.addEventListener('touchmove', preventTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('wheel', preventWheel);
      window.removeEventListener('touchmove', preventTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableDrag]);

  useTableDragDeleteKeys({
    tableDrag,
    clearTableDrag: () => {
      tableDragRef.current = null;
      setTableDrag(null);
    },
    deleteTableColumnAt,
    deleteTableRowAt,
  });

  return (
    <div className="absolute inset-0 overflow-hidden bg-white flex flex-col">
      <StickyBars
        activeTable={activeTable}
        cellSelectionCount={cellSelection.size}
        activeRegionId={activeRegionId}
        onSetHeaderRows={setActiveTableHeaderRows}
        onSetHeaderCols={setActiveTableHeaderCols}
        onSetFooterRows={setActiveTableFooterRows}
        pillsExpandAll={Boolean(activeTable?.pills?.expandAll)}
        onSetPillsExpandAll={setActiveTablePillsExpandAll}
        onAddRow={addRow}
        onAddColumn={addColumn}
        onAddCard={addCard}
        onMerge={mergePickedCells}
        canMerge={cellSelection.size >= 2}
        onCreateTable={createTableFromSelection}
        canCreateTable={Boolean(selectionRect)}
        onUnmergeRegion={unmergeActiveRegion}
        onOpenMarkdownHelp={() => setShowMarkdownHelp(true)}
        onOpenTableVisibility={(anchorEl) => {
          if (!activeTable) return;
          const rect = anchorEl.getBoundingClientRect();
          const defDiagramFileId =
            activeTable.dataObjectLink?.diagramFileId || linkedDiagramFileId || diagramFiles[0]?.id || '';
          setLinkDraft({
            tableId: activeTable.id,
            diagramFileId: defDiagramFileId,
            dataObjectId: activeTable.dataObjectLink?.dataObjectId || '',
          });
          if (defDiagramFileId && onLinkedDiagramFileIdChange) onLinkedDiagramFileIdChange(defDiagramFileId);
          openTableVisibilityPopover({
            tableId: activeTable.id,
            anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          });
        }}
      />

      <MarkdownHelpModal isOpen={showMarkdownHelp} onClose={() => setShowMarkdownHelp(false)} />
      {tableVisibilityPopover ? (
        <div
          data-table-visibility-popover="1"
          className="fixed z-[1000] mac-double-outline bg-white p-1 shadow-xl"
          style={{
            left: Math.min(window.innerWidth - 720, Math.max(8, tableVisibilityPopover.anchor.left)),
            top: Math.min(window.innerHeight - 420, Math.max(8, tableVisibilityPopover.anchor.top + tableVisibilityPopover.anchor.height + 6)),
            width: 700,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const t = tables.find((x) => x.id === tableVisibilityPopover.tableId) || null;
            if (!t) return null;
            const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
            const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
            const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
            const dataRowIds = t.rowIds.slice(hr, Math.max(hr, t.rowIds.length - fr));
            const dataColIds = t.colIds.slice(hc);
            const hiddenRows = new Set((t.hiddenRows || []).map((x) => String(x || '').trim()).filter(Boolean));
            const hiddenCols = new Set((t.hiddenCols || []).map((x) => String(x || '').trim()).filter(Boolean));

            const headerRowId = hr > 0 ? t.rowIds[hr - 1] : null;
            const getColLabel = (colId: string) => {
              const g = colIndexById.get(colId);
              const base = g === undefined ? colId : colLabel(g);
              const hv = headerRowId ? (cells?.[`${headerRowId}:${colId}`]?.value ?? '') : '';
              const head = String(hv || '').split('\n')[0]?.trim();
              return head ? `${base} — ${head}` : base;
            };

            return (
              <TableVisibilityPopover
                title={`Table ${t.id}`}
                kind={(t.kind || 'normal') as any}
                onChangeKind={(nextKind) => {
                  mutateSheet((s) => setTableKindModel(s, t.id, nextKind as any));
                }}
                keyCol={(() => {
                  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
                  const def = t.colIds[hc] || t.colIds[0] || '';
                  return t.keyColId || def;
                })()}
                keyColOptions={(() => {
                  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
                  const headerRowId = hr > 0 ? t.rowIds[hr - 1] : null;
                  const getColLabel = (colId: string) => {
                    const g = colIndexById.get(colId);
                    const base = g === undefined ? colId : colLabel(g);
                    const hv = headerRowId ? (cells?.[`${headerRowId}:${colId}`]?.value ?? '') : '';
                    const head = String(hv || '').split('\n')[0]?.trim();
                    return head ? `${base} — ${head}` : base;
                  };
                  return t.colIds.slice(hc).map((id) => ({ id, label: getColLabel(id) }));
                })()}
                onChangeKeyCol={(colId) => mutateSheet((s) => setTableKeyColIdModel(s, t.id, colId))}
                diagramFiles={diagramFiles.map((f) => ({ id: f.id, name: f.name, canEdit: f.canEdit }))}
                diagramFileId={linkDraft?.tableId === t.id ? linkDraft.diagramFileId : t.dataObjectLink?.diagramFileId || ''}
                onChangeDiagramFileId={(fileId) => {
                  setLinkDraft((prev) => (prev && prev.tableId === t.id ? { ...prev, diagramFileId: fileId, dataObjectId: '' } : prev));
                  if (onLinkedDiagramFileIdChange) onLinkedDiagramFileIdChange(fileId);
                }}
                diagramStatusLabel={linkedDiagramStatusLabel}
                dataObjectId={linkDraft?.tableId === t.id ? linkDraft.dataObjectId : t.dataObjectLink?.dataObjectId || ''}
                dataObjectOptions={(linkedDiagramFileId && linkedDataObjectStore && linkedDiagramFileId === (linkDraft?.diagramFileId || t.dataObjectLink?.diagramFileId || '') ? linkedDataObjectStore.objects : []).map(
                  (o) => ({ id: o.id, name: o.name }),
                )}
                onChangeDataObjectId={(dataObjectId) => {
                  setLinkDraft((prev) => (prev && prev.tableId === t.id ? { ...prev, dataObjectId } : prev));
                }}
                isLinked={Boolean(t.dataObjectLink)}
                canEditLinkedDiagramFile={canEditLinkedDiagramFile}
                onLink={() => {
                  const diagramFileId = (linkDraft?.tableId === t.id ? linkDraft.diagramFileId : t.dataObjectLink?.diagramFileId) || '';
                  const dataObjectId = (linkDraft?.tableId === t.id ? linkDraft.dataObjectId : t.dataObjectLink?.dataObjectId) || '';
                  if (!diagramFileId || !dataObjectId) return;
                  const roomName = diagramFiles.find((f) => f.id === diagramFileId)?.roomName || `file-${diagramFileId}`;
                  const store = linkedDiagramFileId === diagramFileId ? linkedDataObjectStore : null;
                  const obj = store?.objects.find((o) => o.id === dataObjectId) || null;
                  if (!obj) return;
                  mutateSheet((s) => {
                    return materializeLinkedDataObjectTable({
                      sheet: s,
                      tableId: t.id,
                      diagramFileId,
                      diagramRoomName: roomName,
                      dataObject: obj,
                      previousLink: t.dataObjectLink,
                    }).sheet;
                  });
                  closeTableVisibilityPopover();
                }}
                onUnlink={() => {
                  mutateSheet((s) => {
                    const nextTables = (s.grid.tables || []).map((tb) => (tb.id === t.id ? { ...tb, dataObjectLink: undefined } : tb));
                    return { ...s, grid: { ...s.grid, tables: nextTables } };
                  });
                }}
                onResync={() => {
                  const link = t.dataObjectLink;
                  if (!link) return;
                  const store = linkedDiagramFileId === link.diagramFileId ? linkedDataObjectStore : null;
                  const obj = store?.objects.find((o) => o.id === link.dataObjectId) || null;
                  if (!obj) return;
                  mutateSheet((s) => {
                    return materializeLinkedDataObjectTable({
                      sheet: s,
                      tableId: t.id,
                      diagramFileId: link.diagramFileId,
                      diagramRoomName: link.diagramRoomName || `file-${link.diagramFileId}`,
                      dataObject: obj,
                      previousLink: link,
                    }).sheet;
                  });
                }}
                cols={dataColIds.map((id) => ({ id, label: getColLabel(id), hidden: hiddenCols.has(id) }))}
                rows={dataRowIds.map((id) => {
                  const g = rowIndexById.get(id);
                  const label = g === undefined ? id : `Row ${g + 1}`;
                  return { id, label, hidden: hiddenRows.has(id) };
                })}
                onToggleCol={(colId) => {
                  const next = new Set(hiddenCols);
                  if (next.has(colId)) next.delete(colId);
                  else next.add(colId);
                  mutateSheet((s) => setTableHiddenColsModel(s, t.id, Array.from(next)));
                }}
                onToggleRow={(rowId) => {
                  const next = new Set(hiddenRows);
                  if (next.has(rowId)) next.delete(rowId);
                  else next.add(rowId);
                  mutateSheet((s) => setTableHiddenRowsModel(s, t.id, Array.from(next)));
                }}
                onShowAllCols={() => mutateSheet((s) => setTableHiddenColsModel(s, t.id, []))}
                onHideAllCols={() => mutateSheet((s) => setTableHiddenColsModel(s, t.id, dataColIds))}
                onShowAllRows={() => mutateSheet((s) => setTableHiddenRowsModel(s, t.id, []))}
                onHideAllRows={() => mutateSheet((s) => setTableHiddenRowsModel(s, t.id, dataRowIds))}
                onClose={closeTableVisibilityPopover}
              />
            );
          })()}
        </div>
      ) : null}

      {/* Sheet scroll container (horizontal + vertical). */}
      <div ref={containerRef} tabIndex={0} className="flex-1 overflow-auto outline-none bg-white">
        <div className="relative inline-block min-w-max">
          <div
            ref={sheetAreaRef}
            className="relative"
            onMouseLeave={() => {
              setTableControlsHover(null);
            }}
          >
            <table className="border-collapse text-[11px]" {...dragRect.tableProps}>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-white border border-slate-200 w-[44px] min-w-[44px] max-w-[44px]" />
                  {cols.map((c, cIdx) => (
                    <th
                      key={c.id}
                      className="sticky top-0 z-10 bg-white border border-slate-200 font-semibold text-center"
                      style={{ width: c.width ?? 88, minWidth: c.width ?? 88, maxWidth: c.width ?? 240, height: 22, padding: 0 }}
                    >
                      {colLabel(cIdx)}
                    </th>
                  ))}
                </tr>
              </thead>
          <tbody>
            {rows.map((r, rIdx) => (
              <tr key={r.id} style={{ height: Math.max(36, r.height ?? 22) }}>
                <th className="sticky left-0 z-10 bg-white border border-slate-200 text-center font-semibold w-[44px] min-w-[44px] max-w-[44px] p-0">
                  {rIdx + 1}
                </th>
                {cols.map((c, cIdx) => {
                const key = `${r.id}:${c.id}`;
                const rowId = r.id;
                const colId = c.id;
                const cellTable = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) || null;
                const tableFilterView = cellTable ? tableFilterViewById.get(cellTable.id) || null : null;
                const tableHiddenColView = cellTable ? tableHiddenColViewById.get(cellTable.id) || null : null;
                const tr = cellTable ? cellTable.rowIds.indexOf(rowId) : -1;
                const tc = cellTable ? cellTable.colIds.indexOf(colId) : -1;
                const hr = cellTable ? Math.max(0, Math.min(cellTable.rowIds.length, cellTable.headerRows || 0)) : 0;
                const hc = cellTable ? Math.max(0, Math.min(cellTable.colIds.length, cellTable.headerCols || 0)) : 0;
                const fr = cellTable
                  ? Math.max(0, Math.min(Math.max(0, cellTable.rowIds.length - hr), cellTable.footerRows || 0))
                  : 0;
                // Show filter UI on the last header row, even when no filters exist yet.
                const isFilterHeaderCell = cellTable ? hr > 0 && tr === hr - 1 && tc >= hc : false;

                const mappedRowId =
                  tableFilterView && cellTable && tr >= hr && tr < cellTable.rowIds.length - fr
                    ? (tableFilterView.destToSourceRowId[rowId] ?? null)
                    : rowId;
                const mappedColId =
                  tableHiddenColView && cellTable && tc >= hc ? (tableHiddenColView.destToSourceColId[colId] ?? null) : colId;
                const isMappedEmpty = mappedRowId === null || mappedColId === null;
                const valueKey = mappedRowId && mappedColId ? `${mappedRowId}:${mappedColId}` : '';
                const regId = mappedRowId && mappedColId ? regionIdByCoord.get(valueKey) : undefined;
                const disp = !isMappedEmpty
                  ? { value: cells[valueKey]?.value ?? '', isRegion: Boolean(regId), ...(regId ? { regionId: regId } : {}) }
                  : { value: '', isRegion: false as const };
                const selectionKey = mappedRowId && mappedColId ? `${mappedRowId}:${mappedColId}` : `${rowId}:${colId}`;
                const isSelected = cellSelection.has(selectionKey);
                const hasComment = Boolean(
                  commentTargetKeys &&
                    mappedRowId &&
                    mappedColId &&
                    commentTargetKeys.has(buildGridCellCommentTargetKey(sheet.id, mappedRowId, mappedColId)),
                );
                // Selection indicator is monochrome only (no colored fill).
                const selBg = '';
                const isActive = selected.r === rIdx && selected.c === cIdx;
                const isEditing = Boolean(editing && editing.r === rIdx && editing.c === cIdx);
                const isActiveRegion = Boolean(disp.regionId && activeRegionId && disp.regionId === activeRegionId);
                const activeFilterQ = cellTable && mappedColId ? cellTable.filters?.[mappedColId]?.q || '' : '';

                // Region border styling: hide internal borders, thicken outer border.
                const regionBorderStyle = (() => {
                  if (!disp.isRegion || !disp.regionId) return null;
                  const reg = regionById.get(disp.regionId);
                  if (!reg) return null;
                  const set = new Set(reg.cells);
                  const up = rIdx > 0 ? `${rows[rIdx - 1].id}:${c.id}` : '';
                  const down = rIdx < rows.length - 1 ? `${rows[rIdx + 1].id}:${c.id}` : '';
                  const left = cIdx > 0 ? `${r.id}:${cols[cIdx - 1].id}` : '';
                  const right = cIdx < cols.length - 1 ? `${r.id}:${cols[cIdx + 1].id}` : '';
                  const outerW = isActiveRegion ? 3 : 2;
                  const topW = up && set.has(up) ? 0 : outerW;
                  const bottomW = down && set.has(down) ? 0 : outerW;
                  const leftW = left && set.has(left) ? 0 : outerW;
                  const rightW = right && set.has(right) ? 0 : outerW;
                  const color = isActiveRegion ? '#0f172a' : '#475569'; // slate-900 / slate-600
                  return {
                    borderTopWidth: topW,
                    borderBottomWidth: bottomW,
                    borderLeftWidth: leftW,
                    borderRightWidth: rightW,
                    borderTopColor: color,
                    borderBottomColor: color,
                    borderLeftColor: color,
                    borderRightColor: color,
                  } as React.CSSProperties;
                })();

                // Table boundary styling (all tables visible; active table thicker).
                const tableBorderStyle = (() => {
                  if (!tables.length) return null;
                  const rowId = rows[rIdx]?.id;
                  const colId = cols[cIdx]?.id;
                  if (!rowId || !colId) return null;

                  const t = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId));
                  if (!t) return null;
                  const tr = t.rowIds.indexOf(rowId);
                  const tc = t.colIds.indexOf(colId);
                  if (tr < 0 || tc < 0) return null;
                  const isActiveTable = activeTableId === t.id;
                  const outerW = isActiveTable ? 4 : 2;
                  const topW = tr === 0 ? outerW : 0;
                  const bottomW = tr === t.rowIds.length - 1 ? outerW : 0;
                  const leftW = tc === 0 ? outerW : 0;
                  const rightW = tc === t.colIds.length - 1 ? outerW : 0;
                  const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
                  const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
                  const headerDividerW = hr > 0 && tr === hr - 1 ? outerW : 0;
                  const footerDividerW = fr > 0 && tr === t.rowIds.length - fr - 1 ? outerW : 0;
                  const color = isActiveTable ? '#0f172a' : '#334155';
                  return {
                    ...(topW ? { borderTopWidth: topW, borderTopColor: color } : {}),
                    ...(bottomW ? { borderBottomWidth: bottomW, borderBottomColor: color } : {}),
                    ...(leftW ? { borderLeftWidth: leftW, borderLeftColor: color } : {}),
                    ...(rightW ? { borderRightWidth: rightW, borderRightColor: color } : {}),
                    ...(headerDividerW ? { borderBottomWidth: headerDividerW, borderBottomColor: color } : {}),
                    ...(footerDividerW ? { borderBottomWidth: footerDividerW, borderBottomColor: color } : {}),
                  } as React.CSSProperties;
                })();

                const headerStyle = (() => {
                  if (!tables.length) return null;
                  const rowId = rows[rIdx]?.id;
                  const colId = cols[cIdx]?.id;
                  if (!rowId || !colId) return null;
                  const t = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId));
                  if (!t) return null;
                  const tr = t.rowIds.indexOf(rowId);
                  const tc = t.colIds.indexOf(colId);
                  if (tr < 0 || tc < 0) return null;
                  const hr = Math.max(0, Math.min(t.rowIds.length, t.headerRows || 0));
                  const hc = Math.max(0, Math.min(t.colIds.length, t.headerCols || 0));
                  const inHeaderRow = hr > 0 && tr < hr;
                  const inHeaderCol = hc > 0 && tc < hc;
                  const fr = Math.max(0, Math.min(Math.max(0, t.rowIds.length - hr), t.footerRows || 0));
                  const inFooterRow = fr > 0 && tr >= t.rowIds.length - fr;
                  if (!inHeaderRow && !inHeaderCol && !inFooterRow) return null;

                  const shade = (pos: number, total: number) => {
                    if (total <= 1) return 65;
                    const f = pos / (total - 1);
                    const start = 65;
                    const end = 140;
                    return Math.round(start + (end - start) * f);
                  };
                  const vRow = inHeaderRow ? shade(tr, hr) : 999;
                  const vCol = inHeaderCol ? shade(tc, hc) : 999;
                  const vFooter = inFooterRow ? 95 : 999;
                  const v = Math.min(vRow, vCol, vFooter);
                  return {
                    backgroundColor: `rgb(${v}, ${v}, ${v})`,
                    color: '#fff',
                    fontWeight: 700,
                  } as React.CSSProperties;
                })();

                const cellBg = getCellSemanticBackground(disp.value);

                const tableStickyStyle = (() => {
                  if (!tables.length) return null;
                  const rowId = rows[rIdx]?.id;
                  const colId = cols[cIdx]?.id;
                  if (!rowId || !colId) return null;
                  const t = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId));
                  if (!t) return null;
                  if (!activeTableSticky || activeTableSticky.tableId !== t.id) return null;
                  const top = activeTableSticky.topByRowId.get(rowId);
                  const left = activeTableSticky.leftByColId.get(colId);
                  if (top === undefined && left === undefined) return null;
                  const isCorner = top !== undefined && left !== undefined;
                  const headerBg =
                    headerStyle && typeof headerStyle === 'object' && 'backgroundColor' in headerStyle
                      ? (headerStyle.backgroundColor as string | undefined)
                      : undefined;
                  const style: React.CSSProperties = {
                    position: 'sticky',
                    ...(top !== undefined ? { top } : {}),
                    ...(left !== undefined ? { left } : {}),
                    zIndex: isCorner ? 28 : top !== undefined ? 26 : 25,
                    // Ensure sticky cells paint over scrolled content.
                    ...stickyInnerCellStyle({
                      isSelected,
                      isActive,
                      baseBg: cellBg?.bg ?? headerBg,
                      baseColor: cellBg?.fg,
                    }),
                  };
                  return style;
                })();

                return (
                  <td
                    key={key}
                    data-r={rIdx}
                    data-c={cIdx}
                    className={`border border-slate-200 align-top ${selBg} ${isMappedEmpty ? 'bg-slate-50' : ''}`}
                    style={{
                      position: 'relative',
                      width: c.width ?? 88,
                      minWidth: c.width ?? 88,
                      maxWidth: c.width ?? 240,
                      height: Math.max(36, r.height ?? 22),
                      overflow: 'hidden',
                      padding: 0,
                      ...(regionBorderStyle || {}),
                      ...(tableBorderStyle || {}),
                      ...(headerStyle || {}),
                      ...(cellBg ? { backgroundColor: cellBg.bg, color: cellBg.fg } : {}),
                      ...selectedCellStyle({ isSelected, isActive }),
                    }}
                    onMouseDown={(e) => {
                      // Click-away should commit the currently edited cell (preventDefault blocks blur).
                      if (editing && (editing.r !== rIdx || editing.c !== cIdx)) {
                        const v = editTextareaRef.current?.value ?? editDraft;
                        commitEdit(editing.r, editing.c, v);
                        setEditing(null);
                      }
                      const target = e.target as HTMLElement | null;
                      const isInteractive =
                        !!target &&
                        !!target.closest('button,input,a,select,textarea,[data-nx-interactive="1"]');
                      // Let widgets inside cells be clickable (don’t swallow events for selection logic).
                      if (isInteractive) return;
                      e.preventDefault();
                      setSelectedCardId(null);
                      setEditingCardId(null);
                      const coordKey = getCoordKey(rIdx, cIdx);
                      if (isMappedEmpty) return;
                      const coordKeyMapped = selectionKey;
                      const isCmd = e.metaKey || e.ctrlKey;
                      const next = { r: rIdx, c: cIdx };

                      // File-browser semantics:
                      // - Click: select only this cell (clears others, sets anchor)
                      // - Shift+click: select rectangular range from anchor (replaces selection)
                      // - Cmd/Ctrl+click: toggle single cell (without clearing)
                      // - Cmd/Ctrl+Shift+click: add the rectangular range to the current selection
                      if (!e.shiftKey && !isCmd) {
                        setSelected(next);
                        setSelectionStart(next);
                        setCellSelection(new Set([coordKeyMapped]));
                        dragRect.startDrag(next);
                      } else if (e.shiftKey && !isCmd) {
                        const start = selectionStart ?? selected;
                        if (!selectionStart) setSelectionStart(selected);
                        setSelected(next);
                        const r0 = Math.min(start.r, next.r);
                        const r1 = Math.max(start.r, next.r);
                        const c0 = Math.min(start.c, next.c);
                        const c1 = Math.max(start.c, next.c);
                        setCellSelection(dragRect.buildRectSelection({ r: r0, c: c0 }, { r: r1, c: c1 }));
                      } else if (isCmd && !e.shiftKey) {
                        setSelected(next);
                        if (!selectionStart) setSelectionStart(selected);
                        setCellSelection((prev) => {
                          const ns = new Set(prev);
                          if (ns.has(coordKeyMapped)) ns.delete(coordKeyMapped);
                          else ns.add(coordKeyMapped);
                          // Keep at least one selected cell (the focused one).
                          if (ns.size === 0) ns.add(coordKeyMapped);
                          return ns;
                        });
                      } else {
                        // Cmd/Ctrl + Shift
                        const start = selectionStart ?? selected;
                        if (!selectionStart) setSelectionStart(selected);
                        setSelected(next);
                        const r0 = Math.min(start.r, next.r);
                        const r1 = Math.max(start.r, next.r);
                        const c0 = Math.min(start.c, next.c);
                        const c1 = Math.max(start.c, next.c);
                        setCellSelection((prev) => {
                          const ns = new Set(prev);
                          for (const k of dragRect.buildRectSelection({ r: r0, c: c0 }, { r: r1, c: c1 })) ns.add(k);
                          return ns;
                        });
                      }

                      if (disp.isRegion && disp.regionId) {
                        setActiveRegionId(disp.regionId);
                      } else {
                        setActiveRegionId(null);
                      }
                      // Table visibility should never "clear"; only update active table when clicking inside one.
                      const rowId = rows[rIdx]?.id;
                      const colId = cols[cIdx]?.id;
                      if (rowId && colId) {
                        const hit = tables.find((t) => t.rowIds.includes(rowId) && t.colIds.includes(colId));
                        if (hit) setActiveTableId(hit.id);
                      }

                      // Keep keyboard shortcuts working after mouse selection.
                      containerRef.current?.focus({ preventScroll: true });

                      if (activeTool === 'comment' && onOpenComments) {
                        const parsed = parseCoordKey(coordKeyMapped);
                        if (!parsed) return;
                        const addr = `${colLabel(cIdx)}${rIdx + 1}`;
                        onOpenComments({
                          targetKey: buildGridCellCommentTargetKey(sheet.id, parsed.rowId, parsed.colId),
                          targetLabel: `${sheet.name} · ${addr}`,
                        });
                      }
                    }}
                    onMouseEnter={() => {
                      const rowId = rows[rIdx]?.id;
                      const colId = cols[cIdx]?.id;
                      if (!rowId || !colId) {
                        setTableControlsHover(null);
                        return;
                      }
                      const t = tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId));
                      if (!t) {
                        setTableControlsHover(null);
                        return;
                      }
                      const showCols = rowId === t.rowIds[0];
                      const showRows = colId === t.colIds[0];
                      if (!showCols && !showRows) {
                        setTableControlsHover(null);
                        return;
                      }
                      setTableControlsHover({ tableId: t.id, showCols, showRows });
                    }}
                    onDoubleClick={() => {
                      if (isMappedEmpty) return;
                      setSelectedCardId(null);
                      setEditingCardId(null);
                      const { value, isRegion } = disp;
                      if (isRegion && disp.regionId) setActiveRegionId(disp.regionId);
                      setEditing({ r: rIdx, c: cIdx });
                      setEditDraft(value);
                    }}
                  >
                    <div
                      className={`w-full h-full relative overflow-hidden ${isMappedEmpty ? 'opacity-60' : ''}`}
                      style={tableStickyStyle || undefined}
                    >
                      {hasComment ? <CommentEar size={10} /> : null}
                      {isEditing ? (
                        <textarea
                          // Always use black text while editing for readability, even for header-shaded cells.
                          // Read-only view keeps the table header/footer styling (white text on dark background).
                          className="w-full h-full resize-none outline-none px-1 py-0.5 text-[11px] bg-white text-black"
                          value={editDraft}
                          autoFocus
                          ref={editTextareaRef}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditDraft(v);
                            // Autosave while typing (no Enter required).
                            commitEdit(rIdx, cIdx, v);

                            // Typing `@@` should immediately open the date picker.
                            if (!macroPopover) {
                              const caret = (e.currentTarget as HTMLTextAreaElement).selectionStart ?? v.length;
                              const macros = listRecognizedMacros(v);
                              const hit = macros.find((m) => m.inner.startsWith('date:') && caret >= m.start && caret <= m.end) || null;
                              if (hit) {
                                const rect = (e.currentTarget as HTMLTextAreaElement).getBoundingClientRect();
                                const rowId = rows[rIdx]?.id;
                                const colId = cols[cIdx]?.id;
                                const cellTable =
                                  rowId && colId ? (tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) || null) : null;
                                setMacroPopover({
                                  kind: 'date',
                                  occ: hit.occ,
                                  rIdx,
                                  cIdx,
                                  body: hit.inner.slice('date:'.length),
                                  anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                                  tableId: cellTable?.id || null,
                                });
                              }
                            }
                          }}
                          onBlur={(e) => {
                            setEditing(null);
                            // Ensure click-away commits the final value.
                            commitEdit(rIdx, cIdx, (e.currentTarget as HTMLTextAreaElement).value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditing(null);
                              return;
                            }
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault();
                              // If we're at the last table column, Tab should create a new column within the table.
                              const rowId = rows[rIdx]?.id;
                              const colId = cols[cIdx]?.id;
                              const t = rowId && colId ? tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) : null;
                              if (t && colId === t.colIds[t.colIds.length - 1]) {
                                insertTableColumnAfter(colId);
                                const nextC = Math.min(cols.length, cIdx + 1);
                                const nextColId = cols[nextC]?.id || '';
                                setSelected({ r: rIdx, c: nextC });
                                setSelectionStart({ r: rIdx, c: nextC });
                                if (rowId && nextColId) setCellSelection(new Set([`${rowId}:${nextColId}`]));
                                setEditing({ r: rIdx, c: nextC });
                                setEditDraft('');
                                return;
                              }
                              // Otherwise, just move right.
                              setEditing(null);
                              setSelected({ r: rIdx, c: cIdx + 1 });
                              setSelectionStart({ r: rIdx, c: cIdx + 1 });
                              setCellSelection(new Set([getCoordKey(rIdx, Math.min(cols.length - 1, cIdx + 1))]));
                              return;
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              // If we're at the last table row, Enter should create a new row within the table.
                              const rowId = rows[rIdx]?.id;
                              const colId = cols[cIdx]?.id;
                              const t = rowId && colId ? tables.find((tb) => tb.rowIds.includes(rowId) && tb.colIds.includes(colId)) : null;
                              if (t && rowId === t.rowIds[t.rowIds.length - 1]) {
                                insertTableRowAfter(rowId);
                                const nextR = Math.min(rows.length, rIdx + 1);
                                const nextRowId = rows[nextR]?.id || '';
                                setEditing(null);
                                setSelected({ r: nextR, c: cIdx });
                                setSelectionStart({ r: nextR, c: cIdx });
                                if (nextRowId && colId) setCellSelection(new Set([`${nextRowId}:${colId}`]));
                                setEditing({ r: nextR, c: cIdx });
                                setEditDraft('');
                                return;
                              }
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 px-1 py-0.5 break-words select-none overflow-hidden">
                          {(() => {
                            const pillsExpandAll = Boolean(cellTable?.pills?.expandAll);
                            const shownValue = disp.value;
                            const content = shownValue ? (
                              <CellMarkdown
                                value={shownValue}
                                pillsExpandAll={pillsExpandAll}
                                peopleDirectory={peopleDirectory}
                                onReplaceMacro={(occ, nextRaw) => {
                                  const next = replaceMacroOccurrence(shownValue || '', occ, nextRaw);
                                  commitEdit(rIdx, cIdx, next);
                                }}
                                onTransformText={(transform) => {
                                  const current = getDisplayValue(rIdx, cIdx).value || '';
                                  const next = transform(current);
                                  commitEdit(rIdx, cIdx, next);
                                }}
                                onOpenPopover={(kind, occ, body, anchorEl) => {
                                  const rect = anchorEl.getBoundingClientRect();
                                  setMacroPopover({
                                    kind,
                                    occ,
                                    rIdx,
                                    cIdx,
                                    body,
                                    anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                                    tableId: cellTable?.id || null,
                                  });
                                }}
                              />
                            ) : (
                              isMappedEmpty ? <span className="text-[10px] opacity-40">—</span> : '\u00A0'
                            );
                            if (isFilterHeaderCell && mappedColId) {
                              return (
                                <div className="flex items-center justify-between gap-1">
                                  <div className="min-w-0 flex-1">{content}</div>
                                  <button
                                    type="button"
                                    data-nx-interactive="1"
                                    className={`mac-btn h-5 w-5 px-0 text-[10px] ${activeFilterQ ? 'mac-btn--primary' : ''}`}
                                    title={activeFilterQ ? `Filter: ${activeFilterQ}` : 'Add filter'}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!cellTable || !mappedColId) return;
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setTableFilterPopover({
                                        tableId: cellTable.id,
                                        colId: mappedColId,
                                        anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                                      });
                                    }}
                                  >
                                    ⌄
                                  </button>
                                </div>
                              );
                            }
                            return content;
                          })()}
                        </div>
                      )}
                    </div>
                  </td>
                );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Table edge controls (hover near first row/col only, but stay visible during drag) */}
        {controlsTable && controlsTableInfo && (tableDrag || tableControlsHover) ? (
          <div className="absolute inset-0 pointer-events-none">
            {(() => {
              const t = controlsTable;
              const info = controlsTableInfo;
              const colLeft = (colIdx: number) => 44 + cols.slice(0, colIdx).reduce((sum, cc) => sum + (cc.width ?? 88), 0);
              const rowTop = (rowIdx: number) =>
                22 + rows.slice(0, rowIdx).reduce((sum, rr) => sum + Math.max(36, rr.height ?? 22), 0);
              const colWidth = (colIdx: number) => cols[colIdx]?.width ?? 88;
              const rowHeight = (rowIdx: number) => Math.max(36, rows[rowIdx]?.height ?? 22);

              const tableTop = rowTop(info.r0);
              const tableLeft = colLeft(info.c0);

              return (
                <>
                  {/* Column controls */}
                  {(tableDrag?.tableId === t.id || tableControlsHover?.showCols)
                    ? t.colIds.map((colId) => {
                    const gIdx = colIndexById.get(colId);
                    if (gIdx === undefined) return null;
                    const x = colLeft(gIdx);
                    const w = colWidth(gIdx);
                    const disabled = !canOperateOnColumn(colId);
                    return (
                      <div
                        key={`colctl-${colId}`}
                        className="absolute pointer-events-auto"
                        style={{ left: x, top: Math.max(0, tableTop - 18), width: w, height: 18, zIndex: 120 }}
                        onMouseEnter={() => setTableControlsHover({ tableId: t.id, showCols: true, showRows: false })}
                      >
                        <div className="h-full flex items-center justify-between gap-1 px-0.5">
                          <button
                            type="button"
                            className={`mac-btn h-4 w-4 px-0 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
                            title={disabled ? 'Blocked by spanning card/merge' : 'Drag to reorder within table'}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (disabled) return;
                              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                              const host = containerRef.current;
                              setTableDrag({
                                kind: 'col',
                                tableId: t.id,
                                draggedId: colId,
                                overIndex: t.colIds.indexOf(colId),
                                startScrollLeft: host?.scrollLeft ?? 0,
                                startScrollTop: host?.scrollTop ?? 0,
                              });
                            }}
                          >
                            <GripVertical size={10} />
                          </button>
                          <button
                            type="button"
                            className={`mac-btn h-4 w-4 px-0 text-[10px] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
                            title={disabled ? 'Blocked by spanning card/merge' : 'Insert column after'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              insertTableColumnAfter(colId);
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
                    : null}

                  {/* Row controls */}
                  {(tableDrag?.tableId === t.id || tableControlsHover?.showRows)
                    ? t.rowIds.map((rowId) => {
                    const gIdx = rowIndexById.get(rowId);
                    if (gIdx === undefined) return null;
                    const y = rowTop(gIdx);
                    const h = rowHeight(gIdx);
                    const disabled = !canOperateOnRow(rowId);
                    return (
                      <div
                        key={`rowctl-${rowId}`}
                        className="absolute pointer-events-auto"
                        style={{ left: tableLeft + 2, top: y, width: 30, height: h, zIndex: 120 }}
                        onMouseEnter={() => setTableControlsHover({ tableId: t.id, showCols: false, showRows: true })}
                      >
                        <div className="relative h-full w-full">
                          <button
                            type="button"
                            className={`mac-btn h-4 w-4 px-0 absolute left-0 top-0 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
                            title={disabled ? 'Blocked by spanning card/merge' : 'Drag to reorder within table'}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (disabled) return;
                              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                              const host = containerRef.current;
                              setTableDrag({
                                kind: 'row',
                                tableId: t.id,
                                draggedId: rowId,
                                overIndex: t.rowIds.indexOf(rowId),
                                startScrollLeft: host?.scrollLeft ?? 0,
                                startScrollTop: host?.scrollTop ?? 0,
                              });
                            }}
                          >
                            <GripVertical size={10} />
                          </button>
                          <button
                            type="button"
                            className={`mac-btn h-4 w-4 px-0 text-[10px] absolute left-0 bottom-0 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
                            title={disabled ? 'Blocked by spanning card/merge' : 'Insert row after'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              insertTableRowAfter(rowId);
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
                    : null}

                  {/* Ghost drop indicator */}
                  {tableDrag && tableDrag.tableId === t.id ? (
                    tableDrag.kind === 'col' ? (
                      (() => {
                        const overId = t.colIds[Math.max(0, Math.min(t.colIds.length - 1, tableDrag.overIndex))];
                        const gIdx = colIndexById.get(overId);
                        if (gIdx === undefined) return null;
                        const x0 = colLeft(gIdx);
                        const tableBottom =
                          rowTop(info.r1) + Math.max(36, rows[info.r1]?.height ?? 22);
                        return (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: x0 - 1,
                              top: Math.max(0, tableTop - 20),
                              width: 16,
                              height: tableBottom - tableTop + 24,
                              background: '#0f172a',
                              opacity: 0.65,
                              boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
                              borderRadius: 6,
                            }}
                          />
                        );
                      })()
                    ) : (
                      (() => {
                        const overId = t.rowIds[Math.max(0, Math.min(t.rowIds.length - 1, tableDrag.overIndex))];
                        const gIdx = rowIndexById.get(overId);
                        if (gIdx === undefined) return null;
                        const y0 = rowTop(gIdx);
                        const tableRight =
                          colLeft(info.c1) + (cols[info.c1]?.width ?? 88);
                        return (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: Math.max(0, tableLeft - 40),
                              top: y0 - 1,
                              width: tableRight - tableLeft + 44,
                              height: 16,
                              background: '#0f172a',
                              opacity: 0.65,
                              boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
                              borderRadius: 6,
                            }}
                          />
                        );
                      })()
                    )
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}

        {/* Card-cells overlay (snaps to cells; rectangular only) */}
        <div className="absolute inset-0 pointer-events-none">
          {cards.map((card) => {
            const r0 = rowIndexOf(card.rowId);
            const c0 = colIndexOf(card.colId);
            const left = 44 + cols.slice(0, c0).reduce((sum, cc) => sum + (cc.width ?? 88), 0);
            const top = 22 + rows.slice(0, r0).reduce((sum, rr) => sum + Math.max(36, rr.height ?? 22), 0);
            const width = cols.slice(c0, c0 + card.colspan).reduce((sum, cc) => sum + (cc.width ?? 88), 0);
            const height = rows.slice(r0, r0 + card.rowspan).reduce((sum, rr) => sum + Math.max(36, rr.height ?? 22), 0);
            const selected = selectedCardId === card.id;
            const editing = editingCardId === card.id;
            const hasComment = Boolean(commentTargetKeys && commentTargetKeys.has(buildGridCardCommentTargetKey(sheet.id, card.id)));
            return (
              <div
                key={card.id}
                className={`absolute pointer-events-auto mac-window mac-double-outline bg-white ${selected ? 'mac-shadow-hard' : ''}`}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width,
                  height,
                  zIndex: selected ? 50 : 10,
                  outline: selected ? '3px solid #000' : 'none',
                  outlineOffset: '1px',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  // If this card is being edited (or the target is an interactive control),
                  // don't steal focus or start dragging.
                  if (editing) return;
                  const target = e.target as HTMLElement | null;
                  const isInteractive =
                    !!target && !!target.closest('textarea,input,button,a,select,[data-nx-interactive="1"]');
                  if (isInteractive) return;
                  setSelectedCardId(card.id);
                  setEditingCardId(null);
                  if (activeTool === 'comment' && onOpenComments) {
                    const addr = `${colLabel(c0)}${r0 + 1}`;
                    onOpenComments({
                      targetKey: buildGridCardCommentTargetKey(sheet.id, card.id),
                      targetLabel: `${sheet.name} · Card @ ${addr}`,
                    });
                    containerRef.current?.focus({ preventScroll: true });
                    return;
                  }
                  dragRef.current = { id: card.id, startX: e.clientX, startY: e.clientY, originR: r0, originC: c0 };
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  containerRef.current?.focus({ preventScroll: true });
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedCardId(card.id);
                  setEditingCardId(card.id);
                  setCardDraft(card.content || '');
                }}
              >
                {hasComment ? <CommentEar size={12} /> : null}
                <div className="p-2 text-[11px] leading-snug h-full">
                  {editing ? (
                    <textarea
                      className="w-full h-full resize-none outline-none bg-white text-black"
                      value={cardDraft}
                      autoFocus
                      onChange={(e) => setCardDraft(e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        // Enter/Esc exits edit mode to selected state.
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingCardId(null);
                          return;
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          const nextCards = cards.map((c) => (c.id === card.id ? { ...c, content: cardDraft } : c));
                          mutateSheet((s) => ({ ...s, cards: nextCards }));
                          setEditingCardId(null);
                        } else {
                          e.stopPropagation();
                        }
                      }}
                      onBlur={() => {
                        const nextCards = cards.map((c) => (c.id === card.id ? { ...c, content: cardDraft } : c));
                        mutateSheet((s) => ({ ...s, cards: nextCards }));
                        setEditingCardId(null);
                      }}
                    />
                  ) : (
                    <div className="w-full h-full whitespace-pre-wrap break-words select-none">
                      {card.content ? (
                        <CellMarkdown
                          value={card.content}
                          pillsExpandAll={false}
                          peopleDirectory={peopleDirectory}
                          onReplaceMacro={(occ, nextRaw) => {
                            const next = replaceMacroOccurrence(card.content || '', occ, nextRaw);
                            updateCardContent(card.id, next);
                          }}
                          onTransformText={(transform) => {
                            const next = transform(card.content || '');
                            updateCardContent(card.id, next);
                          }}
                          onOpenPopover={(kind, occ, body, anchorEl) => {
                            const rect = anchorEl.getBoundingClientRect();
                            setCardMacroPopover({
                              kind,
                              occ,
                              cardId: card.id,
                              body,
                              anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                            });
                          }}
                        />
                      ) : (
                        '\u00A0'
                      )}
                    </div>
                  )}
                </div>
                <div
                  className="absolute right-0 bottom-0 w-2.5 h-2.5 bg-slate-300 cursor-nwse-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedCardId(card.id);
                    setEditingCardId(null);
                    resizeRef.current = { id: card.id, startX: e.clientX, startY: e.clientY, originRowspan: card.rowspan, originColspan: card.colspan };
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    containerRef.current?.focus({ preventScroll: true });
                  }}
                />
              </div>
            );
          })}
        </div>

        {macroPopover ? (
          <div
            data-macro-popover="1"
            className="fixed z-[1000] mac-double-outline bg-white p-2 shadow-xl"
            style={{
              left: Math.min(window.innerWidth - 340, Math.max(8, macroPopover.anchor.left)),
              top: Math.min(window.innerHeight - 260, Math.max(8, macroPopover.anchor.top + macroPopover.anchor.height + 6)),
              width: 320,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {macroPopover.kind === 'pills' ? (
              <PillsPopover
                body={macroPopover.body}
                options={
                  macroPopover.tableId
                    ? (sheetRef.current.grid.tables.find((x) => x.id === macroPopover.tableId)?.pills?.options ?? [])
                    : []
                }
                onClose={() => setMacroPopover(null)}
                onApply={(nextTags, keepKv) => {
                  const head = nextTags.join(',');
                  // Prefer compact surface syntax.
                  const nextRaw = `<<${head}>>`;
                  const current = getDisplayValue(macroPopover.rIdx, macroPopover.cIdx).value;
                  const next = replaceMacroOccurrence(current || '', macroPopover.occ, nextRaw);
                  commitEdit(macroPopover.rIdx, macroPopover.cIdx, next);

                  if (macroPopover.tableId) {
                    mutateSheet((s) => upsertTablePillsOptions(s, macroPopover.tableId!, nextTags));
                  }

                  setMacroPopover(null);
                }}
              />
            ) : macroPopover.kind === 'people' ? (
              <PeoplePopover
                body={macroPopover.body}
                peopleDirectory={peopleDirectory}
                onClose={() => setMacroPopover(null)}
                onApplyTokens={(tokens) => {
                  const toks = tokens.map((t) => t.trim()).filter(Boolean);
                  const ids: string[] = [];
                  const toCreate: string[] = [];
                  toks.forEach((t) => {
                    if (t.startsWith('@')) ids.push(t.slice(1));
                    else toCreate.push(t);
                  });

                  let createdIds: string[] = [];
                  let createdPeople: GridPersonV1[] = [];
                  if (toCreate.length) {
                    mutateDoc((d) => {
                      const pd = (d.peopleDirectory || []).slice();
                      const byName = new Map(pd.map((p) => [p.name.trim().toLowerCase(), p]));
                      let max = Math.max(0, ...pd.map((p) => Number(String(p.id).match(/-(\\d+)$/)?.[1] || 0)));
                      toCreate.forEach((name) => {
                        const key = name.trim().toLowerCase();
                        const existing = byName.get(key) || null;
                        if (existing) {
                          createdIds.push(existing.id);
                          return;
                        }
                        max += 1;
                        const id = `p-${max}`;
                        const rec: GridPersonV1 = { id, name: name.trim() };
                        pd.push(rec);
                        byName.set(key, rec);
                        createdIds.push(id);
                        createdPeople.push(rec);
                      });
                      return { ...d, peopleDirectory: pd };
                    });
                  }

                  const final = Array.from(new Set([...ids, ...createdIds]));
                  // Prefer compact surface syntax: store names (still backed by a global directory for search).
                  const names = final
                    .map((id) => createdPeople.find((p) => p.id === id) || peopleDirectory.find((p) => p.id === id) || null)
                    .map((p) => p?.name || '')
                    .filter(Boolean);
                  const nextRaw = `:)${names.join(',')}:)`;
                  const current = getDisplayValue(macroPopover.rIdx, macroPopover.cIdx).value;
                  const next = replaceMacroOccurrence(current || '', macroPopover.occ, nextRaw);
                  commitEdit(macroPopover.rIdx, macroPopover.cIdx, next);
                  setMacroPopover(null);
                }}
              />
            ) : (
              <DatePopover
                body={macroPopover.body}
                onClose={() => setMacroPopover(null)}
                onApply={(nextBody) => {
                  // Prefer compact surface syntax.
                  const nextRaw = `@@${nextBody}`;
                  const current = getDisplayValue(macroPopover.rIdx, macroPopover.cIdx).value;
                  const next = replaceMacroOccurrence(current || '', macroPopover.occ, nextRaw);
                  commitEdit(macroPopover.rIdx, macroPopover.cIdx, next);
                  setMacroPopover(null);
                }}
              />
            )}
          </div>
        ) : null}

        {cardMacroPopover ? (
          <div
            data-card-macro-popover="1"
            className="fixed z-[1000] mac-double-outline bg-white p-2 shadow-xl"
            style={{
              left: Math.min(window.innerWidth - 340, Math.max(8, cardMacroPopover.anchor.left)),
              top: Math.min(window.innerHeight - 260, Math.max(8, cardMacroPopover.anchor.top + cardMacroPopover.anchor.height + 6)),
              width: 320,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {cardMacroPopover.kind === 'pills' ? (
              <PillsPopover
                body={cardMacroPopover.body}
                options={[]}
                onClose={() => setCardMacroPopover(null)}
                onApply={(nextTags) => {
                  const nextRaw = `<<${nextTags.join(',')}>>`;
                  const card = (sheetRef.current.cards || []).find((c) => c.id === cardMacroPopover.cardId) || null;
                  const current = card?.content || '';
                  const next = replaceMacroOccurrence(current, cardMacroPopover.occ, nextRaw);
                  updateCardContent(cardMacroPopover.cardId, next);
                  setCardMacroPopover(null);
                }}
              />
            ) : cardMacroPopover.kind === 'people' ? (
              <PeoplePopover
                body={cardMacroPopover.body}
                peopleDirectory={peopleDirectory}
                onClose={() => setCardMacroPopover(null)}
                onApplyTokens={(tokens) => {
                  const toks = tokens.map((t) => t.trim()).filter(Boolean);
                  const names = toks.map((t) => (t.startsWith('@') ? t.slice(1) : t));
                  const nextRaw = `:)${names.join(',')}:)`;
                  const card = (sheetRef.current.cards || []).find((c) => c.id === cardMacroPopover.cardId) || null;
                  const current = card?.content || '';
                  const next = replaceMacroOccurrence(current, cardMacroPopover.occ, nextRaw);
                  updateCardContent(cardMacroPopover.cardId, next);
                  setCardMacroPopover(null);
                }}
              />
            ) : (
              <DatePopover
                body={cardMacroPopover.body}
                onClose={() => setCardMacroPopover(null)}
                onApply={(nextBody) => {
                  const nextRaw = `@@${nextBody}`;
                  const card = (sheetRef.current.cards || []).find((c) => c.id === cardMacroPopover.cardId) || null;
                  const current = card?.content || '';
                  const next = replaceMacroOccurrence(current, cardMacroPopover.occ, nextRaw);
                  updateCardContent(cardMacroPopover.cardId, next);
                  setCardMacroPopover(null);
                }}
              />
            )}
          </div>
        ) : null}

        {tableFilterPopover ? (
          <div
            data-table-filter-popover="1"
            className="fixed z-[1000] mac-double-outline bg-white p-1 shadow-xl"
            style={{
              left: Math.min(window.innerWidth - 320, Math.max(8, tableFilterPopover.anchor.left)),
              top: Math.min(window.innerHeight - 220, Math.max(8, tableFilterPopover.anchor.top + tableFilterPopover.anchor.height + 6)),
              width: 300,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const t = sheetRef.current.grid.tables.find((x) => x.id === tableFilterPopover.tableId) || null;
              const title = t ? `Table ${t.id} — ${tableFilterPopover.colId}` : tableFilterPopover.colId;
              const current = tableFilterPopoverApi.getQuery(tableFilterPopover.tableId, tableFilterPopover.colId);
              return (
                <TableFilterPopover
                  title={title}
                  statsLabel={tableFilterPopoverApi.getStatsLabel(tableFilterPopover.tableId)}
                  value={current}
                  onClose={() => setTableFilterPopover(null)}
                  onClearAll={() => {
                    tableFilterPopoverApi.clearTable(tableFilterPopover.tableId);
                    setTableFilterPopover(null);
                  }}
                  onChange={(next) => {
                    tableFilterPopoverApi.setQuery(tableFilterPopover.tableId, tableFilterPopover.colId, next);
                  }}
                  options={tableFilterPopoverApi.getOptions(tableFilterPopover.tableId, tableFilterPopover.colId)}
                  selected={tableFilterPopoverApi.getSelectedValues(tableFilterPopover.tableId, tableFilterPopover.colId)}
                  onToggleValue={(v) => tableFilterPopoverApi.toggleValue(tableFilterPopover.tableId, tableFilterPopover.colId, v)}
                  onSelectAll={() => tableFilterPopoverApi.selectAll(tableFilterPopover.tableId, tableFilterPopover.colId)}
                  onSelectNone={() => tableFilterPopoverApi.selectNone(tableFilterPopover.tableId, tableFilterPopover.colId)}
                />
              );
            })()}
          </div>
        ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

