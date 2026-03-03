import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };
type FolderRow = { id: string; owner_id: string; access: unknown; parent_id: string | null };

function withCors(res: NextResponse) {
  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('access-control-allow-methods', 'POST,OPTIONS');
  res.headers.set('access-control-allow-headers', 'content-type,authorization,x-openai-api-key');
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function canEditFolder(folder: { owner_id: string; access: unknown }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = ((folder.access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = user.email.trim().toLowerCase();
  return people.some((p) => String(p?.email || '').trim().toLowerCase() === e && String(p?.role || '') === 'edit');
}

function getBearerToken(request: Request): string | null {
  const h = String(request.headers.get('authorization') || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as null | {
      projectFolderId?: string;
      cursor?: number;
      chunkLimit?: number;
      openaiApiKey?: string;
      embeddingModel?: string;
    };
    const projectFolderId = String(body?.projectFolderId || '').trim();
    if (!projectFolderId) return withCors(NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 }));

    const jwt = getBearerToken(request);
    if (!jwt) return withCors(NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 }));

    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    if (!url || !anon) return withCors(NextResponse.json({ error: 'Server missing Supabase public env' }, { status: 500 }));

    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr) return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const requester = userData.user ? { id: userData.user.id, email: userData.user.email ?? null } : null;
    if (!requester) return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const openaiApiKey = String(request.headers.get('x-openai-api-key') || body?.openaiApiKey || '').trim() || null;
    const embeddingModel = String(body?.embeddingModel || '').trim() || null;
    const chunkLimit = Number(body?.chunkLimit ?? process.env.RAG_EMBED_BATCH_SIZE ?? 48);

    const admin = getAdminSupabaseClient();

    const { data: folder, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access,parent_id')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return withCors(NextResponse.json({ error: folderErr.message }, { status: 500 }));
    if (!folder) return withCors(NextResponse.json({ error: 'Project not found' }, { status: 404 }));

    const folderRow = folder as FolderRow;

    if (!canEditFolder(folderRow, requester)) {
      return withCors(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    }

    const ownerId = String(folderRow.owner_id || '').trim();
    if (!ownerId) return withCors(NextResponse.json({ error: 'Project owner not found' }, { status: 500 }));

    const secretPayload = encryptOpenAiApiKey(openaiApiKey);
    const { job, deduped } = await createAsyncJob({
      kind: 'rag_ingest_jwt',
      ownerId,
      requesterUserId: requester.id,
      projectFolderId,
      dedupeKey: `rag_ingest:${ownerId}:${projectFolderId}`,
      secretPayload,
      input: {
        authMode: 'jwt_bearer',
        ownerId,
        projectFolderId,
        embeddingModel,
        chunkLimit,
        requestedBy: requester.id,
      },
    }, admin);

    return withCors(
      NextResponse.json(
        {
          ok: true,
          async: true,
          deduped,
          jobId: job.id,
          status: job.status,
          pollUrl: pollUrl(request, job.id),
        },
        { status: 202 },
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return withCors(NextResponse.json({ error: msg }, { status: 500 }));
  }
}
