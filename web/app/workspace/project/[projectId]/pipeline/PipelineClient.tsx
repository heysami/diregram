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
  updatedAt: string;
  finishedAt: string | null;
  singleDiagramFileId: string;
  primaryDiagramFileId: string;
};

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

export default function PipelineClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { supabase, user, ready } = useAuth();
  const asyncQueue = useAsyncJobQueue();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<PipelineRunRow[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const canRun = useMemo(() => Boolean(projectId) && files.length > 0 && !busy && !!supabase && !!user, [projectId, files.length, busy, supabase, user]);

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
          updatedAt: String(r.updatedAt || nowIso()),
          finishedAt: r.finishedAt ? String(r.finishedAt) : null,
          singleDiagramFileId: String(r.singleDiagramFileId || ''),
          primaryDiagramFileId: String(r.primaryDiagramFileId || ''),
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
            setFiles(next);
          }}
          disabled={busy}
        />
        {files.length > 0 ? <div className="text-xs opacity-80">{files.length} file(s) selected</div> : null}
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
            return (
              <div key={run.id} className="mac-double-outline p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{run.id}</div>
                  <div className="opacity-70">{run.status}</div>
                </div>
                <div className="opacity-70">{run.step || 'queued'} ({Math.max(0, Math.min(100, Math.floor(run.progressPct || 0)))}%)</div>
                {run.error ? <div>Error: {run.error}</div> : null}
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
                  <div className="opacity-60">{new Date(run.createdAt).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
