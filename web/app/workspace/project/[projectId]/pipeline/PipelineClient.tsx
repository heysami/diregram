'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ensureOpenAiApiKeyWithPrompt } from '@/lib/openai-key-browser';
import { ensureClaudeApiKeyWithPrompt } from '@/lib/claude-key-browser';
import { useAsyncJobQueue } from '@/hooks/use-async-job-queue';

type PipelineGenerationProvider = 'claude' | 'openai';
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
  heartbeatAt: string | null;
  leaseUntil: string | null;
  workerId: string;
  singleDiagramFileId: string;
  primaryDiagramFileId: string;
  timeline: Array<{
    at: string;
    kind: string;
    step: string;
    progressPct: number;
    level: string;
    title: string;
    message: string;
    mode: string;
    attempt: number;
    errorCount: number;
    warningCount: number;
  }>;
  sourceProgress: {
    updatedAt: string;
    index: number;
    total: number;
    name: string;
    action: string;
    sourceKind: string;
  };
  sourceMonitor: {
    updatedAt: string;
    usableCount: number;
    blockedCount: number;
    sources: Array<{
      name: string;
      sourceKind: string;
      mimeType: string;
      size: number;
      charCount: number;
      lineCount: number;
      wordCount: number;
      alphaRatio: number;
      lowSignal: boolean;
      imageCount: number;
      warnings: string[];
      previewText: string;
    }>;
  };
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
const PIPELINE_GENERATION_PROVIDER_STORAGE = 'diregram.projectPipeline.generationProvider.v1';

function nowIso() {
  return new Date().toISOString();
}

