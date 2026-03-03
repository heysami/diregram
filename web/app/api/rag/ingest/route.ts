import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { hasValidRagApiKey } from '@/lib/server/rag-auth';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };
type FolderRow = { id: string; owner_id: string; access: unknown; parent_id: string | null };

function canEditFolder(folder: { owner_id: string; access: unknown }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = ((folder.access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = user.email.trim().toLowerCase();
  return people.some((p) => String(p?.email || '').trim().toLowerCase() === e && String(p?.role || '') === 'edit');
}

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

export async function POST(request: Request) {
  try {
    const isApiKey = hasValidRagApiKey(request);
    const origin = request.headers.get('origin');
    const hostOrigin = new URL(request.url).origin;
    if (!isApiKey && origin && origin !== hostOrigin) {
      return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | null
      | { projectFolderId?: string; openaiApiKey?: string; embeddingModel?: string; chunkLimit?: number };
    const projectFolderId = String(body?.projectFolderId || '').trim();
    if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

    const openaiApiKey = String(request.headers.get('x-openai-api-key') || body?.openaiApiKey || '').trim() || null;
    const embeddingModel = String(body?.embeddingModel || '').trim() || null;
    const chunkLimit = Number(body?.chunkLimit ?? process.env.RAG_EMBED_BATCH_SIZE ?? 48);

    let requester: { id: string; email: string | null } | null = null;
    if (!isApiKey) {
      const { user } = await getUserSupabaseClient();
      requester = user;
      if (!requester) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminSupabaseClient();

    const { data: folder, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access,parent_id')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folder) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const folderRow = folder as FolderRow;
    const ownerId = String(folderRow.owner_id || '').trim();
    if (!ownerId) return NextResponse.json({ error: 'Project owner not found' }, { status: 500 });

    if (!isApiKey && requester) {
      if (!canEditFolder(folderRow, requester)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const secretPayload = encryptOpenAiApiKey(openaiApiKey);
    const { job, deduped } = await createAsyncJob({
      kind: 'rag_ingest',
      ownerId,
      requesterUserId: requester?.id || null,
      projectFolderId,
      dedupeKey: `rag_ingest:${ownerId}:${projectFolderId}`,
      secretPayload,
      input: {
        authMode: isApiKey ? 'api_key' : 'cookie_user',
        ownerId,
        projectFolderId,
        embeddingModel,
        chunkLimit,
        requestedBy: requester?.id || null,
      },
    }, admin);

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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
