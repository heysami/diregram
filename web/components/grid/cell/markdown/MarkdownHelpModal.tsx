import { GRID_MARKDOWN_SYNTAX } from '@/components/grid/cell/markdown/markdownSyntax';

export function MarkdownHelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Markdown help">
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="mac-window w-full max-w-[720px] max-h-[80vh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
          <div className="mac-titlebar">
            <div className="mac-title">Markdown / formatting help</div>
            <div className="flex-1" />
            <button type="button" className="mac-btn h-7" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="p-3 overflow-auto text-[12px] flex-1">
            <div className="text-[11px] opacity-70 mb-2">
              Tip: these tokens work in any cell (outside code blocks). Most widgets are clickable.
            </div>
            <div className="grid grid-cols-1 gap-3">
              {GRID_MARKDOWN_SYNTAX.map((e) => (
                <div key={e.id} className="border border-slate-200 rounded p-2 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{e.label}</div>
                    {e.clickable ? <div className="text-[10px] opacity-70">clickable</div> : null}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">{e.description}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.examples.map((ex) => (
                      <code key={ex} className="px-1.5 py-1 rounded bg-slate-100 border border-slate-200 font-mono text-[11px]">
                        {ex}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

