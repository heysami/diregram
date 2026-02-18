'use client';

import { useMemo, useState } from 'react';
import type { WorkspaceFile } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';

export function TestFileLinkModal({
  open,
  files,
  loadingFiles,
  initialTestFileId,
  onClose,
  onApply,
}: {
  open: boolean;
  files: WorkspaceFile[];
  loadingFiles: boolean;
  initialTestFileId: string | null;
  onClose: () => void;
  onApply: (res: { testFileId: string }) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const label = useMemo(() => {
    if (!initialTestFileId) return 'Select a test file…';
    const f = files.find((x) => x.id === initialTestFileId) || null;
    return f ? `${f.name}` : initialTestFileId;
  }, [files, initialTestFileId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[560px] max-w-[96vw] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Link test file</div>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs opacity-70">Test file</div>
          <div className="text-sm font-semibold truncate" title={label}>
            {label}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" className="mac-btn mac-btn--primary h-8" onClick={() => setShowPicker(true)}>
              Choose…
            </button>
            <button type="button" className="mac-btn h-8" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      <WorkspaceFilePicker
        open={showPicker}
        title="Select test file"
        files={files.filter((f) => f.kind === 'test')}
        loading={loadingFiles}
        onPick={(f) => {
          onApply({ testFileId: f.id });
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
      />
    </div>
  );
}

