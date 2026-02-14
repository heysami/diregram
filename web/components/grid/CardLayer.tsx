'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GridCardV1, GridSheetV1 } from '@/lib/gridjson';

type DragRef =
  | { id: string; startX: number; startY: number; originRow: number; originCol: number }
  | null;
type ResizeRef =
  | { id: string; startX: number; startY: number; originRowspan: number; originColspan: number }
  | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function colLeftPx(cols: GridSheetV1['grid']['columns'], colIdx: number) {
  let x = 44; // row header width
  for (let i = 0; i < colIdx; i++) x += cols[i]?.width ?? 88;
  return x;
}
function rowTopPx(rows: GridSheetV1['grid']['rows'], rowIdx: number) {
  let y = 22; // column header height
  for (let i = 0; i < rowIdx; i++) y += rows[i]?.height ?? 22;
  return y;
}
function spanWidthPx(cols: GridSheetV1['grid']['columns'], colIdx: number, colspan: number) {
  let w = 0;
  for (let i = colIdx; i < colIdx + colspan; i++) w += cols[i]?.width ?? 88;
  return w;
}
function spanHeightPx(rows: GridSheetV1['grid']['rows'], rowIdx: number, rowspan: number) {
  let h = 0;
  for (let i = rowIdx; i < rowIdx + rowspan; i++) h += rows[i]?.height ?? 22;
  return h;
}