function normalizeGenerationProvider(input: string): PipelineGenerationProvider {
  return String(input || '').trim().toLowerCase() === 'openai' ? 'openai' : 'claude';
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

function timeAgo(input: string | null): string {
  const t = String(input || '').trim();
  if (!t) return '-';
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return t;
  const diff = Date.now() - ms;
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isLikelyStaleRun(run: PipelineRunRow): boolean {
  if (!(run.status === 'queued' || run.status === 'running')) return false;
  const leaseMs = Date.parse(String(run.leaseUntil || ''));
  if (Number.isFinite(leaseMs) && Date.now() > leaseMs) return true;
  const heartbeatMs = Date.parse(String(run.heartbeatAt || run.updatedAt || ''));
  if (!Number.isFinite(heartbeatMs)) return false;
  return Date.now() - heartbeatMs > 3 * 60 * 1000;
}

function isRunActive(status: string): boolean {
  return status === 'queued' || status === 'running';
}

function canDeleteRun(status: string): boolean {
  return status === 'failed' || status === 'cancelled';
}

function canCancelRun(status: string): boolean {
  return status === 'queued' || status === 'running';
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string>('');
  const [cancelingRunId, setCancelingRunId] = useState<string>('');
  const [generationProvider, setGenerationProvider] = useState<PipelineGenerationProvider>('claude');

  const canRun = useMemo(() => Boolean(projectId) && files.length > 0 && !busy && !!supabase && !!user, [projectId, files.length, busy, supabase, user]);
  const selectedBytes = useMemo(() => files.reduce((sum, f) => sum + Number(f.size || 0), 0), [files]);
  const currentRun = useMemo(() => runs.find((run) => isRunActive(run.status)) || runs[0] || null, [runs]);
  const historyRuns = useMemo(() => (currentRun ? runs.filter((run) => run.id !== currentRun.id) : runs), [runs, currentRun]);

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
          heartbeatAt: r.heartbeatAt ? String(r.heartbeatAt) : null,
          leaseUntil: r.leaseUntil ? String(r.leaseUntil) : null,
          workerId: String(r.workerId || ''),
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
                  level: String(item.level || 'info'),
                  title: String(item.title || ''),
                  message: String(item.message || ''),
                  mode: String(item.mode || ''),
                  attempt: Number(item.attempt || 0),
                  errorCount: Number(item.errorCount || 0),
                  warningCount: Number(item.warningCount || 0),
                }))
                .slice(-160)
            : [],
          sourceProgress:
            r.sourceProgress && typeof r.sourceProgress === 'object'
              ? {
                  updatedAt: String((r.sourceProgress as Record<string, unknown>).updatedAt || ''),
                  index: Number((r.sourceProgress as Record<string, unknown>).index || 0),
                  total: Number((r.sourceProgress as Record<string, unknown>).total || 0),
                  name: String((r.sourceProgress as Record<string, unknown>).name || ''),
                  action: String((r.sourceProgress as Record<string, unknown>).action || ''),
                  sourceKind: String((r.sourceProgress as Record<string, unknown>).sourceKind || ''),
                }
              : {
                  updatedAt: '',
                  index: 0,
                  total: 0,
                  name: '',
                  action: '',
                  sourceKind: '',
                },
          sourceMonitor:
            r.sourceMonitor && typeof r.sourceMonitor === 'object'
              ? {
                  updatedAt: String((r.sourceMonitor as Record<string, unknown>).updatedAt || ''),
                  usableCount: Number((r.sourceMonitor as Record<string, unknown>).usableCount || 0),
                  blockedCount: Number((r.sourceMonitor as Record<string, unknown>).blockedCount || 0),
                  sources: Array.isArray((r.sourceMonitor as Record<string, unknown>).sources)
                    ? ((r.sourceMonitor as Record<string, unknown>).sources as unknown[])
                        .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
                        .filter((item): item is Record<string, unknown> => item !== null)
                        .map((item) => ({
                          name: String(item.name || 'document'),
                          sourceKind: String(item.sourceKind || 'text'),
                          mimeType: String(item.mimeType || ''),
                          size: Number(item.size || 0),
                          charCount: Number(item.charCount || 0),
                          lineCount: Number(item.lineCount || 0),
                          wordCount: Number(item.wordCount || 0),
                          alphaRatio: Number(item.alphaRatio || 0),
                          lowSignal: Boolean(item.lowSignal),
                          imageCount: Number(item.imageCount || 0),
                          warnings: Array.isArray(item.warnings)
                            ? item.warnings.map((x) => String(x || '')).filter(Boolean).slice(0, 6)
                            : [],
                          previewText: String(item.previewText || ''),
                        }))
                        .slice(0, 12)
                    : [],
                }
              : {
                  updatedAt: '',
                  usableCount: 0,
                  blockedCount: 0,
                  sources: [],
                },
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    try {
      const stored = typeof window === 'undefined' ? '' : window.localStorage.getItem(PIPELINE_GENERATION_PROVIDER_STORAGE) || '';
      setGenerationProvider(normalizeGenerationProvider(stored));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PIPELINE_GENERATION_PROVIDER_STORAGE, generationProvider);
    } catch {
      // ignore
    }
  }, [generationProvider]);

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

  const deleteRun = async (run: PipelineRunRow) => {
    if (!canDeleteRun(run.status) || deletingRunId) return;
    const confirmed = window.confirm(`Delete run ${run.id}? This only removes the failed/cancelled run record from history.`);
    if (!confirmed) return;
    setDeletingRunId(run.id);
    setError(null);
    try {
      const res = await fetch('/api/project-pipeline/runs', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectFolderId: projectId,
          jobId: run.id,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(json.error || `Failed (${res.status})`));
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete run');
    } finally {
      setDeletingRunId('');
    }
  };

  const cancelRun = async (run: PipelineRunRow) => {
    if (!canCancelRun(run.status) || cancelingRunId) return;
    setCancelingRunId(run.id);
    setError(null);
    try {
      const res = await fetch(`/api/async-jobs/${encodeURIComponent(run.id)}/cancel`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(json.error || `Failed (${res.status})`));
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel run');
    } finally {
      setCancelingRunId('');
    }
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
      const openaiApiKey = await ensureOpenAiApiKeyWithPrompt(
        generationProvider === 'openai'
          ? 'Enter your OpenAI API key for pipeline generation and embeddings (saved only in this browser).'
          : 'Enter your OpenAI API key for embeddings (saved only in this browser).',
      );
      if (!openaiApiKey) throw new Error('Missing OpenAI API key.');
      const claudeApiKey =
        generationProvider === 'claude'
          ? await ensureClaudeApiKeyWithPrompt('Enter your Claude API key for pipeline generation (saved only in this browser).')
          : '';
      if (generationProvider === 'claude' && !claudeApiKey) throw new Error('Missing Claude API key.');

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
          ...(claudeApiKey ? { 'x-claude-api-key': claudeApiKey } : {}),
        },
        body: JSON.stringify({
          projectFolderId: projectId,
          uploads,
          generationProvider,
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

	      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] items-start">
	        <div className="mac-window mac-double-outline p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
	            <div className="space-y-1">
	              <div className="text-sm font-bold tracking-tight">Upload files and run auto-pipeline</div>
	              <div className="text-xs opacity-80">
	                This run generates one linked diagram, swarm outputs, story grid, vision design system, TSX component stubs, epic notes, and refreshes RAG.
	              </div>
	            </div>
            <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={() => setHistoryOpen(true)}>
              <History size={14} />
              History
            </button>
	          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold">Generation provider</div>
            <select
              className="mac-field h-8 w-full"
              value={generationProvider}
              onChange={(e) => setGenerationProvider(normalizeGenerationProvider(e.target.value))}
              disabled={busy}
            >
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
            </select>
            <div className="text-[11px] opacity-70">
              {generationProvider === 'openai'
                ? 'OpenAI will be used for pipeline generation and embeddings.'
                : 'Claude will be used for pipeline generation. OpenAI is still used for embeddings and RAG.'}
            </div>
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
          <div className="flex items-center gap-2">
            <button type="button" className="mac-btn mac-btn--primary h-8 flex items-center gap-1.5" disabled={!canRun} onClick={uploadAndRun}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {busy ? 'Running…' : 'Upload and run pipeline'}
            </button>
            {loadingRuns ? <div className="text-xs opacity-60">Refreshing runs…</div> : null}
          </div>
        </div>

        {currentRun ? (
        <div className="mac-window mac-double-outline p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold tracking-tight">Live monitor</div>
            {canCancelRun(currentRun.status) ? (
              <button
                type="button"
                className="mac-btn h-8"
                onClick={() => void cancelRun(currentRun)}
                disabled={cancelingRunId === currentRun.id}
              >
                {cancelingRunId === currentRun.id ? 'Canceling…' : 'Cancel run'}
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Run ID</div>
              <div className="font-semibold break-all">{currentRun.id}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Status</div>
              <div className="font-semibold">{currentRun.status}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Current step</div>
              <div className="font-semibold">{currentRun.step || '-'}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Created</div>
              <div>{formatDateTime(currentRun.createdAt)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Started</div>
              <div>{formatDateTime(currentRun.startedAt)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Finished</div>
              <div>{formatDateTime(currentRun.finishedAt)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Heartbeat</div>
              <div>{formatDateTime(currentRun.heartbeatAt)}</div>
              <div className="opacity-60">{timeAgo(currentRun.heartbeatAt)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Lease until</div>
              <div>{formatDateTime(currentRun.leaseUntil)}</div>
            </div>
            <div className="mac-double-outline p-2">
              <div className="opacity-70">Worker</div>
              <div className="break-all">{currentRun.workerId || '-'}</div>
            </div>
          </div>

          <div className="text-xs opacity-80">
            Duration:{' '}
            {(() => {
              const startMs = Date.parse(String(currentRun.startedAt || currentRun.createdAt || ''));
              const endMs = currentRun.finishedAt ? Date.parse(currentRun.finishedAt) : Date.now();
              if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '-';
              return formatDurationMs(endMs - startMs);
            })()}
          </div>

          {isLikelyStaleRun(currentRun) ? (
            <div className="mac-double-outline p-2 text-xs bg-red-100 border-red-700">
              Worker heartbeat is stale or lease has expired. This run is likely orphaned or blocked outside normal stage progress.
            </div>
          ) : null}

          {currentRun.step === 'prepare_inputs' && currentRun.sourceProgress.name ? (
            <div className="mac-double-outline p-2 text-xs">
              <div className="font-semibold">Preparing current file</div>
              <div className="mt-1">
                {Math.max(0, Math.floor(currentRun.sourceProgress.index || 0))}/{Math.max(0, Math.floor(currentRun.sourceProgress.total || 0))} ·{' '}
                {currentRun.sourceProgress.name}
              </div>
              <div className="opacity-70">
                {currentRun.sourceProgress.action || 'working'}
                {currentRun.sourceProgress.sourceKind ? ` · ${currentRun.sourceProgress.sourceKind}` : ''}
                {' · '}
                updated {formatDateTime(currentRun.sourceProgress.updatedAt || currentRun.updatedAt)}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-semibold">Source extraction</div>
            <div className="text-xs opacity-70">
              usable {Math.max(0, Math.floor(currentRun.sourceMonitor.usableCount || 0))} · blocked{' '}
              {Math.max(0, Math.floor(currentRun.sourceMonitor.blockedCount || 0))} · updated{' '}
              {formatDateTime(currentRun.sourceMonitor.updatedAt || currentRun.updatedAt)}
            </div>
            {currentRun.sourceMonitor.sources.length > 0 ? (
              <div className="max-h-64 overflow-auto space-y-2">
                {currentRun.sourceMonitor.sources.map((source, idx) => (
                  <div key={`${source.name}-${idx}`} className="mac-double-outline p-2 text-xs space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{source.name}</div>
                        <div className="opacity-70">
                          {source.sourceKind} · {source.mimeType || 'unknown mime'} · {formatBytes(source.size)}
                        </div>
                      </div>
                      <div className={`mac-double-outline px-2 py-1 ${source.lowSignal ? 'bg-red-100 border-red-700' : 'bg-black/5'}`}>
                        {source.lowSignal ? 'low signal' : 'usable'}
                      </div>
                    </div>
                      <div className="opacity-70">
                        {Math.max(0, Math.floor(source.wordCount || 0))} words · {Math.max(0, Math.floor(source.lineCount || 0))} lines ·{' '}
                        {Math.max(0, Math.floor(source.charCount || 0))} chars · {Math.max(0, Math.floor(source.imageCount || 0))} images
                      </div>
                    {source.warnings.length > 0 ? (
                      <div className="space-y-1">
                        {source.warnings.map((msg, warningIdx) => (
                          <div key={`${source.name}-warn-${warningIdx}`}>- {msg}</div>
                        ))}
                      </div>
                    ) : null}
                    <pre className="mac-double-outline p-2 text-[11px] leading-relaxed overflow-auto max-h-36 whitespace-pre-wrap">
                      {source.previewText || 'No extracted text preview.'}
                    </pre>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs opacity-70">No extracted source snapshot yet.</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold">Stage timeline</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {PIPELINE_STAGE_ORDER.map((stage, idx) => {
                const currentIndex = stageIndex(currentRun.step);
                const done = currentRun.status === 'succeeded' ? true : currentIndex > idx;
                const active = currentRun.status === 'running' && currentIndex === idx;
                const failed = currentRun.status === 'failed' && currentIndex === idx;
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
              {(currentRun.timeline || []).length === 0 ? <div className="opacity-70">No timeline events yet.</div> : null}
              {(currentRun.timeline || []).slice().reverse().map((event, i) => (
                <div key={`${event.at}-${event.kind}-${i}`} className="mac-double-outline p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">
                      {event.kind}
                      {event.level && event.kind === 'activity' ? ` · ${event.level}` : ''}
                      {event.mode ? ` · ${event.mode}` : ''}
                      {event.attempt ? ` · attempt ${event.attempt}` : ''}
                    </div>
                    <div className="opacity-70">{formatDateTime(event.at)}</div>
                  </div>
                  <div className="opacity-70">
                    {event.step || '-'} ({Math.max(0, Math.min(100, Math.floor(event.progressPct || 0)))}%)
                  </div>
                  {event.title ? <div className="mt-1 font-semibold">{event.title}</div> : null}
                  {event.message ? <div className="mt-1 whitespace-pre-wrap">{event.message}</div> : null}
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
              attempt {currentRun.diagramMonitor.attempt || 0} · mode {currentRun.diagramMonitor.mode || '-'} · lines{' '}
              {Math.max(0, Math.floor(currentRun.diagramMonitor.lineCount || 0))} · updated {formatDateTime(currentRun.diagramMonitor.updatedAt || currentRun.updatedAt)}
            </div>
            {(currentRun.diagramMonitor.errors || []).length > 0 ? (
              <div className="mac-double-outline p-2 text-xs">
                <div className="font-semibold">Current validator errors</div>
                <div className="space-y-1 mt-1">
                  {currentRun.diagramMonitor.errors.map((msg, i) => (
                    <div key={`err-${i}`}>- {msg}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {(currentRun.diagramMonitor.warnings || []).length > 0 ? (
              <div className="mac-double-outline p-2 text-xs">
                <div className="font-semibold">Current validator warnings</div>
                <div className="space-y-1 mt-1">
                  {currentRun.diagramMonitor.warnings.map((msg, i) => (
                    <div key={`warn-${i}`}>- {msg}</div>
                  ))}
                </div>
              </div>
            ) : null}
            <pre className="mac-double-outline p-3 text-[11px] leading-relaxed overflow-auto max-h-[420px] whitespace-pre-wrap">
              {currentRun.diagramMonitor.previewMarkdown || 'No WIP markdown snapshot yet for this run.'}
            </pre>
            {currentRun.error ? <div className="text-xs mac-double-outline p-2">Final error: {currentRun.error}</div> : null}
          </div>
        </div>
        ) : (
        <div className="mac-window mac-double-outline p-4 space-y-2">
          <div className="text-sm font-bold tracking-tight">Live monitor</div>
          <div className="text-xs opacity-70">No current run yet. Start a pipeline run to monitor it here.</div>
        </div>
        )}
      </div>

      {historyOpen ? (
        <div className="fixed inset-0 z-50 bg-black/35 p-4 md:p-8">
          <div className="mx-auto max-w-[1100px] mac-window mac-double-outline p-4 space-y-3 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold tracking-tight">Past runs</div>
                <div className="text-xs opacity-70">Failed or cancelled runs can be deleted from here.</div>
              </div>
              <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={() => setHistoryOpen(false)}>
                <X size={14} />
                Close
              </button>
            </div>
            {loadingRuns ? <div className="text-xs opacity-70">Loading…</div> : null}
            {!loadingRuns && historyRuns.length === 0 ? <div className="text-xs opacity-70">No past runs.</div> : null}
            <div className="overflow-auto space-y-2 pr-1">
              {historyRuns.map((run) => {
                const diagramId = run.primaryDiagramFileId || run.singleDiagramFileId;
                const deleting = deletingRunId === run.id;
                return (
                  <div key={run.id} className="mac-double-outline p-3 text-xs space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold break-all">{run.id}</div>
                        <div className="opacity-70">
                          {run.status} · {run.step || 'queued'} ({Math.max(0, Math.min(100, Math.floor(run.progressPct || 0)))}%)
                        </div>
                        <div className="opacity-60">{formatDateTime(run.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {diagramId ? (
                          <button
                            type="button"
                            className="mac-btn h-7"
                            onClick={() => router.push(`/editor?file=${encodeURIComponent(diagramId)}`)}
                          >
                            Open primary diagram
                          </button>
                        ) : null}
                        {canDeleteRun(run.status) ? (
                          <button
                            type="button"
                            className="mac-btn h-7 flex items-center gap-1.5"
                            onClick={() => void deleteRun(run)}
                            disabled={deleting}
                          >
                            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            {deleting ? 'Deleting…' : 'Delete'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {run.error ? <div className="mac-double-outline p-2">Error: {run.error}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
