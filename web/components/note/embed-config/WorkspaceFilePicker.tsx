'use client';

import { useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';

export function WorkspaceFilePicker({
  open,
  title = 'Select file',
  files,
  loading = false,
  onPick,
  onClose,
}: {
  open: boolean;
  title?: string;
  files: WorkspaceFile[];
  loading?: boolean;
  onPick: (f: WorkspaceFile) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return files;
    return files.filter((f) => f.name.toLowerCase().includes(qq) || f.id.toLowerCase().includes(qq) || f.kind.includes(qq as any));
  }, [files, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[520px] max-w-[92vw] max-h-[78vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">{title}</div>
        </div>
        <div className="p-3 border-b bg-white flex items-center gap-2">
          <input
            className="mac-field h-8 flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            autoFocus
          />
          <button type="button" className="mac-btn h-8" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[52vh] overflow-auto">
          {loading ? <div className="p-3 text-xs text-slate-600">Loading files…</div> : null}
          {!loading && filtered.length === 0 ? <div className="p-3 text-xs text-slate-600">No matches.</div> : null}
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between gap-3"
              onClick={() => onPick(f)}
            >
              <div className="min-w-0">
                <div className="font-semibold truncate">{f.name}</div>
                <div className="opacity-70 truncate">{f.id}</div>
              </div>
              <div className="font-mono text-[11px] opacity-70">{f.kind}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

