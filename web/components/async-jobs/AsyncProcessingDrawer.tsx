'use client';

import { useMemo, useState } from 'react';
import type { AsyncTrackedJob } from '@/hooks/use-async-job-queue';

function statusLabel(status: AsyncTrackedJob['status']) {
  if (status === 'queued') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'succeeded') return 'Succeeded';
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'cancel_requested') return 'Canceling';
  return status;
}

function isTerminal(status: AsyncTrackedJob['status']) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function getCreatedFiles(result: Record<string, unknown>): Array<{ id: string; name: string }> {
  const raw = result.createdFiles;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim() || 'Untitled',
    }))
    .filter((item) => Boolean(item.id));
}

export function AsyncProcessingDrawer({
  jobs,
  onCancelJob,
  onRemoveJob,
  onClearFinished,
  onApplyGridRuleResult,
  onReviewDiagramAssistProposal,
}: {
  jobs: AsyncTrackedJob[];
  onCancelJob: (jobId: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveJob: (jobId: string) => void;
  onClearFinished: () => void;
  onApplyGridRuleResult?: (job: AsyncTrackedJob) => void;
  onReviewDiagramAssistProposal?: (job: AsyncTrackedJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'running' || j.status === 'cancel_requested').length,
    [jobs],
  );
  if (!jobs.length) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[1200] w-[min(520px,calc(100vw-32px))]">
      <div className="mac-window mac-double-outline bg-white">
        <div className="mac-titlebar">
          <div className="mac-title">Processing ({activeCount})</div>
          <div className="flex-1" />
          <button type="button" className="mac-btn h-7" onClick={() => setOpen((v) => !v)} title={open ? 'Collapse' : 'Expand'}>
            {open ? 'Hide' : 'Show'}
          </button>
          <button
            type="button"
            className="mac-btn h-7"
            onClick={onClearFinished}
            title="Clear finished jobs"
          >
            Clear finished
          </button>
        </div>

        {open ? (
          <div className="max-h-[420px] overflow-auto p-2 space-y-2">
            {error ? <div className="text-xs mac-double-outline p-2">{error}</div> : null}
            {jobs.map((j) => {
              const progress = Math.max(0, Math.min(100, Math.floor(Number(j.progressPct || 0))));
              const canCancel = j.status === 'queued' || j.status === 'running';
              const createdFiles = getCreatedFiles(j.result);
              const isGridRule = String(j.kind || '') === 'ai_grid_rule';
              const isDiagramAssist = String(j.kind || '') === 'ai_diagram_assist';
              return (
                <div key={j.id} className="mac-double-outline p-2 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{j.title}</div>
                    <div className="opacity-70">{statusLabel(j.status)}</div>
                  </div>
                  <div className="opacity-70 truncate">{j.step || 'queued'}</div>
                  <div className="h-2 border bg-white">
                    <div className="h-full bg-black" style={{ width: `${progress}%` }} />
                  </div>
                  {j.error ? <div className="text-[11px]">{j.error}</div> : null}
                  <div className="flex items-center gap-1 flex-wrap">
                    {canCancel ? (
                      <button
                        type="button"
                        className="mac-btn h-7"
                        disabled={busyJobId === j.id}
                        onClick={async () => {
                          setBusyJobId(j.id);
                          setError(null);
                          const res = await onCancelJob(j.id);
                          if (!res.ok) setError(res.error || 'Failed to cancel');
                          setBusyJobId(null);
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {isTerminal(j.status) ? (
                      <button type="button" className="mac-btn h-7" onClick={() => onRemoveJob(j.id)}>
                        Remove
                      </button>
                    ) : null}
                    {isGridRule && j.status === 'succeeded' && onApplyGridRuleResult ? (
                      <button
                        type="button"
                        className="mac-btn h-7"
                        onClick={() => onApplyGridRuleResult(j)}
                        title="Apply returned updates to this open grid editor"
                      >
                        Apply updates
                      </button>
                    ) : null}
                    {isDiagramAssist && j.status === 'succeeded' && onReviewDiagramAssistProposal ? (
                      <button
                        type="button"
                        className="mac-btn h-7"
                        onClick={() => onReviewDiagramAssistProposal(j)}
                        title="Open AI proposal preview and apply options"
                      >
                        Review proposal
                      </button>
                    ) : null}
                    {j.status === 'succeeded' && createdFiles.length
                      ? createdFiles.slice(0, 3).map((f, idx) => {
                          const id = String(f?.id || '').trim();
                          const name = String(f?.name || `File ${idx + 1}`);
                          if (!id) return null;
                          return (
                            <button
                              key={`${j.id}:${id}`}
                              type="button"
                              className="mac-btn h-7"
                              onClick={() => {
                                if (typeof window === 'undefined') return;
                                window.location.assign(`/editor?file=${encodeURIComponent(id)}`);
                              }}
                              title={name}
                            >
                              Open {name}
                            </button>
                          );
                        })
                      : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
