'use client';

import { useEffect, useMemo, useState } from 'react';
import type { DocKind } from '@/lib/doc-kinds';
import {
  readTemplateHeader,
  renderTemplatePayload,
  type NexusTemplateHeader,
  type TemplateTargetKind,
} from '@/lib/nexus-template';
import { buildTemplateVarDefaults, computeEffectiveTemplateVars } from '@/lib/template-vars';
import { TemplateRenderedPreview } from '@/components/templates/TemplateRenderedPreview';

export type WorkspaceFileLite = { id: string; name: string; kind: DocKind };

type Props = {
  open: boolean;
  title?: string;
  files: WorkspaceFileLite[];
  loadMarkdown: (fileId: string) => Promise<string>;
  scope?: { value: string; options: Array<{ id: string; label: string }>; onChange: (next: string) => void };
  onClose: () => void;
  onCreate: (res: { name: string; kind: TemplateTargetKind; content: string }) => Promise<void> | void;
};

export function NewFromTemplateModal({ open, title = 'New from template', files, loadMarkdown, scope, onClose, onCreate }: Props) {
  const [step, setStep] = useState<'pick' | 'configure'>('pick');
  const [q, setQ] = useState('');
  const [templateFileId, setTemplateFileId] = useState<string | null>(null);
  const [loadingMd, setLoadingMd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [header, setHeader] = useState<NexusTemplateHeader | null>(null);
  const [payload, setPayload] = useState<string>('');

  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState<string>('New file');

  // Prevent scroll-chaining to the underlying editor/canvas while the modal is open.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const effectiveVars = useMemo(() => {
    return computeEffectiveTemplateVars(header, payload);
  }, [header, payload]);

  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setQ('');
    setTemplateFileId(null);
    setLoadingMd(false);
    setError(null);
    setHeader(null);
    setPayload('');
    setVarValues({});
    setNewName('New file');
  }, [open]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = files.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!qq) return base;
    return base.filter((f) => f.name.toLowerCase().includes(qq) || f.id.toLowerCase().includes(qq));
  }, [files, q]);

  const rendered = useMemo(() => renderTemplatePayload(payload, varValues), [payload, varValues]);

  const canApply = useMemo(() => {
    if (!header) return false;
    for (const v of effectiveVars) {
      const val = String(varValues[v.name] ?? '').trim();
      if (v.required && !val) return false;
    }
    return true;
  }, [effectiveVars, header, varValues]);

  const loadTemplate = async (fileId: string) => {
    setError(null);
    setLoadingMd(true);
    try {
      const md = await loadMarkdown(fileId);
      const { header: h, rest } = readTemplateHeader(md);
      if (!h) {
        setHeader(null);
        setPayload('');
        setError('Selected file is not a valid template. Add a ```nexus-template JSON header at the top.');
        return;
      }
      setHeader(h);
      setPayload(rest);
      setVarValues(buildTemplateVarDefaults(computeEffectiveTemplateVars(h, rest)));
      setNewName(h.name || 'New file');
      setStep('configure');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load template.');
    } finally {
      setLoadingMd(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[980px] max-w-[98vw] max-h-[92vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">{title}</div>
        </div>

        <div className="p-3 border-b bg-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] opacity-70">Template</div>
            <div className="text-sm font-semibold truncate">
              {header ? header.name : templateFileId ? templateFileId : 'Select a template file…'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {scope && scope.options.length ? (
              <select
                className="mac-field h-8"
                value={scope.value}
                onChange={(e) => {
                  scope.onChange(e.target.value);
                  setStep('pick');
                  setQ('');
                  setTemplateFileId(null);
                  setLoadingMd(false);
                  setError(null);
                  setHeader(null);
                  setPayload('');
                  setVarValues({});
                  setNewName('New file');
                }}
                title="Template library"
              >
                {scope.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
            {step === 'configure' ? (
              <button type="button" className="mac-btn h-8" onClick={() => setStep('pick')} disabled={loadingMd}>
                Change…
              </button>
            ) : null}
            <button type="button" className="mac-btn h-8" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="overflow-auto overscroll-contain max-h-[calc(92vh-124px)]">
          {step === 'pick' ? (
            <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              <input className="mac-field h-8 flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" />
              <div className="text-xs opacity-70">{filtered.length} files</div>
            </div>

            {error ? <div className="text-xs text-red-700">{error}</div> : null}
            {loadingMd ? <div className="text-xs text-slate-600">Loading…</div> : null}

            <div className="max-h-[62vh] overflow-auto rounded border border-slate-200">
              {filtered.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                  onClick={() => {
                    setTemplateFileId(f.id);
                    void loadTemplate(f.id);
                  }}
                  title={f.id}
                >
                  <div className="font-semibold truncate">{f.name}</div>
                  <div className="font-mono text-[11px] opacity-70 truncate">
                    {f.kind} · {f.id}
                  </div>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-500">
              A file is considered a template if it starts with a <span className="font-mono">```nexus-template</span> JSON block.
            </div>
            </div>
          ) : (
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-3">
              {header ? (
                <div className="rounded border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold mb-1">Output</div>
                  <div className="text-[11px] opacity-80">
                    kind: <span className="font-mono">{header.targetKind}</span> · mode:{' '}
                    <span className="font-mono">{header.mode}</span>
                  </div>
                  {header.description ? <div className="mt-2 text-xs opacity-80">{header.description}</div> : null}
                </div>
              ) : null}

              <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
                <div className="text-xs font-semibold">New file name</div>
                <input className="mac-field w-full h-9" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="File name" />
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
                <div className="text-xs font-semibold">Variables</div>
                {effectiveVars.length === 0 ? (
                  <div className="text-xs opacity-70">No variables.</div>
                ) : (
                  <div className="space-y-2">
                    {effectiveVars.map((v) => {
                      const val = String(varValues[v.name] ?? '');
                      const label = v.label || v.name;
                      return (
                        <label key={v.name} className="block">
                          <div className="text-[11px] opacity-70 mb-1">
                            {label} {v.required ? <span className="text-red-600">*</span> : null}
                          </div>
                          <input
                            className="mac-field w-full h-9"
                            value={val}
                            onChange={(e) => setVarValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                            placeholder={v.default ?? ''}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {error ? <div className="text-xs text-red-700">{error}</div> : null}

              <div className="flex items-center justify-end gap-2">
                <button type="button" className="mac-btn h-8" onClick={() => setStep('pick')} disabled={loadingMd}>
                  Back
                </button>
                <button
                  type="button"
                  className="mac-btn mac-btn--primary h-8 disabled:opacity-50"
                  disabled={!header || loadingMd || !canApply}
                  onClick={async () => {
                    if (!header) return;
                    setError(null);
                    const name = newName.trim();
                    if (!name) return setError('File name is required.');
                    try {
                      await onCreate({ name, kind: header.targetKind, content: rendered });
                      onClose();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to create file.');
                    }
                  }}
                  title={!canApply ? 'Fill required variables' : 'Create file'}
                >
                  Create
                </button>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white overflow-hidden">
              <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">Preview</div>
              <div className="p-3 max-h-[74vh] overflow-auto">
                <TemplateRenderedPreview header={header} rendered={rendered} heightPx={420} />
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

