'use client';

import type { VisionCellKind } from '@/lib/visionjson';

export function VisionCellModal({
  isOpen,
  cellKey,
  onClose,
  onSelectKind,
}: {
  isOpen: boolean;
  cellKey: string | null;
  onClose: () => void;
  onSelectKind: (kind: VisionCellKind) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Close" onClick={onClose} />
      <div className="relative w-[520px] max-w-[96vw] bg-white border shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div className="font-semibold">New tile</div>
          <div className="text-xs opacity-70">{cellKey || ''}</div>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm opacity-80">
            Select what kind of visual this tile represents.
          </div>
          <div className="grid gap-2">
            <button type="button" className="h-11 border bg-white text-left px-3" onClick={() => onSelectKind('vector')}>
              <div className="font-semibold text-sm">Vector Illustration</div>
              <div className="text-[11px] opacity-70">Shapes, paths, gradients, text.</div>
            </button>
            <button type="button" className="h-11 border bg-white text-left px-3" onClick={() => onSelectKind('ui')}>
              <div className="font-semibold text-sm">UI Sample</div>
              <div className="text-[11px] opacity-70">Vector tools + UI-oriented monitoring.</div>
            </button>
            <button type="button" className="h-11 border bg-white text-left px-3" onClick={() => onSelectKind('image')}>
              <div className="font-semibold text-sm">Image / Photography</div>
              <div className="text-[11px] opacity-70">Upload an image, then annotate in layers.</div>
            </button>
          </div>
          <div className="pt-2 flex items-center justify-end gap-2">
            <button type="button" className="h-9 px-3 border bg-white" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

