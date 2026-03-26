import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { updateAsyncJob, isAsyncJobCancelRequested } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';
import { getDoclingConvertTimeoutMs, runDoclingConvert } from '@/lib/server/docling-service-client';

function cleanBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
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
  const timeoutMs = getDoclingConvertTimeoutMs(originalFilename);
  const attempts = Math.max(1, Math.min(4, Number(process.env.DOCLING_FETCH_ATTEMPTS || 3)));
  const result = await runDoclingConvert({
    baseUrl: base,
    timeoutMs,
    enqueueAttempts: attempts,
    payload: {
      userId,
      bucketId,
      objectPath: inputObjectPath,
      originalFilename,
      jobId,
      outputFormat,
    },
  });

  const outputObjectPath = String(result.outputObjectPath || '').trim();
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
