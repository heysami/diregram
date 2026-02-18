'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';
import { useFileMarkdown } from '@/components/note/embed-config/useFileMarkdown';
import { loadVisionDoc } from '@/lib/visionjson';

type VisionCardEntry = { id: string; title: string; hasThumb: boolean };

export function VisionCardLinkModal({
  open,
  files,
  loadingFiles,
  initialFileId,
  initialCardId,
  onClose,
  onApply,
}: {
  open: boolean;
  files: WorkspaceFile[];
  loadingFiles: boolean;
  initialFileId: string | null;
  initialCardId?: string;
  onClose: () => void;
  onApply: (res: { fileId: string; cardId: string }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [cardId, setCardId] = useState<string>(initialCardId || '');
  const [q, setQ] = useState('');

  // Require selecting a vision file before choosing a card.
  useEffect(() => {
    if (!open) return;
    if (!fileId) setShowPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { markdown, loading: loadingMd } = useFileMarkdown(fileId);

  const cards = useMemo<VisionCardEntry[]>(() => {
    try {
      if (!markdown.trim()) return [];
      const loaded = loadVisionDoc(markdown);
      const snap: any = (loaded.doc as any)?.tldraw || null;
      const store = snap?.document?.store;
      if (!store || typeof store !== 'object') return [];
      const out: VisionCardEntry[] = [];
      for (const rec of Object.values<any>(store)) {
        if (!rec) continue;
        if (rec.typeName !== 'shape') continue;
        if (String(rec.type || '') !== 'nxcard') continue;
        const id = String(rec.id || '').trim();
        if (!id) continue;
        const title = typeof rec?.props?.title === 'string' ? String(rec.props.title).trim() : '';
        const hasThumb = !!(rec?.props?.thumb && String(rec.props.thumb).trim());
        out.push({ id, title, hasThumb });
      }
      out.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
      return out;
    } catch {
      return [];
    }
  }, [markdown]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return cards;
    return cards.filter((c) => c.id.toLowerCase().includes(qq) || c.title.toLowerCase().includes(qq));
  }, [cards, q]);

  if (!open) return null;

  const fileLabel = (() => {
    if (!fileId) return 'Select a vision file…';
    const f = files.find((x) => x.id === fileId) || null;
    return f ? `${f.name}` : fileId;
  })();

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[720px] max-w-[96vw] max-h-[84vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Link vision card</div>
        </div>

        <div className="p-3 border-b bg-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] opacity-70">File</div>
            <div className="text-sm font-semibold truncate" title={fileLabel}>
              {fileLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="mac-btn h-8" onClick={() => setShowPicker(true)}>
              Choose…
            </button>
            <button type="button" className="mac-btn h-8" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input className="mac-field h-8 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards…" />
            <button
              type="button"
              className="mac-btn mac-btn--primary h-8"
              disabled={!fileId || !cardId.trim() || loadingMd}
              onClick={() => {
                if (!fileId) return;
                const cid = cardId.trim();
                if (!cid) return;
                onApply({ fileId, cardId: cid });
              }}
            >
              Apply
            </button>
          </div>

          {!fileId ? <div className="text-xs text-slate-600">Select a vision file to see cards.</div> : null}
          {fileId && loadingMd ? <div className="text-xs text-slate-600">Loading cards…</div> : null}
          {fileId && !loadingMd && cards.length === 0 ? <div className="text-xs text-slate-600">No cards found.</div> : null}

          <div className="max-h-[52vh] overflow-auto rounded border border-slate-200">
            {filtered.map((c) => {
              const active = c.id === cardId;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${active ? 'bg-blue-50' : ''}`}
                  onClick={() => setCardId(c.id)}
                  title={c.id}
                >
                  <div className="font-semibold truncate">
                    {c.title || 'Untitled card'} {c.hasThumb ? <span className="opacity-60">(thumb)</span> : null}
                  </div>
                  <div className="font-mono text-[11px] opacity-70 truncate">{c.id}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <WorkspaceFilePicker
        open={showPicker}
        title="Select vision file"
        files={files.filter((f) => f.kind === 'vision')}
        loading={loadingFiles}
        onPick={(f) => {
          setFileId(f.id);
          setShowPicker(false);
          setCardId('');
        }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}

