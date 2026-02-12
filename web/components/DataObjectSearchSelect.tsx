'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

export type DataObjectOption = { id: string; name: string };

type Props = {
  value: string; // '' means none/unset
  onChange: (nextId: string) => void;
  objects: DataObjectOption[];
  placeholder?: string; // shown when value is empty
  includeNoneOption?: boolean;
  noneLabel?: string;
  className?: string;
};

export function DataObjectSearchSelect({
  value,
  onChange,
  objects,
  placeholder = 'Select…',
  includeNoneOption = true,
  noneLabel = 'None',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const selected = value ? byId.get(value) || null : null;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = [...objects].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    if (!query) return base;
    return base.filter((o) => o.id.toLowerCase().includes(query) || (o.name || '').toLowerCase().includes(query));
  }, [objects, q]);

  useEffect(() => {
    if (!open) return;
    // focus after render
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const menu = menuRef.current;
      if (e.target instanceof Node) {
        if (el && el.contains(e.target)) return;
        if (menu && menu.contains(e.target)) return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updateAnchor = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setAnchor({ left: r.left, top: r.bottom, width: r.width });
    };

    // Update on scroll/resize (capture scroll from any ancestor)
    const onScroll = () => updateAnchor();
    const onResize = () => updateAnchor();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              setQ('');
              const btn = buttonRef.current;
              if (btn) {
                const r = btn.getBoundingClientRect();
                setAnchor({ left: r.left, top: r.bottom, width: r.width });
              }
            }
            return next;
          });
        }}
        className="mac-btn w-full text-left flex items-center justify-between gap-2"
        title={selected ? `${selected.name} (${selected.id})` : placeholder}
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-500'}`}>
          {selected ? `${selected.name} (${selected.id})` : placeholder}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={menuRef}
          className="mac-popover z-[9999] overflow-hidden"
          style={{
            position: 'fixed',
            left: anchor.left,
            top: anchor.top + 4,
            width: anchor.width,
          }}
        >
          <div className="p-2 border-b">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-gray-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full text-xs focus:outline-none bg-transparent"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-auto">
            {includeNoneOption ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${
                  value === '' ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                {noneLabel}
              </button>
            ) : null}

            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${
                  value === o.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
                title={o.id}
              >
                <span className="font-medium">{o.name}</span> <span className="text-gray-500">({o.id})</span>
              </button>
            ))}

            {filtered.length === 0 ? <div className="px-3 py-2 text-xs text-gray-500">No results.</div> : null}
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}

