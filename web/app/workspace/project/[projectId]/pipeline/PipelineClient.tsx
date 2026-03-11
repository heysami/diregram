'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ensureOpenAiApiKeyWithPrompt } from '@/lib/openai-key-browser';
import { ensureClaudeApiKeyWithPrompt } from '@/lib/claude-key-browser';
import { useAsyncJobQueue } from '@/hooks/use-async-job-queue';

type PipelineRunRow = {
  id: string;
  status: string;
  step: string;
  progressPct: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  singleDiagramFileId: string;
  primaryDiagramFileId: string;
  timeline: Array<{
    at: string;
    kind: string;
    step: string;
    progressPct: number;
    mode: string;
    attempt: number;
    errorCount: number;
    warningCount: number;
  }>;
  diagramMonitor: {
    attempt: number;
    mode: string;
    markdownHash: string;
    lineCount: number;
    previewMarkdown: string;
    errorCount: number;
    warningCount: number;
    errors: string[];
    warnings: string[];
    updatedAt: string;
  };
};

const PIPELINE_STAGE_ORDER = [
  'prepare_inputs',
  'generate_single_diagram',
  'build_rag_from_diagram',
  'swarm_analysis',
  'generate_user_story_grid',
  'generate_design_system_and_components',
  'generate_epic_notes',
  'final_rag_refresh',
  'done',
] as const;

function nowIso() {
  return new Date().toISOString();
}

