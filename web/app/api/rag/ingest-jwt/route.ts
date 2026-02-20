import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exportKgAndVectorsForProject } from '@/lib/kg-vector-export';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { parseJsonl } from '@/lib/server/jsonl';
import { embedTextsOpenAI } from '@/lib/server/openai-embeddings';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };

function canEditFolder(folder: { owner_id: string; access: any }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = (folder.access?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = user.email.trim().toLowerCase();
  return people.some((p) => String(p?.email || '').trim().toLowerCase() === e && String(p?.role || '') === 'edit');
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function randomPublicId() {
  return `rag_${randomBytes(10).toString('base64url')}`;
}

function getBearerToken(request: Request): string | null {
  const h = String(request.headers.get('authorization') || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | { projectFolderId?: string; openaiApiKey?: string; embeddingModel?: string };
  const projectFolderId = String(body?.projectFolderId || '').trim();
  if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

  const jwt = getBearerToken(request);
  if (!jwt) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return NextResponse.json({ error: 'Server missing Supabase public env' }, { status: 500 });

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requester = userData.user ? { id: userData.user.id, email: userData.user.email ?? null } : null;
  if (!requester) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const openaiApiKey = String(request.headers.get('x-openai-api-key') || body?.openaiApiKey || '').trim() || null;
  const embeddingModel = String(body?.embeddingModel || '').trim() || undefined;

  const admin = getAdminSupabaseClient();

  const { data: folder, error: folderErr } = await admin
    .from('folders')
    .select('id,owner_id,access,parent_id')
    .eq('id', projectFolderId)
    .maybeSingle();
  if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
  if (!folder) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (!canEditFolder(folder as any, requester)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ownerId = String((folder as any).owner_id || '').trim();
  if (!ownerId) return NextResponse.json({ error: 'Project owner not found' }, { status: 500 });

  const exp = await exportKgAndVectorsForProject({
    supabaseMode: true,
    supabase: admin,
    projectFolderId,
  });

  const chunkRecords = parseJsonl<any>(exp.embeddingsJsonl).filter((r) => r && r.type === 'chunk' && typeof r.id === 'string' && typeof r.text === 'string');
  const graphRecords = parseJsonl<any>(exp.graphJsonl);
  const entityRecords = graphRecords.filter((r) => r && r.type === 'entity' && typeof r.id === 'string' && typeof r.entityType === 'string');
  const edgeRecords = graphRecords.filter((r) => r && r.type === 'edge' && typeof r.id === 'string' && typeof r.edgeType === 'string');

  await admin.from('rag_chunks').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);
  await admin.from('kg_entities').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);
  await admin.from('kg_edges').delete().eq('owner_id', ownerId).eq('project_folder_id', projectFolderId);

  const existingProject = await admin
    .from('rag_projects')
    .select('public_id')
    .eq('owner_id', ownerId)
    .eq('project_folder_id', projectFolderId)
    .maybeSingle();
  const existingPublicId = (existingProject.data as any)?.public_id ? String((existingProject.data as any).public_id) : '';
  const publicId = existingPublicId || randomPublicId();
  await admin.from('rag_projects').upsert(
    {
      owner_id: ownerId,
      project_folder_id: projectFolderId,
      public_id: publicId,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: 'owner_id,project_folder_id' },
  );

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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const texts = chunkRecords.map((c: any) => String(c.text || '').slice(0, 50_000));
  const batchSize = Number(process.env.RAG_EMBED_BATCH_SIZE || 96);
  const textBatches = chunkArray(texts, Math.max(1, Math.min(256, batchSize)));
  const recordBatches = chunkArray(chunkRecords, Math.max(1, Math.min(256, batchSize)));

  for (let i = 0; i < textBatches.length; i++) {
    const t = textBatches[i];
    const recs = recordBatches[i];
    const embeddings = await embedTextsOpenAI(t, { apiKey: openaiApiKey || undefined, model: embeddingModel });
    const rows = recs.map((c: any, j: number) => ({
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
      } as any,
    }));
    const { error } = await admin.from('rag_chunks').upsert(rows, { onConflict: 'owner_id,id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    projectFolderId,
    ownerId,
    publicProjectId: publicId,
    stats: {
      files: exp.stats.files,
      entities: entityRecords.length,
      edges: edgeRecords.length,
      chunks: chunkRecords.length,
    },
  });
}

