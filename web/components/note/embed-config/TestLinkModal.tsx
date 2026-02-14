'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';
import { useFileMarkdown } from '@/components/note/embed-config/useFileMarkdown';
import { buildTestingIndexFromMarkdown } from '@/components/note/embed-config/testingIndex';

export function TestLinkModal({
  open,
  files,
  loadingFiles,
  initialFileId,
  initialTestId,
  onClose,
  onApply,
}: {
  open: boolean;
  files: WorkspaceFile[];
  loadingFiles: boolean;
  initialFileId: string | null;
  initialTestId?: string;
  onClose: () => void;
  onApply: (res: { fileId: string | null; testId: string }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [fileId, setFileId] = useState<string | null>(initialFileId);
  const [testId, setTestId] = useState<string>(initialTestId || '');
  const [q, setQ] = useState('');

  // Require selecting a diagram file before choosing a test.
  useEffect(() => {
    if (!open) return;
    if (!fileId) setShowPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { markdown, loading: loadingMd } = useFileMarkdown(fileId);
  const idx = useMemo(() => buildTestingIndexFromMarkdown(markdown), [markdown]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return idx.tests;
    return idx.tests.filter((t) => t.name.toLowerCase().includes(qq) || t.id.toLowerCase().includes(qq));
  }, [idx.tests, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[720px] max-w-[96vw] max-h-[84vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Link test embed</div>
        </div>

        <div className="p-3 border-b bg-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] opacity-70">File</div>
            <div className="text-sm font-semibold truncate">{fileId || 'Select a diagram file…'}</div>
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
            <input className="mac-field h-8 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tests…" />
            <button
              type="button"
              className="mac-btn mac-btn--primary h-8"
              disabled={!fileId || !testId.trim() || loadingMd}
              onClick={() => onApply({ fileId, testId: testId.trim() })}
            >
              Apply
            </button>
          </div>

          {!fileId ? <div className="text-xs text-slate-600">Select a diagram file to see available tests.</div> : null}
          {fileId && loadingMd ? <div className="text-xs text-slate-600">Loading tests…</div> : null}
          {fileId && !loadingMd && idx.tests.length === 0 ? (
            <div className="text-xs text-slate-600">No tests found in this file (missing `testing-store`).</div>
          ) : null}

          <div className="max-h-[52vh] overflow-auto rounded border border-slate-200">
            {filtered.map((t) => {
              const active = t.id === testId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 ${active ? 'bg-blue-50' : ''}`}
                  onClick={() => setTestId(t.id)}
                  title={t.id}
                >
                  <div className="font-semibold truncate">{t.name}</div>
                  <div className="font-mono text-[11px] opacity-70 truncate">{t.id}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <WorkspaceFilePicker
        open={showPicker}
        title="Select diagram file"
        files={files.filter((f) => (f.kind === 'diagram' || f.kind === 'vision') as boolean)}
        loading={loadingFiles}
        onPick={(f) => {
          setFileId(f.id);
          setShowPicker(false);
          setTestId('');
        }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}

