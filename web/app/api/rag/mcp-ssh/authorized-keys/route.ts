import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type KeyRow = {
  token_id: string | null;
  public_key: string | null;
  public_key_fingerprint: string | null;
  revoked_at: string | null;
};

type TokenRow = {
  id: string | null;
  token_hash: string | null;
  revoked_at: string | null;
};

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function escapeCommand(input: string): string {
  return String(input || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function GET(request: Request) {
  const syncSecret = String(process.env.MCP_SSH_SYNC_SECRET || '').trim();
  if (!syncSecret) return textResponse('Missing MCP_SSH_SYNC_SECRET\n', 500);

  const url = new URL(request.url);
  const qSecret = String(url.searchParams.get('secret') || '').trim();
  const hSecret = String(request.headers.get('x-mcp-ssh-sync-secret') || '').trim();
  if (!qSecret && !hSecret) return textResponse('Unauthorized\n', 401);
  if (qSecret !== syncSecret && hSecret !== syncSecret) return textResponse('Unauthorized\n', 401);

  const forcedCommandTemplate = String(process.env.MCP_SSH_FORCED_COMMAND || '').trim();
  if (!forcedCommandTemplate) {
    return textResponse('Missing MCP_SSH_FORCED_COMMAND (use %TOKEN_HASH% placeholder)\n', 500);
  }

  const admin = getAdminSupabaseClient();
  const { data: keys, error: keyErr } = await admin
    .from('rag_mcp_ssh_keys')
    .select('token_id,public_key,public_key_fingerprint,revoked_at')
    .is('revoked_at', null);
  if (keyErr) return textResponse(`${keyErr.message}\n`, 500);

  const keyRows = (Array.isArray(keys) ? keys : []) as KeyRow[];
  const tokenIds = Array.from(new Set(keyRows.map((k) => String(k.token_id || '')).filter(Boolean)));
  if (!tokenIds.length) return textResponse('', 200);

  const { data: tokens, error: tokenErr } = await admin
    .from('rag_mcp_tokens')
    .select('id,token_hash,revoked_at')
    .in('id', tokenIds);
  if (tokenErr) return textResponse(`${tokenErr.message}\n`, 500);

  const tokenHashById = new Map<string, string>();
  for (const row of ((Array.isArray(tokens) ? tokens : []) as TokenRow[])) {
    if (row?.revoked_at) continue;
    const id = String(row.id || '');
    const tokenHash = String(row.token_hash || '');
    if (!id || !tokenHash) continue;
    tokenHashById.set(id, tokenHash);
  }

  const options = ['no-agent-forwarding', 'no-port-forwarding', 'no-pty', 'no-user-rc', 'no-X11-forwarding'];
  const lines: string[] = [];
  for (const keyRow of keyRows) {
    const tokenId = String(keyRow.token_id || '');
    const publicKey = String(keyRow.public_key || '').trim();
    const fingerprint = String(keyRow.public_key_fingerprint || '').slice(0, 16);
    const tokenHash = tokenHashById.get(tokenId);
    if (!publicKey || !tokenHash) continue;
    const cmdRaw = forcedCommandTemplate.includes('%TOKEN_HASH%')
      ? forcedCommandTemplate.replaceAll('%TOKEN_HASH%', tokenHash)
      : `${forcedCommandTemplate} --token-hash ${tokenHash}`;
    const cmd = `command="${escapeCommand(cmdRaw)}"`;
    lines.push(`${[cmd, ...options].join(',')} ${publicKey} diregram:${fingerprint}`);
  }

  return textResponse(lines.join('\n') + (lines.length ? '\n' : ''), 200);
}
