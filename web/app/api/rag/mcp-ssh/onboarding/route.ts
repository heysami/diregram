import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { aliasFromTokenHash, getMcpSshConfigFromEnv, getRequestOrigin, sanitizeSshAlias, sha256Hex } from '@/lib/server/mcp-ssh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
      label: 'Account MCP SSH',
      token_hash: tokenHash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ssh = getMcpSshConfigFromEnv();
    const origin = getRequestOrigin(request);
    const alias = sanitizeSshAlias(aliasFromTokenHash(tokenHash));
    const installScriptUrl = `${origin}/api/rag/mcp-ssh/install?token=${encodeURIComponent(token)}&alias=${encodeURIComponent(alias)}`;
    const installCommand = `curl -fsSL "${installScriptUrl}" | bash`;
    const cursorSnippet = JSON.stringify(
      {
        mcpServers: {
          diregram: {
            command: 'ssh',
            args: [alias],
          },
        },
      },
      null,
      2,
    );
    const claudeDesktopSnippet = cursorSnippet;

    return NextResponse.json({
      ok: true,
      alias,
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
      installScriptUrl,
      installCommand,
      command: 'ssh',
      args: [alias],
      cursorSnippet,
      claudeDesktopSnippet,
      tokenHint: `${token.slice(0, 14)}...${token.slice(-6)}`,
      note: 'Run the setup command once on the user machine, then add the copied client command/snippet.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create SSH onboarding bundle';
    return NextResponse.json(
      {
        error: msg,
        debug: {
          hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          hasSshHost: Boolean(process.env.NEXT_PUBLIC_MCP_SSH_HOST),
          hasSshHostPrivate: Boolean(process.env.MCP_SSH_HOST),
          hasSshPort: Boolean(process.env.NEXT_PUBLIC_MCP_SSH_PORT || process.env.MCP_SSH_PORT),
          hasSshUser: Boolean(process.env.NEXT_PUBLIC_MCP_SSH_USER || process.env.MCP_SSH_USER),
        },
      },
      { status: 500 },
    );
  }
}
