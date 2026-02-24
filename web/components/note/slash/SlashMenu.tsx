'use client';

import { useEffect, useRef, useState } from 'react';
import { SLASH_MENU_ROOT_ATTR } from '@/components/note/slash/constants';

export type SlashItem = { id: string; label: string };

export function SlashMenu({
  open,
  x,
  y,
  query,
  items,
  index,
  debugText,
  errorText,
  onPick,
  onHoverIndex,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  query: string;
  items: SlashItem[];
  index: number;
  debugText: string | null;
  errorText: string | null;
  onPick: (id: string) => void;
  onHoverIndex: (idx: number) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Keep highlighted item visible while navigating via keyboard.
  useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-slash-idx="${index}"]`) as HTMLElement | null;
    if (!el) return;
    const t = window.requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch {
        // ignore
      }
    });
    return () => window.cancelAnimationFrame(t);
  }, [open, index]);

  // Position within viewport; if it would overflow below, flip above so the bottom sits near the cursor.
  useEffect(() => {
    if (!open) return;
    const pad = 12;
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;

      let left = Math.max(pad, x);
      if (vw > 0 && left + r.width > vw - pad) left = Math.max(pad, vw - pad - r.width);

      let top = Math.max(pad, y);
      if (vh > 0 && top + r.height > vh - pad) top = Math.max(pad, y - r.height);

      setPos({ left, top });
    };
    const t = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(t);
      window.removeEventListener('resize', update);
    };
  }, [open, x, y, items.length, debugText, errorText]);

  if (!open) return null;

  const q = String(query || '');

  return (
    <div
      ref={rootRef}
      {...{ [SLASH_MENU_ROOT_ATTR]: '1' }}
      className="fixed z-[3000] mac-window overflow-hidden pointer-events-auto max-h-[360px] w-[300px] flex flex-col"
      style={{ left: pos?.left ?? Math.max(12, x), top: pos?.top ?? Math.max(12, y) }}
      role="menu"
      onPointerDown={(e) => {
        // Prevent outside-click handlers (capture) from unmounting before our handlers run.
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="px-3 py-2 border-b bg-white/70">
        <div className="text-[11px] uppercase tracking-wide text-slate-600">Insert</div>
        <div className="mt-1 text-[12px] text-slate-700">
          <span className="text-slate-500">/</span>
          <span className="font-mono">{q || <span className="text-slate-400">type to search…</span>}</span>
        </div>
      </div>
      <div ref={listRef} className="p-2 space-y-1 text-sm overflow-y-auto">
        {items.length ? (
          items.map((it, idx) => (
            <button
              key={it.id}
              type="button"
              data-slash-idx={idx}
              className={`pointer-events-auto w-full text-left rounded px-2 py-1 mac-menu-item ${
                idx === index ? 'is-active' : ''
              }`}
              onMouseDown={(e) => {
                // Use mousedown instead of click so we run before any global "outside click" closer.
                e.preventDefault();
                e.stopPropagation();
                onPick(it.id);
              }}
              onMouseEnter={() => onHoverIndex(idx)}
            >
              {it.label}
            </button>
          ))
        ) : (
          <div className="px-2 py-2 text-[12px] text-slate-500">No matches</div>
        )}

        {debugText ? <div className="mt-2 text-[11px] text-slate-500">{debugText}</div> : null}
        {errorText ? (
          <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-2 text-[12px] text-rose-700">
            {errorText}
          </div>
        ) : null}
      </div>

      <div className="border-t bg-white/70 p-2">
        <button
          type="button"
          className="pointer-events-auto w-full text-left rounded px-2 py-1 text-slate-500 mac-menu-item"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
