'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { AlertTriangle, ArrowDown, ArrowUp, X } from 'lucide-react';
import { ensureOpenAiApiKeyWithPrompt } from '@/lib/openai-key-browser';
import { sha256Hex } from '@/lib/diagram-ai-assist-client';
import { validateNexusMarkdownImport } from '@/lib/markdown-import-validator';
import type { ImportValidationIssue } from '@/lib/markdown-import-validator';

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function issueKey(issue: ImportValidationIssue): string {
  return `${normalizeText(issue.code)}|${normalizeText(issue.message)}`;
}

function extractIssueLine(message: string): number | null {
  const text = normalizeText(message);
  const patterns = [/starting at line\s+(\d+)/i, /\bline\s+(\d+)\b/i];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function humanFixHint(issue: ImportValidationIssue): string {
  switch (issue.code) {
    case 'UNCLOSED_CODE_BLOCK':
      return 'A fenced block was opened but not closed. Add a matching closing ``` fence.';
    case 'MISSING_EXPANDED_STATES_BLOCK':
      return 'Add an `expanded-states` fenced JSON block in metadata (`---` section).';
    case 'MISSING_TAG_STORE':
      return 'Add a `tag-store` fenced JSON block in metadata so `<!-- tags:... -->` references are valid.';
    case 'MISSING_UI_SURFACE_TAG':
      return 'Add a ui-surface tag in group `tg-uiSurface` for lines using `<!-- expid:... -->`.';
    default:
      return 'Fix this issue in the local section, then revalidate.';
  }
}

function buildContextSnippet(markdown: string, line: number | null): string {
  if (!line) return '(No line reference in validator message)';
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const idx = Math.max(0, line - 1);
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length - 1, idx + 2);
  const out: string[] = [];
  for (let i = start; i <= end; i += 1) {
    out.push(`${String(i + 1).padStart(4, ' ')} | ${lines[i] || ''}`);
  }
  return out.join('\n');
}

