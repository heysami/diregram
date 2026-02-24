'use client';

import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { X, AlertTriangle } from 'lucide-react';
import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { validateVisionMarkdownImport } from '@/lib/vision/vision-markdown-import-validator';

export function VisionImportModal({ doc, isOpen, onClose }: { doc: Y.Doc; isOpen: boolean; onClose: () => void }) {
  const [markdown, setMarkdown] = useState('');
  const [issues, setIssues] = useState<ReturnType<typeof validateVisionMarkdownImport> | null>(null);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [clearComments, setClearComments] = useState(true);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const currentText = useMemo(() => doc.getText('nexus').toString(), [doc]);
  const hasExistingContent = useMemo(() => currentText.trim().length > 0, [currentText]);

  const close = () => {
    setIssues(null);
    setStep('edit');
    setCopyStatus(null);
    onClose();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied to clipboard.');
      setTimeout(() => setCopyStatus(null), 1200);
    } catch {
      setCopyStatus('Copy failed (clipboard permission).');
      setTimeout(() => setCopyStatus(null), 1500);
    }
  };

  const onValidate = () => {
    const res = validateVisionMarkdownImport(markdown);
    setIssues(res);
    if (res.errors.length === 0) setStep('confirm');
    else setStep('edit');
  };

  const doReplace = () => {
    const yText = doc.getText('nexus');
    const next = normalizeMarkdownNewlines(markdown);
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, next);
      if (clearComments) {
        try {
          const cm = doc.getMap('node-comments-v1');
          cm.set('data', { version: 1, threads: {} });
        } catch {
          // ignore
        }
      }
    });
    close();
  };

  const canReplace = useMemo(() => {
    if (!issues) return false;
    if (issues.errors.length > 0) return false;
    if (!hasExistingContent) return true;
    return currentText.trim() !== markdown.trim();
  }, [currentText, hasExistingContent, issues, markdown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[22000] flex items-center justify-center bg-black/20 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Import Vision markdown"
    >
      <div className="mac-window mac-double-outline w-[1000px] max-w-[92vw] max-h-[90vh] flex flex-col overflow-hidden bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Import vision</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={close} className="mac-btn mac-btn--icon-sm" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto space-y-4">
          <div className="text-[11px] opacity-70">
            Need the AI guidance prompts and checklists? Use <span className="font-semibold">Project → Download … guides + checklists</span>.
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold">Paste Vision markdown</div>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={14}
              className="w-full px-3 py-2 font-mono text-[11px] leading-5 mac-double-outline bg-white"
              placeholder="Paste Vision markdown here…"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] opacity-70">Import will replace the entire Vision markdown (including the visionjson payload).</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] opacity-80 select-none">
                  <input type="checkbox" checked={clearComments} onChange={(e) => setClearComments(e.target.checked)} />
                  Clear comments
                </label>
                <button type="button" onClick={() => setMarkdown('')} className="mac-btn h-8">
                  Clear
                </button>
                <button type="button" onClick={onValidate} className="mac-btn mac-btn--primary h-8">
                  Validate
                </button>
              </div>
            </div>
          </div>

          {issues ? (
            <div className="mac-double-outline p-3 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {issues.errors.length ? <AlertTriangle size={16} className="text-rose-700" /> : <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1" />}
                    <div className="text-[12px] font-semibold">
                      {issues.errors.length
                        ? `Found ${issues.errors.length} error(s) and ${issues.warnings.length} warning(s)`
                        : `No errors. ${issues.warnings.length} warning(s)`}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {issues.errors.map((it, idx) => (
                      <div key={`e-${idx}`} className="text-[12px] text-rose-700">
                        <span className="font-semibold">ERROR</span>: {it.message}
                      </div>
                    ))}
                    {issues.warnings.map((it, idx) => (
                      <div key={`w-${idx}`} className="text-[12px] text-amber-700">
                        <span className="font-semibold">WARN</span>: {it.message}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-2">
                  <button type="button" className="mac-btn h-8" onClick={() => void copy(issues.reportText)} title="Copy the error report for your AI">
                    Copy report
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 'confirm' ? (
            <div className="mac-double-outline bg-white p-3">
              <div className="text-[12px] font-semibold">Ready to {hasExistingContent ? 'replace' : 'import'} Vision markdown</div>
              <div className="mt-1 text-[12px] opacity-70">
                This will overwrite the current Vision document markdown{clearComments ? ' and clear comments' : ''}.
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button type="button" className="mac-btn h-8" onClick={() => setStep('edit')}>
                  Back
                </button>
                <button type="button" className="mac-btn mac-btn--primary h-8 disabled:opacity-40" disabled={!canReplace} onClick={doReplace}>
                  {hasExistingContent ? 'Replace' : 'Import'}
                </button>
              </div>
            </div>
          ) : null}

          {copyStatus ? <div className="text-[11px] opacity-70">{copyStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}
