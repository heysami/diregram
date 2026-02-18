'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';

export function NoteLinkModal({
  open,
  files,
  loadingFiles,
  initialFileId,
  initialBlockId,
  onClose,
  onApply,
}: {
  open: boolean;
  files: WorkspaceFile[];
  loadingFiles: boolean;
  initialFileId: string | null;
  initialBlockId?: string | null;
  onClose: () => void;
  onApply: (res: { fileId: string; blockId?: string | null }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [blockId, setBlockId] = useState<string>(initialBlockId || '');

  // Require selecting a note file before applying.
  useEffect(() => {
    if (!open) return;
    if (!fileId) setShowPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fileLabel = useMemo(() => {
    if (!fileId) return 'Select a note…';
    const f = files.find((x) => x.id === fileId) || null;
    return f ? `${f.name}` : fileId;
  }, [fileId, files]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[640px] max-w-[96vw] max-h-[84vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Link note</div>
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
          <div>
            <div className="text-xs font-semibold mb-2">Block id (optional)</div>
            <input
              className="mac-field h-8 w-full font-mono text-[12px]"
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              placeholder="e.g. embed-… (matches #hash highlight targets)"
            />
            <div className="mt-2 text-[11px] text-slate-500">
              If provided, the opened note will scroll/highlight the matching block (currently supports embed/test block ids).
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="mac-btn mac-btn--primary h-8"
              disabled={!fileId}
              onClick={() => {
                if (!fileId) return;
                const bid = blockId.trim();
                onApply({ fileId, ...(bid ? { blockId: bid } : { blockId: null }) });
              }}
            >
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
        title="Select note file"
        files={files.filter((f) => f.kind === 'note')}
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

