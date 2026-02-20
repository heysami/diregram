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

  const safeName = (name: string) => {
    const raw = String(name || '').trim() || 'document';
    return raw
      .replace(/\0/g, '')
      .replace(/[^\w.\- ()\[\]]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 160);
  };

  const toMarkdownFilename = (original: string) => {
    const base = safeName(original).replace(/\.[^/.]+$/, '') || 'document';
    return `${base}.md`;
  };

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
      const bucketId = String(json?.bucketId || 'docling-files').trim() || 'docling-files';

      // Prefer saving markdown directly into the project as an "Additional resource".
      if (outputFormat === 'markdown' && projectFolderId) {
        setState({ status: 'saving', inputObjectPath: uploaded.objectPath, outputObjectPath, outputFormat, filename: uploaded.filename });

        const { data: blob, error: dlErr } = await supabase.storage.from(bucketId).download(outputObjectPath);
        if (dlErr) throw dlErr;
        const markdown = await blob.text();
        if (!markdown.trim()) throw new Error('Converted markdown was empty.');

        const resourceName = toMarkdownFilename(uploaded.filename);
        const { data: inserted, error: insErr } = await supabase
          .from('project_resources')
          .insert({
            owner_id: userId,
            project_folder_id: projectFolderId,
            name: resourceName,
            kind: 'markdown',
            markdown,
            source: { type: 'docling', inputObjectPath: uploaded.objectPath, outputObjectPath, jobId: uploaded.jobId, originalFilename: uploaded.filename },
          } as any)
          .select('id')
          .single();
        if (insErr) throw insErr;

        // Best-effort cleanup: do not keep uploads/outputs around (we persist markdown only).
        try {
          await supabase.storage.from(bucketId).remove([uploaded.objectPath, outputObjectPath]);
        } catch {
          // ignore
        }

        const savedResourceId = String((inserted as any)?.id || '');
        setState({
          status: 'done',
          inputObjectPath: uploaded.objectPath,
          outputObjectPath,
          outputFormat,
          filename: uploaded.filename,
          downloadUrl: null,
          savedResourceId,
        });
        if (savedResourceId) onSavedResource?.(savedResourceId);
        return;
      }

      const downloadUrl = bucketId === 'docling-files'
        ? await createSignedDoclingFileUrl({ supabase, objectPath: outputObjectPath, expiresInSeconds: 60 * 30 })
        : (
            await supabase.storage.from(bucketId).createSignedUrl(outputObjectPath, 60 * 30).then((r) => (r.error ? null : r.data?.signedUrl || null)).catch(() => null)
          );
      setState({ status: 'done', inputObjectPath: uploaded.objectPath, outputObjectPath, outputFormat, filename: uploaded.filename, downloadUrl });
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : 'Conversion failed' });
    }
  };

  return (
    <div className="mac-window mac-double-outline p-5 space-y-4 max-w-[760px]">
      <div className="space-y-1">
        <div className="text-sm font-bold tracking-tight">Import / Convert (Docling)</div>
        <div className="text-xs opacity-70">Upload a document, convert it, and save the markdown as an Additional Resource in this project.</div>
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
            <div className="text-xs opacity-80">Saved to Additional resources.</div>
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