function safeName(name: string) {
  const raw = String(name || '').trim() || 'document';
  return raw
    .replace(/\0/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function formatBytes(input: number): string {
  const value = Number(input || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded = size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function stageIndex(step: string): number {
  const idx = PIPELINE_STAGE_ORDER.indexOf(step as (typeof PIPELINE_STAGE_ORDER)[number]);
  if (idx >= 0) return idx;
  if (step === 'failed' || step === 'retrying') return 1;
  return -1;
}

function formatDateTime(input: string | null): string {
  const t = String(input || '').trim();
  if (!t) return '-';
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return t;
  return new Date(ms).toLocaleString();
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function PipelineClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { supabase, user, ready } = useAuth();
  const asyncQueue = useAsyncJobQueue();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const canRun = useMemo(() => Boolean(projectId) && files.length > 0 && !busy && !!supabase && !!user, [projectId, files.length, busy, supabase, user]);
  const selectedBytes = useMemo(() => files.reduce((sum, f) => sum + Number(f.size || 0), 0), [files]);
  const selectedRun = useMemo(() => {
    if (!runs.length) return null;
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) return found;
    }
    return runs[0] || null;
  }, [runs, selectedRunId]);

  const loadRuns = async () => {
    if (!projectId) return;
    setLoadingRuns(true);
    try {
      const res = await fetch(`/api/project-pipeline/runs?projectFolderId=${encodeURIComponent(projectId)}`, { method: 'GET' });
      const json = (await res.json().catch(() => ({}))) as { runs?: unknown[]; error?: string };
      if (!res.ok) throw new Error(String(json.error || `Failed (${res.status})`));
      const rows = Array.isArray(json.runs) ? json.runs : [];
      const parsed = rows
        .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
        .filter((r): r is Record<string, unknown> => r !== null)
        .map((r) => ({
          id: String(r.id || ''),
          status: String(r.status || ''),
          step: String(r.step || ''),
          progressPct: Number(r.progressPct || 0),
          error: r.error ? String(r.error) : null,
          createdAt: String(r.createdAt || nowIso()),
          startedAt: r.startedAt ? String(r.startedAt) : null,
          updatedAt: String(r.updatedAt || nowIso()),
          finishedAt: r.finishedAt ? String(r.finishedAt) : null,
          singleDiagramFileId: String(r.singleDiagramFileId || ''),
          primaryDiagramFileId: String(r.primaryDiagramFileId || ''),
          timeline: Array.isArray(r.timeline)
            ? r.timeline
                .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
                .filter((item): item is Record<string, unknown> => item !== null)
                .map((item) => ({
                  at: String(item.at || nowIso()),
                  kind: String(item.kind || 'stage'),
                  step: String(item.step || ''),
                  progressPct: Number(item.progressPct || 0),
                  mode: String(item.mode || ''),
                  attempt: Number(item.attempt || 0),
                  errorCount: Number(item.errorCount || 0),
                  warningCount: Number(item.warningCount || 0),
                }))
                .slice(-160)
            : [],
          diagramMonitor:
            r.diagramMonitor && typeof r.diagramMonitor === 'object'
              ? {
                  attempt: Number((r.diagramMonitor as Record<string, unknown>).attempt || 0),
                  mode: String((r.diagramMonitor as Record<string, unknown>).mode || ''),
                  markdownHash: String((r.diagramMonitor as Record<string, unknown>).markdownHash || ''),
                  lineCount: Number((r.diagramMonitor as Record<string, unknown>).lineCount || 0),
                  previewMarkdown: String((r.diagramMonitor as Record<string, unknown>).previewMarkdown || ''),
                  errorCount: Number((r.diagramMonitor as Record<string, unknown>).errorCount || 0),
                  warningCount: Number((r.diagramMonitor as Record<string, unknown>).warningCount || 0),
                  errors: Array.isArray((r.diagramMonitor as Record<string, unknown>).errors)
                    ? ((r.diagramMonitor as Record<string, unknown>).errors as unknown[]).map((x) => String(x || '')).filter(Boolean).slice(0, 10)
                    : [],
                  warnings: Array.isArray((r.diagramMonitor as Record<string, unknown>).warnings)
                    ? ((r.diagramMonitor as Record<string, unknown>).warnings as unknown[]).map((x) => String(x || '')).filter(Boolean).slice(0, 10)
                    : [],
                  updatedAt: String((r.diagramMonitor as Record<string, unknown>).updatedAt || ''),
                }
              : {
                  attempt: 0,
                  mode: '',
                  markdownHash: '',
                  lineCount: 0,
                  previewMarkdown: '',
                  errorCount: 0,
                  warningCount: 0,
                  errors: [],
                  warnings: [],
                  updatedAt: '',
                },
        }))
        .filter((r) => Boolean(r.id));
      setRuns(parsed);
      if (parsed.length && !parsed.some((r) => r.id === selectedRunId)) {
        setSelectedRunId(parsed[0]!.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'queued' || r.status === 'running');
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, projectId]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadAndRun = async () => {
    if (!supabase || !user?.id) {
      setError('You must be signed in.');
      return;
    }
    if (!files.length) {
      setError('Upload at least one file.');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const claudeApiKey = await ensureClaudeApiKeyWithPrompt('Enter your Claude API key (saved only in this browser).');
      const openaiApiKey = await ensureOpenAiApiKeyWithPrompt('Enter your OpenAI API key for embeddings (saved only in this browser).');
      if (!claudeApiKey) throw new Error('Missing Claude API key.');
      if (!openaiApiKey) throw new Error('Missing OpenAI API key.');

      const runUploadId = crypto.randomUUID();
      const uploads: Array<{ objectPath: string; name: string; size: number; mimeType: string }> = [];

      for (const [index, file] of files.entries()) {
        const name = safeName(file.name || 'document');
        const objectPath = `docling/${user.id}/pipeline/${runUploadId}/in/${String(index + 1).padStart(3, '0')}-${name}`;
        const { error: uploadErr } = await supabase.storage.from('docling-files').upload(objectPath, file, {
          upsert: true,
          contentType: file.type || undefined,
        });
        if (uploadErr) throw new Error(uploadErr.message);
        uploads.push({ objectPath, name, size: Number(file.size || 0), mimeType: String(file.type || '') });
      }

      const res = await fetch('/api/project-pipeline/runs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-openai-api-key': openaiApiKey,
          'x-claude-api-key': claudeApiKey,
        },
        body: JSON.stringify({
          projectFolderId: projectId,
          uploads,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; jobId?: string };
      if (!res.ok) throw new Error(String(json.error || `Failed (${res.status})`));
      const jobId = String(json.jobId || '').trim();
      if (jobId) {
        asyncQueue.trackJob({
          id: jobId,
          kind: 'project_pipeline',
          title: 'Project auto-pipeline',
        });
      }

      setFiles([]);
      void loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start pipeline');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="p-6 text-xs">Loading…</div>;
  }

  return (
    <main className="mac-desktop min-h-screen p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={() => router.push(`/workspace?project=${encodeURIComponent(projectId)}`)}>
          <ArrowLeft size={14} /> Back to project
        </button>
        <div className="text-xs font-semibold opacity-70">Project pipeline</div>
      </div>

      <div className="mac-window mac-double-outline p-4 space-y-3 max-w-[980px]">
        <div className="text-sm font-bold tracking-tight">Upload files and run auto-pipeline</div>
        <div className="text-xs opacity-80">
          This run generates one linked diagram, swarm outputs, story grid, vision design system, TSX component stubs, epic notes, and refreshes RAG.
        </div>
        <input
          type="file"
          multiple
          className="text-xs"
          onChange={(e) => {
            const next = Array.from(e.target.files || []);
            if (!next.length) return;
            setFiles((prev) => {
              const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
              const seen = new Set(prev.map(key));
              const merged = [...prev];
              for (const file of next) {
                const k = key(file);
                if (seen.has(k)) continue;
                seen.add(k);
                merged.push(file);
              }
              return merged;
            });
            setError(null);
            e.currentTarget.value = '';
          }}
          disabled={busy}
        />
        {files.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs opacity-80">
              {files.length} file(s) selected · {formatBytes(selectedBytes)}
            </div>
            <div className="max-h-48 overflow-auto mac-double-outline p-2 space-y-1">
              {files.map((file, index) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{file.name}</div>
                    <div className="opacity-60">{formatBytes(file.size)}</div>
                  </div>
                  <button type="button" className="mac-btn h-7" onClick={() => removeFile(index)} disabled={busy}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="mac-btn h-7" onClick={() => setFiles([])} disabled={busy}>
                Clear all
              </button>
            </div>
          </div>
        ) : null}
        {error ? <div className="text-xs mac-double-outline p-2">Error: {error}</div> : null}
        <div>
          <button type="button" className="mac-btn mac-btn--primary h-8 flex items-center gap-1.5" disabled={!canRun} onClick={uploadAndRun}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {busy ? 'Running…' : 'Upload and run pipeline'}
          </button>
        </div>
      </div>

      <div className="mac-window mac-double-outline p-4 space-y-3 max-w-[980px]">
        <div className="text-sm font-bold tracking-tight">Run history</div>
        {loadingRuns ? <div className="text-xs opacity-70">Loading…</div> : null}
        {!loadingRuns && runs.length === 0 ? <div className="text-xs opacity-70">No runs yet.</div> : null}
        <div className="space-y-2">
          {runs.map((run) => {
            const diagramId = run.primaryDiagramFileId || run.singleDiagramFileId;
            const isSelected = selectedRun?.id === run.id;
            return (
              <div
                key={run.id}
                className={`mac-double-outline p-3 text-xs space-y-1 cursor-pointer ${isSelected ? 'ring-2 ring-black/30' : ''}`}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{run.id}</div>
                  <div className="opacity-70">{run.status}</div>
                </div>
                <div className="opacity-70">{run.step || 'queued'} ({Math.max(0, Math.min(100, Math.floor(run.progressPct || 0)))}%)</div>
                {run.error ? <div>Error: {run.error}</div> : null}
                <div className="flex items-center gap-2">
                  <button type="button" className="mac-btn h-7" onClick={() => setSelectedRunId(run.id)}>
                    Monitor
                  </button>
                  {diagramId ? (
                    <button
                      type="button"
                      className="mac-btn h-7"
                      onClick={() => router.push(`/editor?file=${encodeURIComponent(diagramId)}`)}
                    >
                      Open primary diagram
                    </button>
                  ) : null}
                  <div className="opacity-60">{new Date(run.createdAt).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedRun ? (
        <div className="mac-window mac-double-outline p-4 space-y-3 max-w-[980px]">
          <div className="text-sm font-bold tracking-tight">Live monitor</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Run ID</div>
              <div className="font-semibold break-all">{selectedRun.id}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Status</div>
              <div className="font-semibold">{selectedRun.status}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Current step</div>
              <div className="font-semibold">{selectedRun.step || '-'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Created</div>
              <div>{formatDateTime(selectedRun.createdAt)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Started</div>
              <div>{formatDateTime(selectedRun.startedAt)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Finished</div>
              <div>{formatDateTime(selectedRun.finishedAt)}</div>
            </div>
          </div>

          <div className="text-xs opacity-80">
            Duration:{' '}
            {(() => {
              const startMs = Date.parse(String(selectedRun.startedAt || selectedRun.createdAt || ''));
              const endMs = selectedRun.finishedAt ? Date.parse(selectedRun.finishedAt) : Date.now();
              if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '-';
              return formatDurationMs(endMs - startMs);
            })()}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold">Stage timeline</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {PIPELINE_STAGE_ORDER.map((stage, idx) => {
                const currentIndex = stageIndex(selectedRun.step);
                const done = selectedRun.status === 'succeeded' ? true : currentIndex > idx;
                const active = selectedRun.status === 'running' && currentIndex === idx;
                const failed = selectedRun.status === 'failed' && currentIndex === idx;
                const classes = failed
                  ? 'border-red-700 bg-red-100'
                  : active
                    ? 'border-black bg-yellow-100 animate-pulse'
                    : done
                      ? 'border-black/40 bg-black/5'
                      : 'border-black/20 bg-transparent';
                return (
                  <div key={stage} className={`mac-double-outline p-2 text-xs border ${classes}`}>
                    <div className="font-semibold">{stage}</div>
                    <div className="opacity-70">
                      {failed ? 'failed' : active ? 'running' : done ? 'done' : 'pending'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold">Attempt log</div>
            <div className="max-h-44 overflow-auto mac-double-outline p-2 space-y-1 text-xs">
              {(selectedRun.timeline || []).length === 0 ? <div className="opacity-70">No timeline events yet.</div> : null}
              {(selectedRun.timeline || []).slice().reverse().map((event, i) => (
                <div key={`${event.at}-${event.kind}-${i}`} className="mac-double-outline p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">
                      {event.kind}
                      {event.mode ? ` · ${event.mode}` : ''}
                      {event.attempt ? ` · attempt ${event.attempt}` : ''}
                    </div>
                    <div className="opacity-70">{formatDateTime(event.at)}</div>
                  </div>
                  <div className="opacity-70">
                    {event.step || '-'} ({Math.max(0, Math.min(100, Math.floor(event.progressPct || 0)))}%)
                  </div>
                  <div className="opacity-70">
                    errors: {Math.max(0, Math.floor(event.errorCount || 0))} · warnings: {Math.max(0, Math.floor(event.warningCount || 0))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold">Diagram markdown (live WIP)</div>
            <div className="text-xs opacity-70">
              attempt {selectedRun.diagramMonitor.attempt || 0} · mode {selectedRun.diagramMonitor.mode || '-'} · lines{' '}
              {Math.max(0, Math.floor(selectedRun.diagramMonitor.lineCount || 0))} · updated {formatDateTime(selectedRun.diagramMonitor.updatedAt || selectedRun.updatedAt)}
            </div>
            {(selectedRun.diagramMonitor.errors || []).length > 0 ? (
              <div className="mac-double-outline p-2 text-xs">
                <div className="font-semibold">Current validator errors</div>
                <div className="space-y-1 mt-1">
                  {selectedRun.diagramMonitor.errors.map((msg, i) => (
                    <div key={`err-${i}`}>- {msg}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {(selectedRun.diagramMonitor.warnings || []).length > 0 ? (
              <div className="mac-double-outline p-2 text-xs">
                <div className="font-semibold">Current validator warnings</div>
                <div className="space-y-1 mt-1">
                  {selectedRun.diagramMonitor.warnings.map((msg, i) => (
                    <div key={`warn-${i}`}>- {msg}</div>
                  ))}
                </div>
              </div>
            ) : null}
            <pre className="mac-double-outline p-3 text-[11px] leading-relaxed overflow-auto max-h-[420px] whitespace-pre-wrap">
              {selectedRun.diagramMonitor.previewMarkdown || 'No WIP markdown snapshot yet for this run.'}
            </pre>
            {selectedRun.error ? <div className="text-xs mac-double-outline p-2">Final error: {selectedRun.error}</div> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
