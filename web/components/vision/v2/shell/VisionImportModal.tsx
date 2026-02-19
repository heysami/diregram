'use client';

import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { X, AlertTriangle } from 'lucide-react';
import { normalizeMarkdownNewlines } from '@/lib/markdown-normalize';
import { VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES, VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE } from '@/lib/ai-guides/vision-guidance';
import { POST_GEN_CHECKLIST_VISION_IMPORT } from '@/lib/ai-checklists/post-generation-vision';
import { POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY } from '@/lib/ai-checklists/post-generation-vision-component-library';
import { validateVisionMarkdownImport } from '@/lib/vision/vision-markdown-import-validator';
import { downloadTextFile } from '@/lib/client-download';
import { CollapsibleCopyPanel } from '@/components/import/CollapsibleCopyPanel';

export function VisionImportModal({ doc, isOpen, onClose }: { doc: Y.Doc; isOpen: boolean; onClose: () => void }) {
  const [markdown, setMarkdown] = useState('');
  const [issues, setIssues] = useState<ReturnType<typeof validateVisionMarkdownImport> | null>(null);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [clearComments, setClearComments] = useState(true);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const currentText = useMemo(() => doc.getText('nexus').toString(), [doc]);
  const hasExistingContent = useMemo(() => currentText.trim().length > 0, [currentText]);

  const close = () => {
    setIssues(null);
    setStep('edit');
    setCopyStatus(null);
    setDownloadStatus(null);
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

  const downloadBundleSingleFile = () => {
    const bundle = [
      '# Vision — AI guidance + checklists (bundle)',
      '',
      '## Prompt A — design system resources provided',
      VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES,
      '',
      '## Prompt B — discover from website',
      VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE,
      '',
      '## Post-generation checklist — Vision importability',
      POST_GEN_CHECKLIST_VISION_IMPORT,
      '',
      '## Post-generation checklist — Vision component library',
      POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY,
      '',
    ].join('\n');
    downloadTextFile('vision-guides-and-checklists-bundle.md', bundle);
    setDownloadStatus('Triggered 1 download (bundle).');
    setTimeout(() => setDownloadStatus(null), 4000);
  };

  const onDownloadAllGuides = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadStatus('Starting downloads… (your browser may ask to allow multiple downloads)');
    try {
      const files: Array<{ name: string; content: string }> = [
        { name: 'vision-ai-guidance-prompt-a-from-resources.md', content: VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES },
        { name: 'vision-ai-guidance-prompt-b-from-website.md', content: VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE },
        { name: 'post-generation-checklist-vision-import.md', content: POST_GEN_CHECKLIST_VISION_IMPORT },
        { name: 'post-generation-checklist-vision-component-library.md', content: POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY },
      ];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        downloadTextFile(f.name, f.content);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 120));
      }
      setDownloadStatus(`Triggered ${files.length} downloads.`);
      setTimeout(() => setDownloadStatus(null), 4000);
    } catch {
      setDownloadStatus('Failed to trigger downloads.');
      setTimeout(() => setDownloadStatus(null), 4000);
    } finally {
      setIsDownloading(false);
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
    <div className="fixed inset-0 z-[22000] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-[min(1000px,92vw)] max-h-[90vh] flex flex-col overflow-hidden bg-white border border-slate-200 shadow-xl">
        <div className="h-10 px-2 border-b flex items-center justify-between gap-2 bg-white">
          <div className="text-sm font-semibold">Import Vision</div>
          <button type="button" onClick={close} className="h-7 w-7 border bg-white flex items-center justify-center" title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-auto space-y-4">
          <CollapsibleCopyPanel
            title="Vision AI guidance prompt A (design system resources provided)"
            description="Use when you already have design system docs/tokens. Generates an importable Vision skeleton plus an SVG component library."
            copyLabel="Copy"
            textToCopy={VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES}
            childrenText={VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES}
            copy={copy}
          />

          <CollapsibleCopyPanel
            title="Vision AI guidance prompt B (discover from website)"
            description="Use when you need the AI to find the design system from the website (or infer from live UI), then produce SVG components."
            copyLabel="Copy"
            textToCopy={VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE}
            childrenText={VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE}
            copy={copy}
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={downloadBundleSingleFile}
              title="Download a single bundle file (most reliable)."
            >
              Download bundle (single file)
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md border text-[12px] font-semibold ${
                isDownloading ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              onClick={onDownloadAllGuides}
              disabled={isDownloading}
              title="Downloads multiple files (your browser may prompt to allow multiple downloads)."
            >
              {isDownloading ? 'Downloading…' : 'Download individual files'}
            </button>
            <div className="text-[11px] text-slate-600">
              Some browsers block multiple downloads; use the single-file bundle if that happens.
            </div>
          </div>
          {downloadStatus ? <div className="text-[11px] text-slate-600">{downloadStatus}</div> : null}

          <CollapsibleCopyPanel
            title="Post-generation checklist — Vision importability"
            description="Checks nexus-doc + visionjson validity and common freezing pitfalls."
            copyLabel="Copy"
            textToCopy={POST_GEN_CHECKLIST_VISION_IMPORT}
            childrenText={POST_GEN_CHECKLIST_VISION_IMPORT}
            copy={copy}
          />

          <CollapsibleCopyPanel
            title="Post-generation checklist — Vision component library"
            description="Checks token sourcing, component/state coverage, and SVG editability."
            copyLabel="Copy"
            textToCopy={POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY}
            childrenText={POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY}
            copy={copy}
          />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Paste Vision markdown</div>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={14}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] leading-5 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Paste Vision markdown here…"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-500">Import will replace the entire Vision markdown (including the visionjson payload).</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[11px] text-slate-600 select-none">
                  <input type="checkbox" checked={clearComments} onChange={(e) => setClearComments(e.target.checked)} />
                  Clear comments
                </label>
                <button
                  type="button"
                  onClick={() => setMarkdown('')}
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={onValidate}
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700"
                >
                  Validate
                </button>
              </div>
            </div>
          </div>

          {issues ? (
            <div className={`rounded-lg border p-3 ${issues.errors.length ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {issues.errors.length ? <AlertTriangle size={16} className="text-red-700" /> : <div className="w-2 h-2 rounded-full bg-green-600 mt-1" />}
                    <div className="text-[12px] font-semibold text-slate-900">
                      {issues.errors.length
                        ? `Found ${issues.errors.length} error(s) and ${issues.warnings.length} warning(s)`
                        : `No errors. ${issues.warnings.length} warning(s)`}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {issues.errors.map((it, idx) => (
                      <div key={`e-${idx}`} className="text-[12px] text-red-700">
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
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void copy(issues.reportText)}
                    title="Copy the error report for your AI"
                  >
                    Copy report
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {step === 'confirm' ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[12px] font-semibold text-slate-900">Ready to {hasExistingContent ? 'replace' : 'import'} Vision markdown</div>
              <div className="mt-1 text-[12px] text-slate-600">
                This will overwrite the current Vision document markdown{clearComments ? ' and clear comments' : ''}.
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setStep('edit')}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-[12px] font-semibold ${canReplace ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-500'}`}
                  disabled={!canReplace}
                  onClick={doReplace}
                >
                  {hasExistingContent ? 'Replace' : 'Import'}
                </button>
              </div>
            </div>
          ) : null}

          {copyStatus ? <div className="text-[11px] text-slate-600">{copyStatus}</div> : null}
        </div>
      </div>
    </div>
  );
}

