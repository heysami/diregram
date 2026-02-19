'use client';

import { useEffect, type RefObject } from 'react';
import type { GridCardV1, GridRegionV1, GridSheetV1, GridTableV1 } from '@/lib/gridjson';
import { buildCopyTsv } from '@/components/grid/spreadsheet/gridClipboard';
import { parseTsv } from '@/lib/grid/tsv';
import { isBlockedCrossFilePaste, readInternalClipboardEnvelope, writeInternalClipboardEnvelope } from '@/lib/nexus-internal-clipboard';
import { isFromEditableTarget } from '@/lib/dom/isFromEditableTarget';
import {
  applyExternalMatrixPaste,
  applyInternalGridRangePaste,
  buildGridRangeClipboardPayloadV1,
  coerceGridRangeClipboardPayloadV1,
  type GridRect,
} from '@/lib/grid/clipboard/gridRangeClipboard';

export function useGridClipboard(opts: {
  containerRef: RefObject<HTMLDivElement | null>;
  /** Current file id; used to prevent internal pastes across different files. */
  fileId?: string | null;
  selected: { r: number; c: number };
  selectionRect: GridRect | null;
  rows: Array<{ id: string }>;
  cols: Array<{ id: string }>;
  regions: GridRegionV1[];
  tables: GridTableV1[];
  cards: GridCardV1[];
  rowIndexById: Map<string, number>;
  colIndexById: Map<string, number>;
  getCoordKey: (r: number, c: number) => string;
  getDisplayValue: (r: number, c: number) => { value: string };
  mutateSheet: (fn: (s: GridSheetV1) => GridSheetV1) => void;
  topToast: { show: (msg: string) => void };
}) {
  const {
    containerRef,
    fileId,
    selected,
    selectionRect,
    rows,
    cols,
    regions,
    tables,
    cards,
    rowIndexById,
    colIndexById,
    getCoordKey,
    getDisplayValue,
    mutateSheet,
    topToast,
  } = opts;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const activeFileId = String(fileId || '').trim();

    const rectForCopy = (): GridRect => selectionRect || { r0: selected.r, r1: selected.r, c0: selected.c, c1: selected.c };

    const onCopy = (e: ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;
      if (!activeFileId) return;
      const rect = rectForCopy();
      const outTsv = buildCopyTsv({ rect, getValue: (r, c) => getDisplayValue(r, c).value });
      const payload = buildGridRangeClipboardPayloadV1({ rect, getValue: (r, c) => getDisplayValue(r, c).value, regions, cards, tables, rowIndexById, colIndexById });
      e.preventDefault();
      try {
        e.clipboardData?.setData('text/plain', outTsv);
      } catch {
        // ignore
      }
      try {
        writeInternalClipboardEnvelope(e, { kind: 'gridRange', fileId: activeFileId, plainText: outTsv, payload });
      } catch {
        // ignore
      }
    };

    const onCut = (e: ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;
      if (!activeFileId) return;
      const rect = rectForCopy();
      const outTsv = buildCopyTsv({ rect, getValue: (r, c) => getDisplayValue(r, c).value });
      const payload = buildGridRangeClipboardPayloadV1({ rect, getValue: (r, c) => getDisplayValue(r, c).value, regions, cards, tables, rowIndexById, colIndexById });
      e.preventDefault();
      try {
        e.clipboardData?.setData('text/plain', outTsv);
      } catch {
        // ignore
      }
      try {
        writeInternalClipboardEnvelope(e, { kind: 'gridRange', fileId: activeFileId, plainText: outTsv, payload });
      } catch {
        // ignore
      }
      const blank = Array.from({ length: rect.r1 - rect.r0 + 1 }, () => Array.from({ length: rect.c1 - rect.c0 + 1 }, () => ''));
      mutateSheet((s) =>
        applyExternalMatrixPaste({
          sheet: s,
          matrix: blank,
          start: { r: rect.r0, c: rect.c0 },
          rows,
          cols,
          getCoordKey,
          rowIndexById,
          colIndexById,
        }),
      );
    };

    const onPaste = (e: ClipboardEvent) => {
      if (isFromEditableTarget(e.target)) return;

      const env = readInternalClipboardEnvelope(e);
      if (env && env.kind === 'gridRange') {
        if (activeFileId && isBlockedCrossFilePaste(env, activeFileId)) {
          e.preventDefault();
          topToast.show(`Can't paste across different files.`);
          return;
        }

        const payload = coerceGridRangeClipboardPayloadV1(env.payload);
        if (!payload) return;

        e.preventDefault();
        mutateSheet((s) =>
          applyInternalGridRangePaste({
            sheet: s,
            payload,
            start: { r: selected.r, c: selected.c },
            rows,
            cols,
            getCoordKey,
            rowIndexById,
            colIndexById,
          }),
        );
        return;
      }

      // External paste (Excel/TSV)
      const text = (() => {
        try {
          return String(e.clipboardData?.getData('text/plain') || '');
        } catch {
          return '';
        }
      })();
      if (!text) return;
      const gridIn = parseTsv(text);
      if (!gridIn.length) return;

      e.preventDefault();
      mutateSheet((s) =>
        applyExternalMatrixPaste({
          sheet: s,
          matrix: gridIn,
          start: { r: selected.r, c: selected.c },
          rows,
          cols,
          getCoordKey,
          rowIndexById,
          colIndexById,
        }),
      );
    };

    el.addEventListener('copy', onCopy);
    el.addEventListener('cut', onCut);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('copy', onCopy);
      el.removeEventListener('cut', onCut);
      el.removeEventListener('paste', onPaste);
    };
  }, [
    containerRef,
    fileId,
    selected,
    selectionRect,
    rows,
    cols,
    regions,
    tables,
    cards,
    rowIndexById,
    colIndexById,
    getCoordKey,
    getDisplayValue,
    mutateSheet,
    topToast,
  ]);
}