export function MarkdownDiagnosticsModal({
  isOpen,
  onClose,
  doc,
  fileId,
  projectFolderId,
  aiFeaturesEnabled,
  onTrackAsyncJob,
}: {
  isOpen: boolean;
  onClose: () => void;
  doc: Y.Doc;
  fileId?: string | null;
  projectFolderId?: string | null;
  aiFeaturesEnabled?: boolean;
  onTrackAsyncJob?: (input: { id: string; kind: string; title?: string }) => void;
}) {
  const [markdown, setMarkdown] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueSuccess, setQueueSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const yText = doc.getText('nexus');
    const sync = () => setMarkdown(yText.toString());
    sync();
    yText.observe(sync);
    return () => yText.unobserve(sync);
  }, [doc, isOpen]);

  const report = useMemo(() => validateNexusMarkdownImport(markdown), [markdown]);
  const errors = report.errors;
  const warnings = report.warnings;
  const selectedIssue = errors[selectedIndex] || null;
  const selectedIssueLine = extractIssueLine(selectedIssue?.message || '');
  const selectedContext = buildContextSnippet(markdown, selectedIssueLine);

  useEffect(() => {
    if (!errors.length) {
      setSelectedIndex(0);
      return;
    }
    if (selectedIndex >= errors.length) setSelectedIndex(errors.length - 1);
  }, [errors.length, selectedIndex]);

  const goToLine = useCallback((line: number | null) => {
    if (!line) return;
    window.dispatchEvent(new CustomEvent('diregram:nexusEditorNavigateLine', { detail: { line } }));
  }, []);

  const queueAiFix = useCallback(async () => {
    if (!errors.length) {
      setQueueError('No validator errors to fix.');
      return;
    }
    if (!aiFeaturesEnabled || !fileId || !projectFolderId) {
      setQueueError('Diagram AI is available only for synced Supabase projects.');
      return;
    }

    setQueueBusy(true);
    setQueueError(null);
    setQueueSuccess(null);
    try {
      const openaiApiKey = await ensureOpenAiApiKeyWithPrompt();
      if (!openaiApiKey) {
        setQueueError('Missing OpenAI API key.');
        return;
      }
      const baseFileHash = await sha256Hex(markdown);
      const issueKeys = errors.slice(0, 120).map((issue) => issueKey(issue));
      const res = await fetch('/api/ai/diagram-assist/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-openai-api-key': openaiApiKey,
        },
        body: JSON.stringify({
          projectFolderId,
          fileId,
          action: 'markdown_errors_fix',
          selection: {
            baseFileHash,
            issueKeys,
            maxPatches: 12,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setQueueError(String(json.error || `Failed (${res.status})`));
        return;
      }
      const jobId = normalizeText(json.jobId);
      if (!jobId) {
        setQueueError('Missing async job id.');
        return;
      }
      onTrackAsyncJob?.({
        id: jobId,
        kind: 'ai_diagram_assist',
        title: `Diagram AI: markdown errors (${errors.length})`,
      });
      setQueueSuccess('AI markdown-fix job queued. Review proposal in Async Processing.');
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : 'Failed to queue markdown fix job');
    } finally {
      setQueueBusy(false);
    }
  }, [aiFeaturesEnabled, errors, fileId, markdown, onTrackAsyncJob, projectFolderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1400] bg-black/45 flex items-center justify-center p-4">
      <div className="mac-window max-w-6xl w-[96vw] max-h-[92vh] flex flex-col overflow-hidden">
        <div className="mac-titlebar">
          <div className="mac-title">Markdown Diagnostics</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" className="mac-btn" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b text-xs flex items-center justify-between">
          <div className="font-semibold">Errors: {errors.length}</div>
          <div className="opacity-70">Warnings: {warnings.length}</div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(260px,360px)_1fr]">
          <div className="border-r p-3 overflow-auto space-y-2">
            {!errors.length ? (
              <div className="mac-double-outline p-3 text-xs">No markdown validation errors found.</div>
            ) : (
              errors.map((issue, idx) => {
                const line = extractIssueLine(issue.message);
                const active = idx === selectedIndex;
                return (
                  <button
                    key={`${idx}:${issue.code}:${issue.message}`}
                    type="button"
                    className={`w-full text-left border rounded p-2 bg-white text-xs ${active ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <div className="font-semibold">{issue.code}</div>
                    <div className="opacity-70">{line ? `Line ${line}` : 'No line'}</div>
                    <div className="mt-1 line-clamp-2">{issue.message}</div>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-3 overflow-auto text-xs space-y-3">
            {!selectedIssue ? (
              <div className="mac-double-outline p-3">Select an issue to inspect details.</div>
            ) : (
              <>
                <div className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold flex items-center gap-2">
                    <AlertTriangle size={14} />
                    {selectedIssue.code}
                  </div>
                  <div>{selectedIssue.message}</div>
                  <div className="opacity-80">Suggested fix: {humanFixHint(selectedIssue)}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="mac-btn"
                      disabled={!selectedIssueLine}
                      onClick={() => goToLine(selectedIssueLine)}
                    >
                      Go To Line
                    </button>
                    <button
                      type="button"
                      className="mac-btn mac-btn--icon-sm"
                      onClick={() => setSelectedIndex((prev) => (errors.length ? (prev - 1 + errors.length) % errors.length : 0))}
                      disabled={!errors.length}
                      title="Previous issue"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="mac-btn mac-btn--icon-sm"
                      onClick={() => setSelectedIndex((prev) => (errors.length ? (prev + 1) % errors.length : 0))}
                      disabled={!errors.length}
                      title="Next issue"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                </div>

                <div className="mac-double-outline p-3">
                  <div className="font-semibold mb-1">Line Context</div>
                  <pre className="whitespace-pre-wrap bg-white border rounded p-2">{selectedContext}</pre>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-between gap-2 text-xs">
          <div className="opacity-70">AI fix edits only scoped target sections, not whole-file rewrite.</div>
          <div className="flex items-center gap-2">
            <button type="button" className="mac-btn" onClick={onClose} disabled={queueBusy}>
              Close
            </button>
            <button
              type="button"
              className="mac-btn mac-btn--primary"
              disabled={!errors.length || queueBusy || !aiFeaturesEnabled || !fileId || !projectFolderId}
              onClick={() => void queueAiFix()}
              title={!aiFeaturesEnabled || !fileId || !projectFolderId ? 'Available only in synced Supabase projects.' : 'Queue AI section-scoped markdown fix.'}
            >
              {queueBusy ? 'Queueing…' : 'AI Fix Errors'}
            </button>
          </div>
        </div>

        {queueError ? <div className="px-4 pb-3 text-xs text-red-700">{queueError}</div> : null}
        {queueSuccess ? <div className="px-4 pb-3 text-xs text-green-700">{queueSuccess}</div> : null}
      </div>
    </div>
  );
}
