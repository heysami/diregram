'use client';

import { useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Upload, Wand2 } from 'lucide-react';
import { createSignedDoclingFileUrl, uploadDoclingInput } from '@/lib/docling-files-supabase';

type ConvertState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'uploaded'; inputObjectPath: string; jobId: string; filename: string }
  | { status: 'processing'; inputObjectPath: string; jobId: string; filename: string }
  | { status: 'done'; inputObjectPath: string; outputObjectPath: string; outputFormat: 'markdown' | 'json'; filename: string; downloadUrl: string | null }
  | { status: 'error'; message: string };

export function DoclingImportPanel({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState<'markdown' | 'json'>('markdown');
  const [state, setState] = useState<ConvertState>({ status: 'idle' });

  const canRun = useMemo(() => Boolean(file) && state.status !== 'uploading' && state.status !== 'processing', [file, state.status]);

  const reset = () => {
    setFile(null);
    setState({ status: 'idle' });
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
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(String(json?.error || 'Conversion failed'));

      const outputObjectPath = String(json?.outputObjectPath || '').trim();
      if (!outputObjectPath) throw new Error('Missing outputObjectPath');

      const downloadUrl = await createSignedDoclingFileUrl({ supabase, objectPath: outputObjectPath, expiresInSeconds: 60 * 30 });
      setState({ status: 'done', inputObjectPath: uploaded.objectPath, outputObjectPath, outputFormat, filename: uploaded.filename, downloadUrl });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Conversion failed' });
    }
  };

  return (
    <div className="mac-window mac-double-outline p-5 space-y-4 max-w-[760px]">
      <div className="space-y-1">
        <div className="text-sm font-bold tracking-tight">Import / Convert (Docling)</div>
        <div className="text-xs opacity-70">Upload a document, convert it, then download the result.</div>
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

        <select className="mac-field h-8 text-xs" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as any)} title="Output format">
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>

        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" disabled={!canRun} onClick={run}>
          <Wand2 size={14} />
          Convert
        </button>

        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={reset} disabled={state.status === 'uploading' || state.status === 'processing'}>
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

      {state.status === 'done' ? (
        <div className="space-y-2">
          <div className="text-xs">
            Output: <span className="font-mono">{state.outputObjectPath}</span>
          </div>
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
        </div>
      ) : null}

      {state.status === 'error' ? <div className="text-xs mac-double-outline p-3">Error: {state.message}</div> : null}
    </div>
  );
}

