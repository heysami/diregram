'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Upload, Wand2 } from 'lucide-react';
import { createSignedDoclingFileUrl, uploadDoclingInput } from '@/lib/docling-files-supabase';

type ConvertState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'processing'; inputObjectPath: string; jobId: string; filename: string }
  | { status: 'saving'; inputObjectPath: string; outputObjectPath: string; outputFormat: 'markdown' | 'json'; filename: string }
  | {
      status: 'done';
      inputObjectPath: string;
      outputObjectPath: string;
      outputFormat: 'markdown' | 'json';
      filename: string;
      downloadUrl: string | null;
      savedResourceId?: string;
    }
  | { status: 'error'; message: string };

type AsyncJobStatusResponse = {
  ok?: boolean;
  job?: { status?: string; step?: string; progressPct?: number; error?: string | null };
  result?: {
    outputObjectPath?: string;
    bucketId?: string;
    outputFormat?: 'markdown' | 'json';
    savedResourceId?: string | null;
  };
};

export function DoclingImportPanel({
  supabase,
  userId,
  projectFolderId,
  onSavedResource,
}: {
  supabase: SupabaseClient;
  userId: string;
  projectFolderId: string;
  onSavedResource?: (resourceId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<'markdown' | 'json'>('markdown');
  const [state, setState] = useState<ConvertState>({ status: 'idle' });

  const canRun = useMemo(
    () => Boolean(file) && state.status !== 'uploading' && state.status !== 'processing' && state.status !== 'saving',
    [file, state.status],
  );

  const storageKey = `diregram.doclingJob.v1.${projectFolderId || userId}`;

  const readStoredJob = () => {
    try {
      const raw = String(window.localStorage.getItem(storageKey) || '').trim();
      if (!raw) return null as null | { jobId: string; inputObjectPath: string; filename: string; outputFormat: 'markdown' | 'json' };
      const parsed = JSON.parse(raw);
      const jobId = String(parsed?.jobId || '').trim();
      const inputObjectPath = String(parsed?.inputObjectPath || '').trim();
      const filename = String(parsed?.filename || '').trim() || 'document';
      const outputFormat = String(parsed?.outputFormat || 'markdown') === 'json' ? 'json' : 'markdown';
      if (!jobId || !inputObjectPath) return null;
      return { jobId, inputObjectPath, filename, outputFormat };
    } catch {
      return null;
    }
  };

  const writeStoredJob = (payload: { jobId: string; inputObjectPath: string; filename: string; outputFormat: 'markdown' | 'json' } | null) => {
    try {
      if (!payload) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  };

  const pollDoclingJob = async (jobId: string): Promise<AsyncJobStatusResponse> => {
    for (let i = 0; i < 1800; i += 1) {
      const res = await fetch(`/api/async-jobs/${encodeURIComponent(jobId)}`, { method: 'GET' });
      const json = (await res.json().catch(() => ({}))) as AsyncJobStatusResponse;
      if (!res.ok) {
        const fallback = `Failed to fetch conversion job (${res.status})`;
        const msg = typeof (json as Record<string, unknown>)?.error === 'string' ? String((json as Record<string, unknown>).error) : fallback;
        throw new Error(msg);
      }
      const status = String(json.job?.status || '');
      if (status === 'succeeded') return json;
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(String(json.job?.error || `Conversion ${status}`));
      }
      const step = String(json.job?.step || '');
      if (step === 'saving_resource') {
        setState((prev) =>
          prev.status === 'processing' || prev.status === 'saving'
            ? { status: 'saving', inputObjectPath: prev.inputObjectPath, outputObjectPath: '', outputFormat, filename: prev.filename }
            : prev,
        );
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    throw new Error('Conversion timed out');
  };

  const finalizeDoneState = async (params: {
    inputObjectPath: string;
    filename: string;
    outputFormat: 'markdown' | 'json';
    outputObjectPath: string;
    bucketId: string;
    savedResourceId?: string | null;
  }) => {
    const savedResourceId = String(params.savedResourceId || '').trim();
    if (savedResourceId) {
      setState({
        status: 'done',
        inputObjectPath: params.inputObjectPath,
        outputObjectPath: params.outputObjectPath,
        outputFormat: params.outputFormat,
        filename: params.filename,
        downloadUrl: null,
        savedResourceId,
      });
      onSavedResource?.(savedResourceId);
      return;
    }

    const downloadUrl = params.bucketId === 'docling-files'
      ? await createSignedDoclingFileUrl({ supabase, objectPath: params.outputObjectPath, expiresInSeconds: 60 * 30 })
      : (
          await supabase.storage.from(params.bucketId).createSignedUrl(params.outputObjectPath, 60 * 30).then((r) => (r.error ? null : r.data?.signedUrl || null)).catch(() => null)
        );

    setState({
      status: 'done',
      inputObjectPath: params.inputObjectPath,
      outputObjectPath: params.outputObjectPath,
      outputFormat: params.outputFormat,
      filename: params.filename,
      downloadUrl,
    });
  };

  const reset = () => {
    setFile(null);
    setState({ status: 'idle' });
    writeStoredJob(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const run = async () => {
    if (!file) return;
    setState({ status: 'uploading' });
    try {
      const uploaded = await uploadDoclingInput({ supabase, userId, file });
      setState({ status: 'processing', inputObjectPath: uploaded.objectPath, jobId: uploaded.jobId, filename: uploaded.filename });

      const res = await fetch('/api/docling/convert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inputObjectPath: uploaded.objectPath,
          originalFilename: uploaded.filename,
          jobId: uploaded.jobId,
          outputFormat,
          projectFolderId,
        }),
      });
      const raw = await res.text().catch(() => '');
      const json = (() => {
        try {
          return (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })();
      if (!res.ok) {
        const maybeError = typeof json.error === 'string' ? json.error : '';
        const msg = String(
          maybeError ||
          (raw.trim() ? raw.trim().slice(0, 500) : '') ||
          `Conversion failed (HTTP ${res.status})`,
        );
        throw new Error(msg);
      }

      const asyncJobId = String(json.jobId || '').trim();
      if (!asyncJobId) throw new Error('Missing async job id');

      writeStoredJob({ jobId: asyncJobId, inputObjectPath: uploaded.objectPath, filename: uploaded.filename, outputFormat });
      const final = await pollDoclingJob(asyncJobId);
      const out = final.result || {};
      const outputObjectPath = String(out.outputObjectPath || '').trim();
      if (!outputObjectPath) throw new Error('Missing outputObjectPath');
      const bucketId = String(out.bucketId || 'docling-files').trim() || 'docling-files';
      const finalOutputFormat = String(out.outputFormat || outputFormat) === 'json' ? 'json' : 'markdown';

      await finalizeDoneState({
        inputObjectPath: uploaded.objectPath,
        filename: uploaded.filename,
        outputFormat: finalOutputFormat,
        outputObjectPath,
        bucketId,
        savedResourceId: out.savedResourceId || null,
      });
      writeStoredJob(null);
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Conversion failed' });
      writeStoredJob(null);
    }
  };

  useEffect(() => {
    const pending = readStoredJob();
    if (!pending) return;
    setState({ status: 'processing', inputObjectPath: pending.inputObjectPath, jobId: pending.jobId, filename: pending.filename });
    void (async () => {
      try {
        const final = await pollDoclingJob(pending.jobId);
        const out = final.result || {};
        const outputObjectPath = String(out.outputObjectPath || '').trim();
        if (!outputObjectPath) throw new Error('Missing outputObjectPath');
        const bucketId = String(out.bucketId || 'docling-files').trim() || 'docling-files';
        const finalOutputFormat = String(out.outputFormat || pending.outputFormat) === 'json' ? 'json' : 'markdown';
        await finalizeDoneState({
          inputObjectPath: pending.inputObjectPath,
          filename: pending.filename,
          outputFormat: finalOutputFormat,
          outputObjectPath,
          bucketId,
          savedResourceId: out.savedResourceId || null,
        });
        writeStoredJob(null);
      } catch (e) {
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Conversion failed' });
        writeStoredJob(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mac-window mac-double-outline p-5 space-y-4 max-w-[760px]">
      <div className="space-y-1">
        <div className="text-sm font-bold tracking-tight">Additional resources (Docling)</div>
        <div className="text-xs opacity-70">Upload a document, convert it, and save the markdown as an additional resource in this project.</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            setState({ status: 'idle' });
          }}
        />

        <select
          className="mac-field h-8 text-xs"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value === 'json' ? 'json' : 'markdown')}
          title="Output format"
        >
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>

        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" disabled={!canRun} onClick={run}>
          <Wand2 size={14} />
          Convert
        </button>

        <button
          type="button"
          className="mac-btn h-8 flex items-center gap-1.5"
          onClick={reset}
          disabled={state.status === 'uploading' || state.status === 'processing' || state.status === 'saving'}
        >
          Reset
        </button>
      </div>

      {state.status === 'idle' ? (
        <div className="text-xs opacity-80">Choose a file to begin.</div>
      ) : null}

      {state.status === 'uploading' ? (
        <div className="text-xs opacity-80 flex items-center gap-2">
          <Upload size={14} />
          Uploading…
        </div>
      ) : null}

      {state.status === 'processing' ? (
        <div className="text-xs opacity-80 flex items-center gap-2">
          <Wand2 size={14} />
          Converting…
        </div>
      ) : null}

      {state.status === 'saving' ? (
        <div className="text-xs opacity-80 flex items-center gap-2">
          <Wand2 size={14} />
          Saving to project resources…
        </div>
      ) : null}

      {state.status === 'done' ? (
        <div className="space-y-2">
          <div className="text-xs">
            Output: <span className="font-mono">{state.outputObjectPath}</span>
          </div>
          {state.savedResourceId ? (
            <div className="text-xs opacity-80">Saved to additional resources.</div>
          ) : (
            <div className="flex items-center gap-2">
              <a
                className={`mac-btn h-8 flex items-center gap-1.5 ${!state.downloadUrl ? 'pointer-events-none opacity-50' : ''}`}
                href={state.downloadUrl || undefined}
                download
                target="_blank"
                rel="noreferrer"
                title={!state.downloadUrl ? 'Could not create signed URL' : 'Download'}
              >
                <Download size={14} />
                Download
              </a>
              {!state.downloadUrl ? <div className="text-xs opacity-70">Could not create signed URL (check Storage policies).</div> : null}
            </div>
          )}
        </div>
      ) : null}

      {state.status === 'error' ? <div className="text-xs mac-double-outline p-3">Error: {state.message}</div> : null}
    </div>
  );
}
