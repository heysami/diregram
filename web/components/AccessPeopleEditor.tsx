'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AccessPerson, AccessRole } from '@/lib/local-file-store';

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function isValidEmail(s: string) {
  const v = normalizeEmail(s);
  return v.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function dedupePeople(people: AccessPerson[]) {
  const best = new Map<string, AccessRole>();
  people.forEach((p) => {
    const email = normalizeEmail(p.email);
    if (!email) return;
    const prev = best.get(email);
    const role: AccessRole = p.role === 'edit' ? 'edit' : 'view';
    if (!prev || (prev === 'view' && role === 'edit')) best.set(email, role);
  });
  return Array.from(best.entries())
    .map(([email, role]) => ({ email, role }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

type Props = {
  label: string;
  value: AccessPerson[];
  onChange: (next: AccessPerson[]) => void;
  error?: string | null;
  onError?: (msg: string | null) => void;
  compact?: boolean;
};

export function AccessPeopleEditor({ label, value, onChange, error, onError, compact }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccessRole>('view');

  const count = useMemo(() => value.length, [value.length]);

  const add = () => {
    const e = normalizeEmail(email);
    if (!e) return;
    if (!isValidEmail(e)) {
      onError?.('Enter a valid email address.');
      return;
    }
    onError?.(null);
    setEmail('');
    onChange(dedupePeople([...(value || []), { email: e, role }]));
  };

  const remove = (targetEmail: string) => {
    const t = normalizeEmail(targetEmail);
    onChange((value || []).filter((p) => normalizeEmail(p.email) !== t));
  };

  const setPersonRole = (targetEmail: string, nextRole: AccessRole) => {
    const t = normalizeEmail(targetEmail);
    onChange(
      dedupePeople(
        (value || []).map((p) => (normalizeEmail(p.email) === t ? { ...p, role: nextRole } : p)),
      ),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-[11px] opacity-70">{count} people</div>
      </div>

      <div className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}>
        <input
          className="mac-field flex-1 min-w-[220px]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="mac-segmented">
          <button
            type="button"
            className={`mac-seg-btn ${role === 'view' ? 'is-active' : ''}`}
            onClick={() => setRole('view')}
            title="Can view"
          >
            View
          </button>
          <button
            type="button"
            className={`mac-seg-btn ${role === 'edit' ? 'is-active' : ''}`}
            onClick={() => setRole('edit')}
            title="Can edit"
          >
            Edit
          </button>
        </div>
        <button type="button" className="mac-btn flex items-center gap-1.5" onClick={add}>
          <Plus size={14} />
          Add
        </button>
      </div>

      {error ? <div className="text-xs">{error}</div> : null}

      <div className="space-y-2">
        {(value || []).length === 0 ? (
          <div className="text-xs opacity-70">No access list set (open by default).</div>
        ) : (
          (value || []).map((p) => (
            <div key={p.email} className="mac-double-outline px-2 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{p.email}</div>
                <div className="text-[11px] opacity-70">{p.role === 'edit' ? 'Can edit' : 'Can view'}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="mac-segmented">
                  <button
                    type="button"
                    className={`mac-seg-btn ${p.role === 'view' ? 'is-active' : ''}`}
                    onClick={() => setPersonRole(p.email, 'view')}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className={`mac-seg-btn ${p.role === 'edit' ? 'is-active' : ''}`}
                    onClick={() => setPersonRole(p.email, 'edit')}
                  >
                    Edit
                  </button>
                </div>
                <button type="button" className="mac-btn mac-btn--icon-sm" title="Remove" onClick={() => remove(p.email)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
