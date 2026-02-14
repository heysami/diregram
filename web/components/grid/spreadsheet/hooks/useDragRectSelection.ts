'use client';

import { useCallback, useEffect, useRef } from 'react';

export type CellPos = { r: number; c: number };

export function useDragRectSelection(opts: {
  getSelectionKeyForCell: (rIdx: number, cIdx: number) => string | null;
  setSelected: (pos: CellPos) => void;
  setCellSelection: (next: Set<string>) => void;
}) {
  const { getSelectionKeyForCell, setSelected, setCellSelection } = opts;

  const dragSelectRef = useRef<{ start: CellPos; lastEnd: CellPos } | null>(null);

  useEffect(() => {
    const onUp = () => {
      dragSelectRef.current = null;
    };
    window.addEventListener('mouseup', onUp, { passive: true });
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
    };
  }, []);

  const buildRectSelection = useCallback(
    (start: CellPos, end: CellPos): Set<string> => {
      const r0 = Math.min(start.r, end.r);
      const r1 = Math.max(start.r, end.r);
      const c0 = Math.min(start.c, end.c);
      const c1 = Math.max(start.c, end.c);
      const ns = new Set<string>();
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          const k = getSelectionKeyForCell(rr, cc);
          if (k) ns.add(k);
        }
      }
      return ns;
    },
    [getSelectionKeyForCell],
  );

  const startDrag = useCallback((start: CellPos) => {
    dragSelectRef.current = { start, lastEnd: start };
  }, []);

  const onTableMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const cur = dragSelectRef.current;
      if (!cur) return;
      if ((e.buttons & 1) !== 1) return;
      const target = e.target as HTMLElement | null;
      const td = target?.closest?.('td[data-r][data-c]') as HTMLElement | null;
      if (!td) return;
      const rStr = td.getAttribute('data-r');
      const cStr = td.getAttribute('data-c');
      const r = rStr ? Number.parseInt(rStr, 10) : NaN;
      const c = cStr ? Number.parseInt(cStr, 10) : NaN;
      if (!Number.isFinite(r) || !Number.isFinite(c)) return;
      const end = { r, c };
      if (cur.lastEnd.r === end.r && cur.lastEnd.c === end.c) return;
      dragSelectRef.current = { start: cur.start, lastEnd: end };
      const ns = buildRectSelection(cur.start, end);
      if (ns.size > 0) {
        setSelected(end);
        setCellSelection(ns);
      }
    },
    [buildRectSelection, setCellSelection, setSelected],
  );

  return {
    startDrag,
    buildRectSelection,
    tableProps: {
      onMouseMove: onTableMouseMove,
    },
  };
}

