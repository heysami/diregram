'use client';

import { X } from 'lucide-react';

export function MarkdownPopup({
  isOpen,
  onClose,
  rawMarkdownPreview,
  rawMarkdownChars,
  supabaseMode,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  rawMarkdownPreview?: string;
  rawMarkdownChars?: number;
  supabaseMode: boolean;
  userId: string | null;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[20000]" role="dialog" aria-modal="true" aria-label="Markdown preview">
      <div
        className="absolute inset-0 bg-black/20"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div className="absolute right-4 top-14 w-[560px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-72px)] mac-window mac-double-outline overflow-hidden flex flex-col">
        <div className="mac-titlebar">
          <div className="mac-title">Markdown preview</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" className="mac-btn mac-btn--icon-sm" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-3 overflow-auto">
          <div className="text-[11px] opacity-70 mb-2 font-mono">
            {rawMarkdownChars ? `${rawMarkdownChars.toLocaleString()} chars` : '—'}
            {supabaseMode ? ` • Supabase user: ${userId || 'unknown'}` : ' • Local mode'}
          </div>
          <pre className="mac-double-outline bg-white px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words max-h-[70vh] overflow-auto">
            {(rawMarkdownPreview || '') +
              (rawMarkdownPreview && rawMarkdownChars && rawMarkdownChars > rawMarkdownPreview.length ? '\n\n— preview truncated —\n' : '')}
          </pre>
        </div>
      </div>
    </div>
  );
}
