import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { getMcpSshConfigFromEnv, shSingle, sha256Hex } from '@/lib/server/mcp-ssh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      label: 'Account MCP SSH',
      token_hash: tokenHash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ssh = getMcpSshConfigFromEnv();
    const remoteNode = String(process.env.MCP_SSH_REMOTE_NODE || 'node').trim();
    const remoteStdioPath = String(process.env.MCP_SSH_REMOTE_STDIO_PATH || '/opt/render/project/src/mcp-server-nexusmap-rag-hosted/src/stdio.js').trim();
    if (!remoteNode) throw new Error('Missing MCP_SSH_REMOTE_NODE');
    if (!remoteStdioPath) throw new Error('Missing MCP_SSH_REMOTE_STDIO_PATH');
    const sshBaseArgs = [
      '-T',
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'UpdateHostKeys=no',
      '-o',
      'ConnectTimeout=20',
      '-o',
      'LogLevel=ERROR',
      '-p',
      String(ssh.port),
      `${ssh.user}@${ssh.host}`,
    ];
    const useLoginShell = String(process.env.MCP_SSH_USE_LOGIN_SHELL || '0').trim() === '1';
    const args = useLoginShell
      ? [
          ...sshBaseArgs,
          'bash',
          '-lc',
          `exec ${shSingle(remoteNode)} ${shSingle(remoteStdioPath)} --token ${shSingle(token)}`,
        ]
      : [...sshBaseArgs, remoteNode, remoteStdioPath, '--token', token];
    const argsJson = JSON.stringify(args, null, 2);
    const tomlArgs = args.map((a) => JSON.stringify(a)).join(', ');
    const codexToml = `[mcp_servers.diregram]\ncommand = \"ssh\"\nargs = [${tomlArgs}]`;
    const cursorSnippet = JSON.stringify(
      {
        mcpServers: {
          diregram: {
            command: 'ssh',
            args,
          },
        },
      },
      null,
      2,
    );
    const claudeDesktopSnippet = cursorSnippet;

    return NextResponse.json({
      ok: true,
      supabaseUrlForToken: String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() || null,
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
      command: 'ssh',
      args,
      argsJson,
      codexToml,
      cursorSnippet,
      claudeDesktopSnippet,
      tokenHint: `${token.slice(0, 14)}...${token.slice(-6)}`,
      note: 'Copy the command/args into Claude/Cursor/Codex MCP settings.',
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
          hasRemoteNode: Boolean(process.env.MCP_SSH_REMOTE_NODE || 'node'),
          hasRemoteStdioPath: Boolean(process.env.MCP_SSH_REMOTE_STDIO_PATH || '/opt/render/project/src/mcp-server-nexusmap-rag-hosted/src/stdio.js'),
        },
      },
      { status: 500 },
    );
  }
}
