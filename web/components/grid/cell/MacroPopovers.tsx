import { memo, useMemo, useState } from 'react';
import type { GridPersonV1 } from '@/lib/gridjson';

function parseMacroBody(body: string): { head: string; kv: Record<string, string> } {
  const segs = String(body || '').split(';').map((s) => s.trim()).filter(Boolean);
  const head = segs[0] ?? '';
  const kv: Record<string, string> = {};
  segs.slice(1).forEach((s) => {
    const eq = s.indexOf('=');
    if (eq === -1) return;
    const k = s.slice(0, eq).trim();
    const v = s.slice(eq + 1).trim();
    if (k) kv[k] = v;
  });
  return { head, kv };
}

function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const a = (parts[0] || '').slice(0, 1).toUpperCase();
  const b = (parts[1] || parts[0] || '').slice(1, 2).toUpperCase();
  return (a + b).trim() || '?';
}

export const PillsPopover = memo(function PillsPopover({
  body,
  options,
  onApply,
  onClose,
}: {
  body: string;
  options: Array<{ id: string; label: string }>;
  onApply: (nextTags: string[], keepKv: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { head, kv } = parseMacroBody(body);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>(() => head.split(',').map((s) => s.trim()).filter(Boolean));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const add = (label: string) => {
    const t = label.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  };

  return (
    <div className="grid gap-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Tags</div>
        <button type="button" className="mac-btn h-7" onClick={onClose}>
          Close
        </button>
      </div>

      <input
        className="mac-double-outline px-2 py-1 text-[11px] outline-none"
        placeholder="Search or type a new tag…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-red-50 hover:border-red-200"
            title="Click to remove"
            onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
          >
            {t} <span className="opacity-60">×</span>
          </button>
        ))}
        {tags.length === 0 ? <div className="opacity-70">No tags yet.</div> : null}
      </div>

      <div className="grid gap-1 max-h-[180px] overflow-auto">
        {filtered.map((o) => (
          <button key={o.id} type="button" className="mac-btn h-7 text-left" onClick={() => add(o.label)}>
            {o.label}
          </button>
        ))}
        {filtered.length === 0 ? <div className="opacity-70">No matches.</div> : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="mac-btn h-7"
          onClick={() => {
            add(query);
            setQuery('');
          }}
        >
          Add “{query.trim() || '…'}”
        </button>
        <button type="button" className="mac-btn mac-btn--primary h-7" onClick={() => onApply(tags, kv)}>
          Apply
        </button>
      </div>
    </div>
  );
});

export const PeoplePopover = memo(function PeoplePopover({
  body,
  peopleDirectory,
  onApplyTokens,
  onClose,
}: {
  body: string;
  peopleDirectory: GridPersonV1[];
  onApplyTokens: (tokens: string[]) => void;
  onClose: () => void;
}) {
  const { head } = parseMacroBody(body);
  const [query, setQuery] = useState('');
  const [tokens, setTokens] = useState<string[]>(() => head.split(',').map((s) => s.trim()).filter(Boolean));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peopleDirectory;
    return peopleDirectory.filter((p) => p.name.toLowerCase().includes(q));
  }, [peopleDirectory, query]);

  const addToken = (t: string) => {
    const v = t.trim();
    if (!v) return;
    setTokens((prev) => (prev.includes(v) ? prev : [...prev, v]));
  };

  return (
    <div className="grid gap-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">People</div>
        <button type="button" className="mac-btn h-7" onClick={onClose}>
          Close
        </button>
      </div>

      <input
        className="mac-double-outline px-2 py-1 text-[11px] outline-none"
        placeholder="Search or type a name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="flex flex-wrap gap-1">
        {tokens.map((t) => {
          const isId = t.startsWith('@');
          const id = isId ? t.slice(1) : '';
          const p = isId ? peopleDirectory.find((x) => x.id === id) : null;
          const label = p?.name || (isId ? id : t);
          return (
            <button
              key={t}
              type="button"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 hover:bg-red-50 hover:border-red-200"
              title="Click to remove"
              onClick={() => setTokens((prev) => prev.filter((x) => x !== t))}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 text-white text-[9px]">
                {p?.icon ? p.icon : initials(label)}
              </span>
              {label} <span className="opacity-60">×</span>
            </button>
          );
        })}
        {tokens.length === 0 ? <div className="opacity-70">No people yet.</div> : null}
      </div>

      <div className="grid gap-1 max-h-[180px] overflow-auto">
        {filtered.map((p) => (
          <button key={p.id} type="button" className="mac-btn h-7 text-left" onClick={() => addToken(`@${p.id}`)}>
            {p.icon ? `${p.icon} ` : ''}{p.name}
          </button>
        ))}
        {filtered.length === 0 ? <div className="opacity-70">No matches.</div> : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="mac-btn h-7"
          onClick={() => {
            const name = query.trim();
            if (!name) return;
            addToken(name);
            setQuery('');
          }}
        >
          Add “{query.trim() || '…'}”
        </button>
        <button type="button" className="mac-btn mac-btn--primary h-7" onClick={() => onApplyTokens(tokens)}>
          Apply
        </button>
      </div>
    </div>
  );
});

export const DatePopover = memo(function DatePopover({
  body,
  onApply,
  onClose,
}: {
  body: string;
  onApply: (nextBody: string) => void;
  onClose: () => void;
}) {
  const trimmed = body.trim();
  const [start, end] = trimmed.includes('..') ? trimmed.split('..', 2) : [trimmed, ''];
  const [a, setA] = useState(start || '');
  const [b, setB] = useState(end || '');

  return (
    <div className="grid gap-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Date</div>
        <button type="button" className="mac-btn h-7" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid gap-1">
        <label className="opacity-70">Start</label>
        <input type="date" className="mac-double-outline px-2 py-1 text-[11px] outline-none" value={a} onChange={(e) => setA(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <label className="opacity-70">End (optional)</label>
        <input type="date" className="mac-double-outline px-2 py-1 text-[11px] outline-none" value={b} onChange={(e) => setB(e.target.value)} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" className="mac-btn h-7" onClick={() => onApply(a)}>
          Single
        </button>
        <button type="button" className="mac-btn mac-btn--primary h-7" onClick={() => onApply(b ? `${a}..${b}` : a)}>
          Apply
        </button>
      </div>
    </div>
  );
});

