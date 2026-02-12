'use client';

import type { NexusDataObject } from '@/lib/data-object-storage';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  objects: NexusDataObject[];
  query: string;
  onQueryChange: (q: string) => void;
  draftNames: Record<string, string>;
  onDraftNameChange: (id: string, name: string) => void;
  onCommitName: (id: string) => void;
};

export function ManageDataObjectsModal({
  open,
  onClose,
  objects,
  query,
  onQueryChange,
  draftNames,
  onDraftNameChange,
  onCommitName,
}: Props) {
  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = objects
    .slice()
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
    .filter((o) => {
      if (!q) return true;
      return o.id.toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q);
    });

  return (
    <div className="absolute inset-0 z-40">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute top-16 left-4 w-[520px] max-w-[calc(100vw-2rem)] overflow-hidden mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">Manage data objects</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name or id…"
            className="mac-field w-full"
          />
        </div>

        <div className="max-h-[60vh] overflow-auto">
          {filtered.map((o) => (
            <div key={o.id} className="px-4 py-2 border-b border-gray-50">
              <div className="text-[11px] text-gray-500">{o.id}</div>
              <input
                value={draftNames[o.id] ?? o.name}
                onChange={(e) => onDraftNameChange(o.id, e.target.value)}
                onBlur={() => onCommitName(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    onDraftNameChange(o.id, o.name);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className="mac-field mt-1 w-full"
              />
            </div>
          ))}

          {objects.length === 0 ? <div className="px-4 py-4 text-sm text-gray-500">No data objects yet.</div> : null}
          {objects.length > 0 && filtered.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-500">No matches.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

