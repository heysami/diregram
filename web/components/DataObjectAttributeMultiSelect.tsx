'use client';

import { useMemo, useState } from 'react';
import type { NexusDataObject } from '@/lib/data-object-storage';
import { loadDataObjectAttributes } from '@/lib/data-object-attributes';
import { OBJECT_NAME_ATTR_ID } from '@/lib/data-object-attribute-ids';

type Opt = { id: string; label: string };

export function DataObjectAttributeMultiSelect({
  objectId,
  objects,
  value,
  onChange,
  label = 'Linked attributes',
}: {
  objectId: string;
  objects: NexusDataObject[];
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const [query, setQuery] = useState('');

  const opts = useMemo((): Opt[] => {
    const obj = objects.find((o) => o.id === objectId);
    const attrs = obj ? loadDataObjectAttributes(obj.data) : [];
    const base: Opt[] = [{ id: OBJECT_NAME_ATTR_ID, label: 'Object name' }];
    const more: Opt[] = attrs
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ id: a.id, label: a.name }));
    return [...base, ...more];
  }, [objects, objectId]);

  const selected = useMemo(() => new Set((value || []).map((x) => x.trim()).filter(Boolean)), [value]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return opts;
    return opts.filter((o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q));
  }, [opts, q]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next.values()));
  };

  const selectAll = () => onChange(opts.map((o) => o.id));
  const clear = () => onChange([]);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          <button type="button" className="text-[11px] text-gray-600 hover:text-gray-900" onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="text-[11px] text-gray-600 hover:text-gray-900" onClick={clear}>
            Clear
          </button>
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search attributes…"
        className="mac-field w-full"
      />

      <div className="mt-2 max-h-[180px] overflow-auto rounded-md border border-gray-200 bg-white">
        {filtered.map((o) => (
          <label key={o.id} className="flex items-center gap-2 px-2 py-1 text-[12px] border-b border-gray-100 last:border-b-0">
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
            <span className="truncate" title={o.id}>
              {o.label} <span className="text-[11px] text-gray-400">· {o.id}</span>
            </span>
          </label>
        ))}
        {!filtered.length ? <div className="px-2 py-2 text-xs text-gray-500">No matches.</div> : null}
      </div>

      <div className="mt-1 text-[10px] text-gray-500">
        Selected: <span className="font-medium">{selected.size}</span>
      </div>
    </div>
  );
}

