import { randomBytes } from 'node:crypto';
import { exportKgAndVectorsForProject } from '@/lib/kg-vector-export';
import { parseJsonl } from '@/lib/server/jsonl';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { decryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { isAsyncJobCancelRequested, updateAsyncJob } from '@/lib/server/async-jobs/repo';
import type { AsyncJobRow } from '@/lib/server/async-jobs/types';

type JsonRecord = Record<string, unknown>;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function randomPublicId() {
  return `rag_${randomBytes(10).toString('base64url')}`;
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

function parseStateCursor(state: Record<string, unknown>): number {
  const n = Number(state.cursor || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function progressPct(cursor: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.floor((cursor / total) * 100)));
}

export async function runRagIngestJob(job: AsyncJobRow): Promise<Record<string, unknown>> {
  const admin = getAdminSupabaseClient();
  const input = (job.input || {}) as Record<string, unknown>;
  const ownerId = String(input.ownerId || job.owner_id || '').trim();
  const projectFolderId = String(input.projectFolderId || job.project_folder_id || '').trim();
  if (!ownerId) throw new Error('Missing ownerId in job input');
  if (!projectFolderId) throw new Error('Missing projectFolderId in job input');

  const openaiApiKey = decryptOpenAiApiKey(job.secret_payload);
  const embeddingModel = String(input.embeddingModel || '').trim() || undefined;
  const limitInput = Number(input.chunkLimit || envInt('RAG_EMBED_BATCH_SIZE', 48, 8, 256));
  const chunkLimit = Math.max(8, Math.min(96, Number.isFinite(limitInput) ? Math.floor(limitInput) : 48));

  await updateAsyncJob(job.id, {
    step: 'exporting',
    progress_pct: 1,
    state: {
      ...(job.state || {}),
      chunkLimit,
      ownerId,
      projectFolderId,
    },
  });

  const exp = await exportKgAndVectorsForProject({
    supabaseMode: true,
    supabase: admin,
    projectFolderId,
  });

  const chunkRecords = parseJsonl<JsonRecord>(exp.embeddingsJsonl).filter(
    (r) => r && r.type === 'chunk' && typeof r.id === 'string' && typeof r.text === 'string',
  );
  const graphRecords = parseJsonl<JsonRecord>(exp.graphJsonl);
  const entityRecords = graphRecords.filter((r) => r && r.type === 'entity' && typeof r.id === 'string' && typeof r.entityType === 'string');
  const edgeRecords = graphRecords.filter((r) => r && r.type === 'edge' && typeof r.id === 'string' && typeof r.edgeType === 'string');

  const existingProject = await admin
    .from('rag_projects')
    .select('public_id')
    .eq('owner_id', ownerId)
    .eq('project_folder_id', projectFolderId)
    .maybeSingle();
  if (existingProject.error) throw new Error(existingProject.error.message);
  const existingProjectRow = existingProject.data && typeof existingProject.data === 'object'
    ? (existingProject.data as { public_id?: unknown })
    : {};
  const existingPublicId = existingProjectRow.public_id ? String(existingProjectRow.public_id) : '';
  const publicId = existingPublicId || randomPublicId();

  const savedState = (job.state || {}) as Record<string, unknown>;
  let cursor = parseStateCursor(savedState);
  const totalChunks = chunkRecords.length;

  if (cursor === 0) {
    if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');

    await updateAsyncJob(job.id, {
      step: 'upserting_graph',
      progress_pct: totalChunks > 0 ? 2 : 90,
      state: {
        ...savedState,
        cursor,
        totalChunks,
        chunkLimit,
        publicProjectId: publicId,
        graphReady: false,
      },
    });

    {
      const { error } = await admin.from('rag_chunks').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);
      if (error) throw new Error(error.message);
    }
    {
      const { error } = await admin.from('kg_entities').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);
      if (error) throw new Error(error.message);
    }
    {
      const { error } = await admin.from('kg_edges').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);
      if (error) throw new Error(error.message);
    }

    {
      const { error } = await admin.from('rag_projects').upsert(
        {
          owner_id: ownerId,
          project_folder_id: projectFolderId,
          public_id: publicId,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'owner_id,project_folder_id' },
      );
      if (error) throw new Error(error.message);
    }

    for (const batch of chunkArray(entityRecords, 500)) {
      const rows = batch.map((r) => ({
        owner_id: ownerId,
        id: String(r.id),
        project_folder_id: projectFolderId,
        entity_type: String(r.entityType),
        file_id: typeof r.fileId === 'string' ? r.fileId : null,
        data: r,
      }));
      const { error } = await admin.from('kg_entities').upsert(rows, { onConflict: 'owner_id,id' });
      if (error) throw new Error(error.message);
    }

    for (const batch of chunkArray(edgeRecords, 500)) {
      const rows = batch.map((r) => ({
        owner_id: ownerId,
        id: String(r.id),
        project_folder_id: projectFolderId,
        edge_type: String(r.edgeType),
        src: String(r.src),
        dst: String(r.dst),
        data: r,
      }));
      const { error } = await admin.from('kg_edges').upsert(rows, { onConflict: 'owner_id,id' });
      if (error) throw new Error(error.message);
    }

    await updateAsyncJob(job.id, {
      step: 'embedding_chunks',
      progress_pct: progressPct(cursor, totalChunks),
      state: {
        ...savedState,
        cursor,
        totalChunks,
        chunkLimit,
        publicProjectId: publicId,
        graphReady: true,
      },
    });
  }

  while (cursor < totalChunks) {
    if (await isAsyncJobCancelRequested(job.id)) throw new Error('Job cancelled');

    const end = Math.min(cursor + chunkLimit, totalChunks);
    const slice = chunkRecords.slice(cursor, end);
    const texts = slice.map((c) => String(c.text || '').slice(0, 50_000));
    const embeddings = texts.length
      ? await embedTextsOpenAI(texts, {
          apiKey: openaiApiKey || undefined,
          model: embeddingModel,
        })
      : [];

    if (slice.length) {
      const rows = slice.map((c, j: number) => ({
        owner_id: ownerId,
        id: String(c.id),
        project_folder_id: projectFolderId,
        file_id: typeof c.fileId === 'string' ? c.fileId : null,
        resource_id: typeof c.resourceId === 'string' ? c.resourceId : null,
        file_kind: typeof c.fileKind === 'string' ? c.fileKind : null,
        anchor: typeof c.anchor === 'string' ? c.anchor : null,
        text: String(c.text || ''),
        embedding: embeddings[j],
        metadata: {
          fileId: c.fileId,
          fileKind: c.fileKind,
          anchor: c.anchor,
          resourceId: c.resourceId,
          resourceName: c.resourceName,
          resourceKind: c.resourceKind,
          projectFolderId: c.projectFolderId,
        } as never,
      }));
      const { error } = await admin.from('rag_chunks').upsert(rows, { onConflict: 'owner_id,id' });
      if (error) throw new Error(error.message);
    }

    cursor = end;
    await updateAsyncJob(job.id, {
      step: 'embedding_chunks',
      progress_pct: progressPct(cursor, totalChunks),
      state: {
        ...savedState,
        cursor,
        totalChunks,
        chunkLimit,
        publicProjectId: publicId,
        graphReady: true,
      },
    });
  }

  return {
    ok: true,
    projectFolderId,
    ownerId,
    publicProjectId: publicId,
    ingest: {
      cursor,
      nextCursor: cursor,
      done: true,
      chunkLimit,
      totalChunks,
    },
    stats: {
      files: exp.stats.files,
      entities: entityRecords.length,
      edges: edgeRecords.length,
      chunks: chunkRecords.length,
    },
  };
}
