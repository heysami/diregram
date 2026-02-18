'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';
import { useFileMarkdown } from '@/components/note/embed-config/useFileMarkdown';
import { buildDiagramIndexFromMarkdown } from '@/components/note/embed-config/diagramIndex';

export type EmbedLinkKind = 'canvas' | 'flowSubtree' | 'systemflow' | 'dataObjects';

export type EmbedLinkResult =
  | { kind: 'canvas'; fileId: string | null; rootFocusId?: string }
  | { kind: 'systemflow'; fileId: string | null; ref: string }
  | { kind: 'dataObjects'; fileId: string | null }
  | { kind: 'flowSubtree'; fileId: string | null; rootFocusId: string };

export function EmbedLinkModal({
  open,
  files,
  loadingFiles,
  initialFileId,
  initialKind,
  initialRootFocusId,
  initialSystemFlowRef,
  onClose,
  onApply,
}: {
  open: boolean;
  files: WorkspaceFile[];
  loadingFiles: boolean;
  initialFileId: string | null;
  initialKind: EmbedLinkKind;
  initialRootFocusId?: string;
  initialSystemFlowRef?: string;
  onClose: () => void;
  onApply: (res: EmbedLinkResult) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [kind, setKind] = useState<EmbedLinkKind>(initialKind);
  const [rootFocusId, setRootFocusId] = useState<string>(initialRootFocusId || '');
  const [systemFlowRef, setSystemFlowRef] = useState<string>(initialSystemFlowRef || '');

  // Require selecting a diagram file before configuring the embed.
  useEffect(() => {
    if (!open) return;
    if (!fileId) setShowPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { markdown, loading: loadingMd } = useFileMarkdown(fileId);
  const idx = useMemo(() => buildDiagramIndexFromMarkdown(markdown), [markdown]);

  const fileLabel = useMemo(() => {
    if (!fileId) return 'This file (unlinked)';
    const f = files.find((x) => x.id === fileId) || null;
    return f ? `${f.name}` : fileId;
  }, [fileId, files]);

  if (!open) return null;

  const apply = () => {
    if (!fileId) return;
    if (kind === 'systemflow') {
      const ref = systemFlowRef.trim();
      if (!ref) return;
      onApply({ kind: 'systemflow', fileId, ref });
      return;
    }
    if (kind === 'dataObjects') {
      onApply({ kind: 'dataObjects', fileId });
      return;
    }
    if (kind === 'flowSubtree') {
      const rid = rootFocusId.trim();
      if (!rid) return;
      onApply({ kind: 'flowSubtree', fileId, rootFocusId: rid });
      return;
    }
    // canvas
    const rid = rootFocusId.trim();
    onApply(rid ? { kind: 'canvas', fileId, rootFocusId: rid } : { kind: 'canvas', fileId });
  };

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[720px] max-w-[96vw] max-h-[84vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Link embed</div>
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
            <button type="button" className={`mac-btn h-7 ${kind === 'canvas' ? 'mac-btn--primary' : ''}`} onClick={() => setKind('canvas')}>
              Main canvas
            </button>
            <button
              type="button"
              className={`mac-btn h-7 ${kind === 'flowSubtree' ? 'mac-btn--primary' : ''}`}
              onClick={() => setKind('flowSubtree')}
              title="Pick a Flow tab root and embed just that subtree"
            >
              Flow
            </button>
            <button
              type="button"
              className={`mac-btn h-7 ${kind === 'systemflow' ? 'mac-btn--primary' : ''}`}
              onClick={() => setKind('systemflow')}
            >
              System flow
            </button>
            <button
              type="button"
              className={`mac-btn h-7 ${kind === 'dataObjects' ? 'mac-btn--primary' : ''}`}
              onClick={() => setKind('dataObjects')}
            >
              Data objects
            </button>
          </div>

          {!fileId ? <div className="text-[11px] text-slate-500">Select a diagram file to continue.</div> : null}
          {fileId ? (
            <div className="text-[11px] text-slate-500">
              {loadingMd ? 'Loading file content…' : `Loaded file content (${markdown.trim().length ? 'ok' : 'empty'})`}
            </div>
          ) : null}

          {kind === 'systemflow' ? (
            <div>
              <div className="text-xs font-semibold mb-2">Pick a system flow</div>
              <select
                className="mac-field h-8 w-full"
                value={systemFlowRef}
                onChange={(e) => setSystemFlowRef(e.target.value)}
                disabled={fileId ? loadingMd : false}
              >
                <option value="">Select…</option>
                {idx.systemFlows.map((s) => (
                  <option key={s.sfid} value={s.sfid}>
                    {s.label} ({s.sfid})
                  </option>
                ))}
              </select>
              {idx.systemFlows.length === 0 ? <div className="mt-2 text-xs text-slate-500">No system flows found.</div> : null}
            </div>
          ) : null}

          {kind === 'canvas' ? (
            <div>
              <div className="text-xs font-semibold mb-2">Scope (optional)</div>
              <select className="mac-field h-8 w-full" value={rootFocusId} onChange={(e) => setRootFocusId(e.target.value)}>
                <option value="">Full canvas</option>
                {idx.mainRoots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-slate-500">
                Choose a root to embed only that subtree (useful for large canvases).
              </div>
            </div>
          ) : null}

          {kind === 'flowSubtree' ? (
            <div>
              <div className="text-xs font-semibold mb-2">Pick a flow root</div>
              <select className="mac-field h-8 w-full" value={rootFocusId} onChange={(e) => setRootFocusId(e.target.value)}>
                <option value="">Select…</option>
                {idx.flowRoots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {idx.flowRoots.length === 0 ? <div className="mt-2 text-xs text-slate-500">No flow roots found.</div> : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" className="mac-btn mac-btn--primary h-8" onClick={apply} disabled={loadingMd || !fileId}>
              Apply link
            </button>
            <button type="button" className="mac-btn h-8" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <WorkspaceFilePicker
        open={showPicker}
        title="Select diagram file"
        files={files.filter((f) => f.kind === 'diagram')}
        loading={loadingFiles}
        onPick={(f) => {
          setFileId(f.id);
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}

