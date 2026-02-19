import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';

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

function sha256Hex(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function POST(request: Request) {
  const { user } = await getUserSupabaseClient();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as null | { projectFolderId?: string; label?: string };
  const projectFolderId = String(body?.projectFolderId || '').trim();
  const label = String(body?.label || '').trim();
  if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

  const admin = getAdminSupabaseClient();
  const { data: folder, error: folderErr } = await admin
    .from('folders')
    .select('id,owner_id,access,parent_id')
    .eq('id', projectFolderId)
    .maybeSingle();
  if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
  if (!folder) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (!canEditFolder(folder as any, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Create a high-entropy opaque token (does not include project IDs).
  const token = `nm_mcp_${randomBytes(32).toString('base64url')}`;
  const tokenHash = sha256Hex(token);

  const { error: insErr } = await admin.from('rag_mcp_shares').insert({
    owner_id: (folder as any).owner_id,
    project_folder_id: projectFolderId,
    label,
    token_hash: tokenHash,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_MCP_SERVER_URL || '';
  const mcpUrl = base ? `${base.replace(/\/+$/, '')}/sse?token=${encodeURIComponent(token)}` : null;

  return NextResponse.json({
    ok: true,
    token,
    mcpUrl,
    note: 'This token will be shown only once. Save it somewhere safe.',
  });
}

