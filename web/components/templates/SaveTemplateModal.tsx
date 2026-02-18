'use client';

import { useEffect, useMemo, useState } from 'react';

export type TemplateSaveScope = 'project' | 'account';

export function SaveTemplateModal({
  open,
  title = 'Save template',
  defaultName,
  defaultScope = 'project',
  onClose,
  onSave,
}: {
  open: boolean;
  title?: string;
  defaultName: string;
  defaultScope?: TemplateSaveScope;
  onClose: () => void;
  onSave: (res: { name: string; scope: TemplateSaveScope }) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TemplateSaveScope>('project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(String(defaultName || '').trim() || 'Template');
    setScope(defaultScope);
    setSaving(false);
    setError(null);
  }, [defaultName, defaultScope, open]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!String(name || '').trim()) return false;
    return true;
  }, [name, saving]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mac-window mac-double-outline w-[520px] max-w-[96vw] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">{title}</div>
        </div>

        <div className="p-4 space-y-3">
          <label className="block">
            <div className="text-[11px] opacity-70 mb-1">Template name</div>
            <input className="mac-field w-full h-9" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>

          <label className="block">
            <div className="text-[11px] opacity-70 mb-1">Save to</div>
            <select className="mac-field w-full h-9" value={scope} onChange={(e) => setScope(e.target.value as TemplateSaveScope)}>
              <option value="project">This project</option>
              <option value="account">Account</option>
            </select>
          </label>

          {error ? <div className="text-xs text-red-700">{error}</div> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" className="mac-btn h-8" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="mac-btn mac-btn--primary h-8 disabled:opacity-50"
              disabled={!canSave}
              onClick={async () => {
                setError(null);
                const trimmed = String(name || '').trim();
                if (!trimmed) return setError('Template name is required.');
                try {
                  setSaving(true);
                  await onSave({ name: trimmed, scope });
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed to save template.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

