import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { updateAsyncJob, isAsyncJobCancelRequested } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';

function cleanBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(name: string) {
  const raw = String(name || '').trim() || 'document';
  return raw
    .replace(/\0/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function toMarkdownFilename(original: string) {
  const base = safeName(original).replace(/\.[^/.]+$/, '') || 'document';
  return `${base}.md`;
}

async function fetchDoclingConvert(url: string, payload: Record<string, unknown>) {
  const attempts = Math.max(1, Math.min(4, Number(process.env.DOCLING_FETCH_ATTEMPTS || 3)));
  const timeoutMs = Math.max(10_000, Math.min(295_000, Number(process.env.DOCLING_FETCH_TIMEOUT_MS || 240_000)));
  let lastErr: string | null = null;

  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if ([502, 503, 504].includes(res.status) && i + 1 < attempts) {
        await sleep(1200 * (i + 1));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = msg;
      if (i + 1 < attempts) {
        await sleep(1200 * (i + 1));
        continue;
      }
    }
  }

  throw new Error(lastErr || 'Docling service request failed');
}

export async function runDoclingConvertJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const admin = getAdminSupabaseClient();
  const input = (job.input || {}) as Record<string, unknown>;

  const userId = String(input.userId || '').trim();
  const bucketId = String(input.bucketId || 'docling-files').trim() || 'docling-files';
  const inputObjectPath = String(input.inputObjectPath || '').trim().replace(/^\/+/, '');
  const outputFormat = String(input.outputFormat || 'markdown').trim() === 'json' ? 'json' : 'markdown';
  const originalFilename = String(input.originalFilename || '').trim() || 'document';
  const jobId = String(input.jobId || '').trim() || job.id;
  const projectFolderId = String(input.projectFolderId || '').trim();
  const saveToProject = Boolean(input.saveToProject) && outputFormat === 'markdown' && !!projectFolderId;

  if (!userId) throw new Error('Missing userId in docling job input');
  if (!inputObjectPath) throw new Error('Missing inputObjectPath in docling job input');

  await updateAsyncJob(job.id, {
    step: 'docling_convert',
    progress_pct: 10,
    state: {
      ...(job.state || {}),
      inputObjectPath,
      outputFormat,
    },
  });

  if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');

  const base = cleanBaseUrl(process.env.DOCLING_SERVICE_URL || 'http://127.0.0.1:8686');
  const url = `${base}/convert`;
  const res = await fetchDoclingConvert(url, {
    userId,
    bucketId,
    objectPath: inputObjectPath,
    originalFilename,
    jobId,
    outputFormat,
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
    const detail = typeof json.detail === 'string' ? json.detail : '';
    const msg = detail ? detail : raw.trim() ? raw.trim().slice(0, 600) : `Failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const outputObjectPath = String(json.outputObjectPath || '').trim();
  if (!outputObjectPath) throw new Error('Docling service returned no outputObjectPath');

  await updateAsyncJob(job.id, {
    step: saveToProject ? 'saving_resource' : 'done',
    progress_pct: saveToProject ? 75 : 95,
    state: {
      ...(job.state || {}),
      inputObjectPath,
      outputObjectPath,
      outputFormat,
    },
  });

  let savedResourceId = '';
  if (saveToProject) {
    if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');

    const { data: blob, error: dlErr } = await admin.storage.from(bucketId).download(outputObjectPath);
    if (dlErr) throw new Error(dlErr.message);
    const markdown = await blob.text();
    if (!markdown.trim()) throw new Error('Converted markdown was empty.');

    const resourceName = toMarkdownFilename(originalFilename);
    const { data: inserted, error: insErr } = await admin
      .from('project_resources')
      .insert({
        owner_id: userId,
        project_folder_id: projectFolderId,
        name: resourceName,
        kind: 'markdown',
        markdown,
        source: {
          type: 'docling',
          inputObjectPath,
          outputObjectPath,
          jobId,
          originalFilename,
        },
      } as never)
      .select('id')
      .single();
    if (insErr) throw new Error(insErr.message);

    const insertedId = inserted && typeof inserted === 'object' ? (inserted as { id?: unknown }).id : '';
    savedResourceId = String(insertedId || '').trim();

    try {
      await admin.storage.from(bucketId).remove([inputObjectPath, outputObjectPath]);
    } catch {
      // ignore cleanup failures
    }
  }

  return {
    ok: true,
    userId,
    bucketId,
    inputObjectPath,
    outputObjectPath,
    outputFormat,
    savedResourceId: savedResourceId || null,
    projectFolderId: projectFolderId || null,
  };
}
