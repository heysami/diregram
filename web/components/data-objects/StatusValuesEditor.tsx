'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * Status values editor (chips) with rename/add/remove.
 * Extracted to keep DataObjectInspectorPanel small and stable.
 */
export function StatusValuesEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (nextValues: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<{ oldValue: string; draft: string } | null>(null);

  const commitRename = (oldValue: string, nextRaw: string) => {
    const nextValue = (nextRaw || '').trim();
    if (!nextValue || nextValue === oldValue) {
      setRenaming(null);
      return;
    }
    const replaced = (values || []).map((v) => (v === oldValue ? nextValue : v));
    const out: string[] = [];
    const seen = new Set<string>();
    replaced.forEach((v) => {
      const t = (v || '').trim();
      if (!t) return;
      if (seen.has(t)) return;
      seen.add(t);
      out.push(t);
    });
    onChange(out);
    setRenaming(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {(values || []).map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px]"
          >
            {renaming?.oldValue === v ? (
              <input
                autoFocus
                value={renaming.draft}
                onChange={(e) => setRenaming((prev) => (prev ? { ...prev, draft: e.target.value } : prev))}
                onBlur={() => commitRename(v, renaming.draft)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  else if (e.key === 'Escape') setRenaming(null);
                }}
                className="h-6 w-28 rounded border border-slate-300 bg-white px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <button
                type="button"
                className="text-slate-700 hover:text-slate-900"
                title="Rename value"
                onClick={() => setRenaming({ oldValue: v, draft: v })}
              >
                {v}
              </button>
            )}
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              title="Remove value"
              onClick={() => onChange((values || []).filter((x) => x !== v))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const raw = draft.trim();
              if (!raw) return;
              const merged = Array.from(new Set([...(values || []), raw]));
              onChange(merged);
              setDraft('');
            } else if (e.key === 'Escape') {
              setDraft('');
            }
          }}
          className="mac-field flex-1"
          placeholder="Add value…"
        />
        <button
          type="button"
          className="h-8 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
          onClick={() => {
            const raw = draft.trim();
            if (!raw) return;
            const merged = Array.from(new Set([...(values || []), raw]));
            onChange(merged);
            setDraft('');
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </div>
  );
}

