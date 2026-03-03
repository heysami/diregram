import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { getMcpSshConfigFromEnv, shSingle, sha256Hex } from '@/lib/server/mcp-ssh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TargetClient = 'codex' | 'cursor' | 'claude_desktop' | 'claude_web';

function normalizeTargetClient(input: unknown): TargetClient {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'codex') return 'codex';
  if (raw === 'claude_desktop') return 'claude_desktop';
  if (raw === 'claude_web') return 'claude_web';
  return 'cursor';
}

async function parseBody(request: Request): Promise<{ targetClient: TargetClient; openAiApiKey: string; projectPublicId: string }> {
  const ct = String(request.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return { targetClient: 'cursor', openAiApiKey: '', projectPublicId: '' };
  }
  const body = (await request.json().catch(() => null)) as null | { client?: unknown; openAiApiKey?: unknown; projectPublicId?: unknown };
  return {
    targetClient: normalizeTargetClient(body?.client),
    openAiApiKey: String(body?.openAiApiKey || '').trim(),
    projectPublicId: String(body?.projectPublicId || '').trim(),
  };
}

function buildSshArgs(input: {
  sshHost: string;
  sshPort: number;
  sshUser: string;
  remoteNode: string;
  remoteStdioPath: string;
  token: string;
  openAiApiKey: string;
  useLoginShell: boolean;
}): string[] {
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
    String(input.sshPort),
    `${input.sshUser}@${input.sshHost}`,
  ];
  const openAiApiKey = String(input.openAiApiKey || '').trim();
  const useLoginShell = Boolean(input.useLoginShell);
  const remoteExecParts = [
    `exec ${shSingle(input.remoteNode)} ${shSingle(input.remoteStdioPath)}`,
    `--token ${shSingle(input.token)}`,
    openAiApiKey ? `--openai-api-key ${shSingle(openAiApiKey)}` : '',
  ].filter(Boolean);
  const remoteExecCommand = remoteExecParts.join(' ');
  if (useLoginShell) {
    return [...sshBaseArgs, `bash -lc ${shSingle(remoteExecCommand)}`];
  }
  return [...sshBaseArgs, remoteExecCommand];
}

export async function POST(request: Request) {
  try {
    const { user } = await getUserSupabaseClient();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { targetClient, openAiApiKey, projectPublicId } = await parseBody(request);

    const admin = getAdminSupabaseClient();
    const token = `nm_mcp_acct_${randomBytes(32).toString('base64url')}`;
    const tokenHash = sha256Hex(token);
    let tokenScope: 'account' | 'project' = 'account';
    let tokenProjectFolderId: string | null = null;
    if (projectPublicId) {
      const { data: projectRow, error: projectErr } = await admin
        .from('rag_projects')
        .select('project_folder_id')
        .eq('owner_id', user.id)
        .eq('public_id', projectPublicId)
        .maybeSingle();
      if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
      const folderId = String(projectRow?.project_folder_id || '').trim();
      if (!folderId) return NextResponse.json({ error: 'Unknown projectPublicId' }, { status: 400 });
      tokenScope = 'project';
      tokenProjectFolderId = folderId;
    }
    const { error } = await admin.from('rag_mcp_tokens').insert({
      owner_id: user.id,
      scope: tokenScope,
      project_folder_id: tokenProjectFolderId,
      label: tokenScope === 'project' ? 'Project MCP SSH' : 'Account MCP SSH',
      token_hash: tokenHash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ssh = getMcpSshConfigFromEnv();
    const remoteNode = String(process.env.MCP_SSH_REMOTE_NODE || 'node').trim();
    const remoteStdioPath = String(process.env.MCP_SSH_REMOTE_STDIO_PATH || '/opt/render/project/src/mcp-server-nexusmap-rag-hosted/src/stdio.js').trim();
    if (!remoteNode) throw new Error('Missing MCP_SSH_REMOTE_NODE');
    if (!remoteStdioPath) throw new Error('Missing MCP_SSH_REMOTE_STDIO_PATH');
    const useLoginShell = String(process.env.MCP_SSH_USE_LOGIN_SHELL || '0').trim() === '1';
    const args = buildSshArgs({
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
      remoteNode,
      remoteStdioPath,
      token,
      openAiApiKey,
      useLoginShell,
    });
    const argsWithOpenAiKey = buildSshArgs({
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
      remoteNode,
      remoteStdioPath,
      token,
      openAiApiKey: openAiApiKey || '__YOUR_OPENAI_API_KEY__',
      useLoginShell,
    });
    const argsJson = JSON.stringify(args, null, 2);
    const argsWithOpenAiKeyJson = JSON.stringify(argsWithOpenAiKey, null, 2);
    const tomlArgs = args.map((a) => JSON.stringify(a)).join(', ');
    const tomlArgsWithOpenAiKey = argsWithOpenAiKey.map((a) => JSON.stringify(a)).join(', ');
    const codexToml = `[mcp_servers.diregram]\ncommand = \"ssh\"\nargs = [${tomlArgs}]`;
    const codexTomlWithOpenAiKey = `[mcp_servers.diregram]\ncommand = \"ssh\"\nargs = [${tomlArgsWithOpenAiKey}]`;
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
    const cursorSnippetWithOpenAiEnv = JSON.stringify(
      {
        mcpServers: {
          diregram: {
            command: 'ssh',
            args,
            env: {
              OPENAI_API_KEY: '__YOUR_OPENAI_API_KEY__',
            },
          },
        },
      },
      null,
      2,
    );
    const claudeDesktopSnippet = cursorSnippet;
    const claudeDesktopSnippetWithOpenAiEnv = cursorSnippetWithOpenAiEnv;
    const mcpServerBase = String(process.env.NEXT_PUBLIC_MCP_SERVER_URL || process.env.MCP_SERVER_URL || '').trim();
    const normalizedMcpServerBase = mcpServerBase.replace(/\/+$/, '');
    const claudeConnectorUrl = normalizedMcpServerBase ? `${normalizedMcpServerBase}/sse?token=${encodeURIComponent(token)}` : '';
    if (targetClient === 'claude_web' && !claudeConnectorUrl) {
      return NextResponse.json(
        {
          error: 'Missing NEXT_PUBLIC_MCP_SERVER_URL (or MCP_SERVER_URL) for Claude Web connector',
        },
        { status: 500 },
      );
    }
    const note =
      targetClient === 'claude_web'
        ? 'Claude Web connector: use Remote MCP server URL and leave OAuth fields empty.'
        : tokenScope === 'project'
          ? openAiApiKey
            ? 'STDIO config includes your OpenAI key and a project-scoped token (project is retained).'
            : 'STDIO config uses a project-scoped token (project is retained).'
          : openAiApiKey
          ? 'STDIO config includes your OpenAI key in arguments.'
          : 'STDIO config generated without OpenAI key. Add it manually or regenerate with key.';

    return NextResponse.json({
      ok: true,
      targetClient,
      tokenScope,
      projectPublicId: projectPublicId || null,
      supabaseUrlForToken: String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim() || null,
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
      command: 'ssh',
      args,
      argsWithOpenAiKey,
      argsJson,
      argsWithOpenAiKeyJson,
      codexToml,
      codexTomlWithOpenAiKey,
      cursorSnippet,
      cursorSnippetWithOpenAiEnv,
      claudeDesktopSnippet,
      claudeDesktopSnippetWithOpenAiEnv,
      claudeConnectorUrl,
      tokenHint: `${token.slice(0, 14)}...${token.slice(-6)}`,
      note,
      hasInjectedOpenAiKey: Boolean(openAiApiKey),
      supportsOauth: false,
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
