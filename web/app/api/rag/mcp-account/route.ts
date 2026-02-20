import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sha256Hex(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function POST() {
  try {
    const { user } = await getUserSupabaseClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdminSupabaseClient();

    const token = `nm_mcp_acct_${randomBytes(32).toString('base64url')}`;
    const tokenHash = sha256Hex(token);

    const { error } = await admin.from('rag_mcp_tokens').insert({
      owner_id: user.id,
      scope: 'account',
      project_folder_id: null,
      label: 'Account MCP',
      token_hash: tokenHash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const base = process.env.NEXT_PUBLIC_MCP_SERVER_URL || '';
    const mcpUrl = base ? `${base.replace(/\/+$/, '')}/sse?token=${encodeURIComponent(token)}` : null;

    return NextResponse.json({
      ok: true,
      token,
      mcpUrl,
      note: 'This token will be shown only once. Save it somewhere safe.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create MCP account token';
    return NextResponse.json(
      {
        error: msg,
        debug: {
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          hasServiceRoleKeyService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          vercelEnv: process.env.VERCEL_ENV || null,
          nodeEnv: process.env.NODE_ENV || null,
        },
      },
      { status: 500 },
    );
  }
}