export function CardLayer({
  sheet,
  cards,
  onChange,
}: {
  sheet: GridSheetV1;
  cards: GridCardV1[];
  onChange: (next: GridCardV1[]) => void;
}) {
  const cols = sheet.grid.columns || [];
  const rows = sheet.grid.rows || [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const dragRef = useRef<DragRef>(null);
  const resizeRef = useRef<ResizeRef>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const colIndexById = useMemo(() => new Map(cols.map((c, i) => [c.id, i])), [cols]);

  const occupy = (card: GridCardV1, r: number, c: number) => {
    const r0 = rowIndexById.get(card.rowId) ?? 0;
    const c0 = colIndexById.get(card.colId) ?? 0;
    return r >= r0 && r < r0 + card.rowspan && c >= c0 && c < c0 + card.colspan;
  };

  const findCardAt = (rIdx: number, cIdx: number): GridCardV1 | null => {
    for (const card of cards) {
      if (occupy(card, rIdx, cIdx)) return card;
    }
    return null;
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const r = resizeRef.current;
      if (!d && !r) return;
      e.preventDefault();
      if (d) {
        const card = byId.get(d.id);
        if (!card) return;
        const originColW = cols[d.originCol]?.width ?? 88;
        const originRowH = rows[d.originRow]?.height ?? 22;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const dc = Math.round(dx / originColW);
        const dr = Math.round(dy / originRowH);
        const nextCol = clamp(d.originCol + dc, 0, Math.max(0, cols.length - card.colspan));
        const nextRow = clamp(d.originRow + dr, 0, Math.max(0, rows.length - card.rowspan));
        const next = cards.map((c) =>
          c.id === d.id
            ? { ...c, colId: cols[nextCol]?.id || c.colId, rowId: rows[nextRow]?.id || c.rowId }
            : c,
        );
        onChange(next);
      } else if (r) {
        const card = byId.get(r.id);
        if (!card) return;
        const originColW = cols[colIndexById.get(card.colId) ?? 0]?.width ?? 88;
        const originRowH = rows[rowIndexById.get(card.rowId) ?? 0]?.height ?? 22;
        const dx = e.clientX - r.startX;
        const dy = e.clientY - r.startY;
        const nextColspan = clamp(r.originColspan + Math.round(dx / originColW), 1, cols.length);
        const nextRowspan = clamp(r.originRowspan + Math.round(dy / originRowH), 1, rows.length);
        const next = cards.map((c) =>
          c.id === r.id ? { ...c, colspan: nextColspan, rowspan: nextRowspan } : c,
        );
        onChange(next);
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
  }, [byId, cards, cols, rows, colIndexById, rowIndexById, onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const card = byId.get(selectedId);
      if (!card) return;

      // Editing mode: Enter/Esc exits to selection.
      if (editingId === selectedId) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setEditingId(null);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onChange(cards.map((c) => (c.id === selectedId ? { ...c, content: draft } : c)));
          setEditingId(null);
          return;
        }
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onChange(cards.filter((c) => c.id !== selectedId));
        setSelectedId(null);
        return;
      }

      const r0 = rowIndexById.get(card.rowId) ?? 0;
      const c0 = colIndexById.get(card.colId) ?? 0;

      const ensureCardAt = (rIdx: number, cIdx: number) => {
        const rr = clamp(rIdx, 0, rows.length - 1);
        const cc = clamp(cIdx, 0, cols.length - 1);
        const existing = findCardAt(rr, cc);
        if (existing) {
          setSelectedId(existing.id);
          return;
        }
        const max = Math.max(0, ...cards.map((x) => Number(String(x.id).split('-').pop()) || 0));
        const id = `card-${max + 1}`;
        const next: GridCardV1 = {
          id,
          rowId: rows[rr]?.id || 'r-1',
          colId: cols[cc]?.id || 'c-1',
          rowspan: 1,
          colspan: 1,
          content: '',
        };
        onChange([...cards, next]);
        setSelectedId(id);
        setEditingId(id);
        setDraft('');
      };

      if (e.key === 'Enter') {
        e.preventDefault();
        ensureCardAt(r0 + card.rowspan, c0);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        ensureCardAt(r0, c0 + card.colspan);
        return;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setEditingId(selectedId);
        setDraft(e.key);
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [selectedId, editingId, draft, byId, cards, cols, rows, colIndexById, rowIndexById, onChange]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="absolute inset-0 pointer-events-none"
      onPointerDown={() => {
        setSelectedId(null);
        setEditingId(null);
      }}
    >
      {cards.map((c) => {
        const r0 = rowIndexById.get(c.rowId) ?? 0;
        const c0 = colIndexById.get(c.colId) ?? 0;
        const left = colLeftPx(cols, c0);
        const top = rowTopPx(rows, r0);
        const w = spanWidthPx(cols, c0, c.colspan);
        const h = spanHeightPx(rows, r0, c.rowspan);
        const selected = c.id === selectedId;
        const editing = c.id === editingId;
        return (
          <div
            key={c.id}
            className={`absolute pointer-events-auto bg-white border ${selected ? 'border-slate-800' : 'border-slate-300'} shadow-sm`}
            style={{ left, top, width: w, height: h }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedId(c.id);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedId(c.id);
              setEditingId(c.id);
              setDraft(c.content || '');
            }}
          >
            <div
              className="h-5 px-1 text-[10px] font-semibold bg-slate-50 border-b border-slate-200 cursor-move select-none flex items-center"
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedId(c.id);
                dragRef.current = { id: c.id, startX: e.clientX, startY: e.clientY, originRow: r0, originCol: c0 };
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
            >
              Card
            </div>
            <div className="p-1 text-[11px] h-[calc(100%-20px)]">
              {editing ? (
                <textarea
                  className="w-full h-full resize-none outline-none"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // Handled at container for Enter/Esc; stop propagation so grid doesn't intercept.
                    e.stopPropagation();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ) : (
                <div className="w-full h-full whitespace-pre-wrap break-words select-none">{c.content || '\u00A0'}</div>
              )}
            </div>
            <div
              className="absolute right-0 bottom-0 w-2.5 h-2.5 bg-slate-300 cursor-nwse-resize"
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedId(c.id);
                resizeRef.current = { id: c.id, startX: e.clientX, startY: e.clientY, originRowspan: c.rowspan, originColspan: c.colspan };
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

