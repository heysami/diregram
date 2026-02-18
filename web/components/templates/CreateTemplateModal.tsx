'use client';

import { useEffect, useMemo, useState } from 'react';
import { TemplateRenderedPreview } from '@/components/templates/TemplateRenderedPreview';
import type { DocKind } from '@/lib/doc-kinds';
import { makeStarterGridMarkdown } from '@/lib/grid-starter';
import { makeStarterNoteMarkdown } from '@/lib/note-starter';
import { makeStarterVisionMarkdown } from '@/lib/vision-starter';
import {
  buildTemplateHeaderBlock,
  renderTemplatePayload,
  type NexusTemplateHeader,
  type NexusTemplateVarV1,
  type TemplateTargetKind,
} from '@/lib/nexus-template';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreateTemplateFile: (res: { name: string; kind: DocKind; content: string }) => Promise<void> | void;
};

function defaultPayloadForTargetKind(kind: TemplateTargetKind): string {
  if (kind === 'grid') return makeStarterGridMarkdown();
  if (kind === 'vision') return makeStarterVisionMarkdown();
  if (kind === 'note') return makeStarterNoteMarkdown();
  // diagram: start with a minimal tree snippet or blank starter
  return 'Root\n';
}

export function CreateTemplateModal({ open, onClose, onCreateTemplateFile }: Props) {
  const [templateName, setTemplateName] = useState('New Template');
  const [description, setDescription] = useState('');
  const [targetKind, setTargetKind] = useState<TemplateTargetKind>('note');
  const [mode, setMode] = useState<'createFile' | 'appendFragment'>('createFile');
  const [fragmentKind, setFragmentKind] = useState('diagramTreeSnippet');
  const [vars, setVars] = useState<NexusTemplateVarV1[]>([{ name: 'item', label: 'Item', default: 'Application', required: true }]);
  const [payload, setPayload] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTemplateName('New Template');
    setDescription('');
    setTargetKind('note');
    setMode('createFile');
    setFragmentKind('diagramTreeSnippet');
    setVars([{ name: 'item', label: 'Item', default: 'Application', required: true }]);
    setPayload(defaultPayloadForTargetKind('note'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPayload(defaultPayloadForTargetKind(targetKind));
  }, [open, targetKind]);

  const header: NexusTemplateHeader = useMemo(() => {
    const base: NexusTemplateHeader = {
      version: 1,
      name: templateName.trim() || 'Template',
      targetKind,
      mode,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(mode === 'appendFragment' ? { fragmentKind: fragmentKind.trim() || 'fragment' } : {}),
      vars: vars
        .map((v) => ({
          name: String(v.name || '').trim(),
          ...(v.label ? { label: String(v.label) } : {}),
          ...(v.default !== undefined ? { default: String(v.default) } : {}),
          ...(v.required ? { required: true } : {}),
        }))
        .filter((v) => v.name),
    };
    return base;
  }, [templateName, description, targetKind, mode, fragmentKind, vars]);

  const content = useMemo(() => {
    const block = buildTemplateHeaderBlock(header);
    return block + String(payload || '');
  }, [header, payload]);

  const varsPreview = useMemo(() => {
    const out: Record<string, string> = {};
    (header.vars || []).forEach((v) => {
      out[v.name] = v.default ?? '';
    });
    return out;
  }, [header.vars]);

  const renderedPreview = useMemo(() => renderTemplatePayload(payload, varsPreview), [payload, varsPreview]);

  const canCreate = useMemo(() => {
    if (!header.name.trim()) return false;
    if (header.mode === 'appendFragment' && !header.fragmentKind) return false;
    if (header.targetKind === 'test') return false;
    return true;
  }, [header]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[4600] flex items-center justify-center bg-black/20"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mac-window mac-double-outline w-[1080px] max-w-[98vw] max-h-[92vh] overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Create template</div>
        </div>

        <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-3">
            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Template info</div>
              <label className="block">
                <div className="text-[11px] opacity-70 mb-1">Name</div>
                <input className="mac-field w-full h-9" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </label>
              <label className="block">
                <div className="text-[11px] opacity-70 mb-1">Description (optional)</div>
                <input className="mac-field w-full h-9" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Target</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <div className="text-[11px] opacity-70 mb-1">Target kind</div>
                  <select className="mac-field w-full h-9" value={targetKind} onChange={(e) => setTargetKind(e.target.value as any)}>
                    <option value="note">note</option>
                    <option value="grid">grid</option>
                    <option value="vision">vision</option>
                    <option value="diagram">diagram</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-[11px] opacity-70 mb-1">Mode</div>
                  <select className="mac-field w-full h-9" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                    <option value="createFile">createFile</option>
                    <option value="appendFragment">appendFragment</option>
                  </select>
                </label>
              </div>
              {mode === 'appendFragment' ? (
                <label className="block">
                  <div className="text-[11px] opacity-70 mb-1">Fragment kind</div>
                  <input className="mac-field w-full h-9" value={fragmentKind} onChange={(e) => setFragmentKind(e.target.value)} />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Example: <span className="font-mono">diagramTreeSnippet</span>, <span className="font-mono">noteBlocks</span>,{' '}
                    <span className="font-mono">gridTable</span>
                  </div>
                </label>
              ) : null}
            </div>

            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Variables</div>
              <div className="space-y-2">
                {vars.map((v, idx) => (
                  <div key={idx} className="grid grid-cols-6 gap-2 items-center">
                    <input
                      className="mac-field h-9 col-span-2"
                      value={v.name}
                      onChange={(e) =>
                        setVars((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="name (e.g. item)"
                    />
                    <input
                      className="mac-field h-9 col-span-2"
                      value={v.label || ''}
                      onChange={(e) =>
                        setVars((prev) => prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))
                      }
                      placeholder="label (optional)"
                    />
                    <input
                      className="mac-field h-9 col-span-1"
                      value={v.default ?? ''}
                      onChange={(e) =>
                        setVars((prev) => prev.map((x, i) => (i === idx ? { ...x, default: e.target.value } : x)))
                      }
                      placeholder="default"
                    />
                    <label className="text-[11px] flex items-center gap-2 col-span-1">
                      <input
                        type="checkbox"
                        checked={Boolean(v.required)}
                        onChange={(e) =>
                          setVars((prev) => prev.map((x, i) => (i === idx ? { ...x, required: e.target.checked } : x)))
                        }
                      />
                      required
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="mac-btn h-8"
                  onClick={() => setVars((prev) => [...prev, { name: '', label: '', default: '', required: false }])}
                >
                  + Variable
                </button>
                <button
                  type="button"
                  className="mac-btn h-8"
                  onClick={() => setVars((prev) => (prev.length ? prev.slice(0, -1) : prev))}
                  disabled={vars.length === 0}
                >
                  Remove last
                </button>
              </div>
              <div className="text-[11px] text-slate-500">
                Use placeholders like: <span className="font-mono">{'{{item}}'}</span> or <span className="font-mono">--var-[item]</span>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Payload (what gets created/appended)</div>
              <textarea
                className="w-full h-[220px] font-mono text-[12px] outline-none border border-slate-200 p-2"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
              />
              <div className="text-[11px] text-slate-500">
                Tip: for <span className="font-mono">createFile</span>, this should be the full markdown of the new file.
              </div>
            </div>

            {error ? <div className="text-xs text-red-700">{error}</div> : null}

            <div className="flex items-center justify-end gap-2">
              <button type="button" className="mac-btn h-8" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="mac-btn mac-btn--primary h-8 disabled:opacity-50"
                disabled={!canCreate}
                onClick={async () => {
                  setError(null);
                  const name = (templateName || '').trim();
                  if (!name) return setError('Template name is required.');
                  if (targetKind === 'test') return setError('Target kind "test" is not supported yet.');
                  try {
                    await onCreateTemplateFile({ name, kind: 'template', content });
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed to create template file.');
                  }
                }}
              >
                Create template file
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">Preview (rendered output)</div>
            <div className="p-3 max-h-[84vh] overflow-auto">
              <TemplateRenderedPreview header={header} rendered={renderedPreview} heightPx={420} />
              <div className="mt-6">
                <div className="text-[11px] font-semibold opacity-70">Stored template file content (advanced)</div>
                <pre className="mt-2 text-[11px] whitespace-pre-wrap leading-snug opacity-80 border border-slate-200 p-2">{content}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

