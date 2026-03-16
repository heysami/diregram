import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptSecretPayload } from '@/lib/server/async-jobs/crypto';
import { toAsyncJobSummary, type AsyncJobRow } from '@/lib/server/async-jobs/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };
type FolderRow = { id: string; owner_id: string; access: unknown };

type PipelineUploadInput = {
  objectPath: string;
  name: string;
  size: number;
  mimeType: string;
};

type PipelineGenerationProvider = 'claude' | 'openai';

function normalizeEmail(s: string) {
  return String(s || '').trim().toLowerCase();
}

function canViewFolder(folder: { owner_id: string; access: unknown }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = ((folder.access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = normalizeEmail(user.email);
  return people.some((p) => normalizeEmail(String(p?.email || '')) === e);
}

function canEditFolder(folder: { owner_id: string; access: unknown }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = ((folder.access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = normalizeEmail(user.email);
  return people.some((p) => normalizeEmail(String(p?.email || '')) === e && String(p?.role || '') === 'edit');
}

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

function clampText(input: unknown, max: number): string {
  return String(input || '').trim().slice(0, max);
}

function normalizeGenerationProvider(input: unknown): PipelineGenerationProvider {
  return String(input || '').trim().toLowerCase() === 'openai' ? 'openai' : 'claude';
}

function parseUploads(input: unknown): PipelineUploadInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : null))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      objectPath: clampText(row.objectPath, 600).replace(/^\/+/, ''),
      name: clampText(row.name, 180),
      size: Number(row.size || 0),
      mimeType: clampText(row.mimeType, 120),
    }))
    .filter((row) => Boolean(row.objectPath) && Boolean(row.name))
    .slice(0, 50);
}

