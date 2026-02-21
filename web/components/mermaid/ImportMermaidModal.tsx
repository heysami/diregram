'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { convertMermaidToNexusMarkdown, detectMermaidDiagramType, type MermaidDiagramType } from '@/lib/mermaid/importMermaid';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (res: { name: string; content: string; mermaidType: MermaidDiagramType }) => Promise<void> | void;
};

export function ImportMermaidModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('Imported Mermaid');
  const [src, setSrc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Prevent scroll-chaining while modal is open.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setName('Imported Mermaid');
    setSrc('');
    setError(null);
    setBusy(false);
  }, [open]);

  const detected = useMemo(() => detectMermaidDiagramType(src), [src]);
  const canCreate = useMemo(() => name.trim().length > 0 && src.trim().length > 0 && !busy, [busy, name, src]);

  const handleCreate = async () => {
    setError(null);
    const trimmed = src.trim();
    if (!trimmed) return;
    const res = convertMermaidToNexusMarkdown(trimmed);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    setBusy(true);
    try {
      await onCreate({ name: name.trim() || res.title, content: res.markdown, mermaidType: detected === 'unknown' ? 'flowchart' : detected });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create file.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[980px] max-w-[98vw] max-h-[92vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Import Mermaid diagram</div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px] gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold">Name</div>
              <input className="mac-field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Imported Mermaid" />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold">Detected type</div>
              <div className="mac-double-outline px-2 py-2 text-xs bg-white">
                {detected === 'unknown' ? <span className="opacity-70">Unknown / unsupported</span> : detected}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold">Mermaid source</div>
            <textarea
              className="mac-field w-full font-mono text-[11px]"
              rows={18}
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder={'Paste Mermaid here, e.g.\nflowchart TD\n  A-->B\n'}
            />
            <div className="text-[11px] opacity-70">Supported types only. Other Mermaid diagrams are rejected.</div>
          </div>

          {error ? (
            <div className="mac-double-outline p-3 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="mac-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="mac-btn mac-btn--primary" onClick={handleCreate} disabled={!canCreate}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

