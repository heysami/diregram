import { useEffect, useMemo, useState } from 'react';

export type MarkdownDocView = { id: string; label: string; text: string };

export function MarkdownDocModal({
  isOpen,
  title,
  views,
  initialViewId,
  onClose,
}: {
  isOpen: boolean;
  title?: string;
  views: MarkdownDocView[];
  initialViewId?: string;
  onClose: () => void;
}) {
  const [viewId, setViewId] = useState<string>('');
  const [wrap, setWrap] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const nextId = initialViewId || views[0]?.id || '';
    setViewId(nextId);
  }, [isOpen, initialViewId, views]);

  const current = useMemo(() => views.find((v) => v.id === viewId) || views[0] || null, [views, viewId]);
  const text = String(current?.text || '');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Markdown viewer">
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div
          className={`mac-window w-full flex flex-col overflow-hidden ${fullscreen ? 'max-w-none max-h-none' : 'max-w-[1100px] max-h-[85vh]'}`}
          style={fullscreen ? { width: '96vw', height: '92vh' } : undefined}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mac-titlebar">
            <div className="mac-title">{title || 'Markdown / JSON'}</div>
            <div className="flex items-center gap-2 ml-2">
              <select
                className="mac-btn h-7"
                value={viewId}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => setViewId(e.target.value)}
                title="Select view"
              >
                {views.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1" />
            <button type="button" className="mac-btn h-7" onClick={() => setWrap((v) => !v)} title="Toggle line wrap">
              {wrap ? 'No wrap' : 'Wrap'}
            </button>
            <button type="button" className="mac-btn h-7" onClick={() => setFullscreen((v) => !v)} title="Toggle fullscreen">
              {fullscreen ? 'Window' : 'Fullscreen'}
            </button>
            <button
              type="button"
              className="mac-btn h-7"
              onClick={() => {
                navigator.clipboard?.writeText(text).catch(() => {});
              }}
              title="Copy current view to clipboard"
            >
              Copy
            </button>
            <button type="button" className="mac-btn h-7" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="p-2 flex-1 overflow-hidden">
            <textarea
              readOnly
              value={text}
              className={`w-full h-full outline-none font-mono text-[12px] leading-snug bg-white text-slate-900 border border-slate-200 rounded p-2 ${
                wrap ? 'whitespace-pre-wrap' : 'whitespace-pre'
              }`}
              spellCheck={false}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