function hashUploads(uploads: PipelineUploadInput[]): string {
  const canonical = uploads
    .map((u) => `${u.objectPath}|${u.size}|${u.mimeType}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 24);
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const hostOrigin = new URL(request.url).origin;
    if (origin && origin !== hostOrigin) {
      return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
    }

    const { user } = await getUserSupabaseClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          projectFolderId?: unknown;
          uploads?: unknown;
          openaiApiKey?: unknown;
          claudeApiKey?: unknown;
          generationProvider?: unknown;
          embeddingModel?: unknown;
        };

    const projectFolderId = clampText(body?.projectFolderId, 120);
    if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

    const uploads = parseUploads(body?.uploads);
    if (!uploads.length) return NextResponse.json({ error: 'Missing uploads' }, { status: 400 });

    const requiredPrefix = `docling/${user.id}/pipeline/`;
    for (const item of uploads) {
      if (!item.objectPath.startsWith(requiredPrefix)) {
        return NextResponse.json({ error: `Upload path must start with ${requiredPrefix}` }, { status: 400 });
      }
    }

    const generationProvider = normalizeGenerationProvider(body?.generationProvider);
    const openaiApiKey = clampText(request.headers.get('x-openai-api-key') || body?.openaiApiKey, 500);
    const claudeApiKey = clampText(request.headers.get('x-claude-api-key') || body?.claudeApiKey, 500);
    if (!openaiApiKey && !String(process.env.OPENAI_API_KEY || '').trim()) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 400 });
    }
    if (generationProvider === 'claude' && !claudeApiKey && !String(process.env.CLAUDE_API_KEY || '').trim()) {
      return NextResponse.json({ error: 'Missing Claude API key' }, { status: 400 });
    }

    const admin = getAdminSupabaseClient();
    const { data: folderData, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folderData) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const folder = folderData as FolderRow;

    if (!canEditFolder(folder, user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ownerId = clampText(folder.owner_id, 120);
    if (!ownerId) return NextResponse.json({ error: 'Project owner not found' }, { status: 500 });

    const secretPayload = encryptSecretPayload({
      openaiApiKey: openaiApiKey || null,
      claudeApiKey: claudeApiKey || null,
    });

    const uploadHash = hashUploads(uploads);
    const { job, deduped } = await createAsyncJob(
      {
        kind: 'project_pipeline',
        ownerId,
        requesterUserId: user.id,
        projectFolderId,
        dedupeKey: `project_pipeline:${ownerId}:${projectFolderId}:${generationProvider}:${uploadHash}`,
        secretPayload,
        input: {
          authMode: 'cookie_user',
          ownerId,
          projectFolderId,
          requestedBy: user.id,
          uploads,
          generationProvider,
          embeddingModel: clampText(body?.embeddingModel, 120) || null,
        },
      },
      admin,
    );

    return NextResponse.json(
      {
        ok: true,
        async: true,
        deduped,
        jobId: job.id,
        status: job.status,
        pollUrl: pollUrl(request, job.id),
      },
      { status: 202 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getUserSupabaseClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const projectFolderId = clampText(url.searchParams.get('projectFolderId'), 120);
    if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

    const admin = getAdminSupabaseClient();
    const { data: folderData, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folderData) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const folder = folderData as FolderRow;
    if (!canViewFolder(folder, user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('async_jobs')
      .select('*')
      .eq('project_folder_id', projectFolderId)
      .eq('kind', 'project_pipeline')
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = ((data || []) as AsyncJobRow[]).map((row) => {
      const summary = toAsyncJobSummary(row);
      const result = row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>) : {};
      const state = row.state && typeof row.state === 'object' ? (row.state as Record<string, unknown>) : {};
      const timelineRaw = Array.isArray(state.timeline) ? state.timeline : [];
      const timeline = timelineRaw
        .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({
          at: clampText(item.at, 80) || summary.updatedAt,
          kind: clampText(item.kind, 60) || 'stage',
          step: clampText(item.step, 120) || summary.step || '',
          progressPct: Number(item.progressPct || summary.progressPct || 0),
          mode: clampText(item.mode, 80) || '',
          attempt: Number(item.attempt || 0),
          errorCount: Number(item.errorCount || 0),
          warningCount: Number(item.warningCount || 0),
        }))
        .slice(-160);

      const monitor = state.diagramMonitor && typeof state.diagramMonitor === 'object' ? (state.diagramMonitor as Record<string, unknown>) : {};
      const monitorErrors = Array.isArray(monitor.errors) ? monitor.errors.map((x) => clampText(x, 260)).filter(Boolean).slice(0, 10) : [];
      const monitorWarnings = Array.isArray(monitor.warnings) ? monitor.warnings.map((x) => clampText(x, 260)).filter(Boolean).slice(0, 10) : [];

      return {
        ...summary,
        startedAt: row.started_at || null,
        singleDiagramFileId: String(result.singleDiagramFileId || ''),
        primaryDiagramFileId: String(result.primaryDiagramFileId || ''),
        timeline,
        diagramMonitor: {
          attempt: Number(monitor.attempt || 0),
          mode: clampText(monitor.mode, 80) || '',
          markdownHash: clampText(monitor.markdownHash, 120) || '',
          lineCount: Number(monitor.lineCount || 0),
          previewMarkdown: String(monitor.previewMarkdown || ''),
          errorCount: Number(monitor.errorCount || 0),
          warningCount: Number(monitor.warningCount || 0),
          errors: monitorErrors,
          warnings: monitorWarnings,
          updatedAt: clampText(monitor.updatedAt, 80) || '',
        },
      };
    });

    return NextResponse.json({ ok: true, runs: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const hostOrigin = new URL(request.url).origin;
    if (origin && origin !== hostOrigin) {
      return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
    }

    const { user } = await getUserSupabaseClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          projectFolderId?: unknown;
          jobId?: unknown;
        };

    const projectFolderId = clampText(body?.projectFolderId, 120);
    const jobId = clampText(body?.jobId, 120);
    if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

    const admin = getAdminSupabaseClient();
    const { data: folderData, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folderData) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const folder = folderData as FolderRow;
    if (!canEditFolder(folder, user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: jobData, error: jobErr } = await admin
      .from('async_jobs')
      .select('id,status,project_folder_id,kind')
      .eq('id', jobId)
      .maybeSingle();
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
    if (!jobData) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    const job = jobData as { id: string; status: string; project_folder_id: string | null; kind: string };
    if (job.kind !== 'project_pipeline' || job.project_folder_id !== projectFolderId) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    if (!['failed', 'cancelled'].includes(String(job.status || ''))) {
      return NextResponse.json({ error: 'Only failed or cancelled runs can be deleted' }, { status: 409 });
    }

    const { error: deleteErr } = await admin.from('async_jobs').delete().eq('id', jobId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, deletedId: jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
