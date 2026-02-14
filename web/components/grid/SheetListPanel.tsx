'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FilePlus, Pencil, Trash2 } from 'lucide-react';
import type { GridDoc, GridSheetV1 } from '@/lib/gridjson';
import { createDefaultSheet } from '@/lib/grid/sheetFactory';

function nextSheetId(existing: GridSheetV1[]): string {
  let max = 0;
  existing.forEach((s) => {
    const m = String(s.id || '').match(/sheet-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `sheet-${max + 1}`;
}

export function SheetListPanel({ doc, onChange }: { doc: GridDoc; onChange: (next: GridDoc) => void }) {
  const sheets = doc.sheets || [];
  const activeId = doc.activeSheetId;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commitRename = () => {
    if (!renamingId) return;
    const name = draft.trim() || 'Sheet';
    onChange({
      ...doc,
      sheets: sheets.map((s) => (s.id === renamingId ? { ...s, name } : s)),
    });
    setRenamingId(null);
    setDraft('');
  };

  return (
    <div className="w-[220px] border-r bg-white flex flex-col">
      <div className="mac-titlebar">
        <div className="mac-title">Sheets</div>
      </div>
      <div className="mac-toolstrip justify-between">
        <div className="text-[11px] opacity-70">Multi-sheet</div>
        <button
          type="button"
          className="h-6 w-6 border flex items-center justify-center"
          title="Add sheet"
          onClick={() => {
            const id = nextSheetId(sheets);
            const nextSheet = createDefaultSheet({ id, name: `Sheet ${sheets.length + 1}`, mode: 'spreadsheet' });
            onChange({ ...doc, activeSheetId: id, sheets: [...sheets, nextSheet] });
          }}
        >
          <FilePlus size={14} />
        </button>
      </div>

      <div className="p-2 overflow-auto flex-1">
        {sheets.length === 0 ? <div className="text-xs opacity-70 p-2">No sheets.</div> : null}
        {sheets.map((s, idx) => {
          const active = s.id === activeId;
          return (
            <div key={s.id} className={`mac-double-outline mb-2 ${active ? 'mac-shadow-hard' : ''}`}>
              <div className="p-2 flex items-center gap-2">
                {renamingId === s.id ? (
                  <input
                    className="mac-field h-7 text-xs flex-1"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenamingId(null);
                        setDraft('');
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left text-xs font-semibold truncate flex-1"
                    onClick={() => onChange({ ...doc, activeSheetId: s.id })}
                    title="Open sheet"
                  >
                    {s.name}
                  </button>
                )}
                <button
                  type="button"
                  className="h-7 w-7 border flex items-center justify-center bg-white"
                  title="Rename"
                  onClick={() => {
                    setRenamingId(s.id);
                    setDraft(s.name);
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border flex items-center justify-center bg-white"
                  title="Delete"
                  disabled={sheets.length <= 1}
                  onClick={() => {
                    if (sheets.length <= 1) return;
                    const nextSheets = sheets.filter((x) => x.id !== s.id);
                    const nextActive = active ? nextSheets[Math.max(0, idx - 1)]?.id || nextSheets[0].id : activeId;
                    onChange({ ...doc, activeSheetId: nextActive, sheets: nextSheets });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="px-2 pb-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  className="h-7 w-7 border flex items-center justify-center bg-white"
                  title="Move up"
                  disabled={idx === 0}
                  onClick={() => {
                    if (idx === 0) return;
                    const next = sheets.slice();
                    const tmp = next[idx - 1];
                    next[idx - 1] = next[idx];
                    next[idx] = tmp;
                    onChange({ ...doc, sheets: next });
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="h-7 w-7 border flex items-center justify-center bg-white"
                  title="Move down"
                  disabled={idx === sheets.length - 1}
                  onClick={() => {
                    if (idx === sheets.length - 1) return;
                    const next = sheets.slice();
                    const tmp = next[idx + 1];
                    next[idx + 1] = next[idx];
                    next[idx] = tmp;
                    onChange({ ...doc, sheets: next });
                  }}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

