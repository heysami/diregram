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
    <div className="fixed inset-0 z-[20000]">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="absolute right-3 top-14 w-[520px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-72px)] bg-white border shadow-lg flex flex-col">
        <div className="h-10 px-2 border-b flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Markdown (preview)</div>
          <button type="button" className="h-7 w-7 border bg-white flex items-center justify-center" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-2 overflow-auto">
          <div className="text-[11px] opacity-70 mb-2">
            {rawMarkdownChars ? `${rawMarkdownChars.toLocaleString()} chars` : '—'}
            {supabaseMode ? ` • Supabase user: ${userId || 'unknown'}` : ' • Local mode'}
          </div>
          <pre className="text-[10px] whitespace-pre-wrap break-words border p-2 bg-white max-h-[70vh] overflow-auto">
            {(rawMarkdownPreview || '') +
              (rawMarkdownPreview && rawMarkdownChars && rawMarkdownChars > rawMarkdownPreview.length ? '\n\n— preview truncated —\n' : '')}
          </pre>
        </div>
      </div>
    </div>
  );
}

