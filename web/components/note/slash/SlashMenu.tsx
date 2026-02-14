'use client';

import { useEffect, useRef } from 'react';

export type SlashItem = { id: string; label: string };

export function SlashMenu({
  open,
  x,
  y,
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
  items: SlashItem[];
  index: number;
  debugText: string | null;
  errorText: string | null;
  onPick: (id: string) => void;
  onHoverIndex: (idx: number) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

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

  if (!open) return null;

  return (
    <div
      className="fixed z-[3000] mac-window overflow-hidden pointer-events-auto max-h-[360px] w-[300px] flex flex-col"
      style={{ left: Math.max(12, x), top: Math.max(12, y) }}
      role="menu"
      onPointerDown={(e) => {
        // Prevent outside-click handlers (capture) from unmounting before our handlers run.
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
    >
      <div className="px-3 py-2 border-b bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600">Insert</div>
      <div ref={listRef} className="p-2 space-y-1 text-sm overflow-y-auto">
        {items.map((it, idx) => (
          <button
            key={it.id}
            type="button"
            data-slash-idx={idx}
            className={`pointer-events-auto w-full text-left rounded px-2 py-1 ${
              idx === index ? 'bg-slate-100' : 'hover:bg-slate-50'
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
        ))}

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
          className="pointer-events-auto w-full text-left rounded px-2 py-1 text-slate-500 hover:bg-slate-50"
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

