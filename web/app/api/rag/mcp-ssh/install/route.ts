import { aliasFromTokenHash, getMcpSshConfigFromEnv, getRequestOrigin, sanitizeSshAlias, shSingle, sha256Hex } from '@/lib/server/mcp-ssh';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '').trim();
    const aliasParam = String(url.searchParams.get('alias') || '').trim();
    if (!token) return textResponse('echo "Missing token"; exit 1\n', 400);

    const tokenHash = sha256Hex(token);
    const admin = getAdminSupabaseClient();
    const { data, error } = await admin
      .from('rag_mcp_tokens')
      .select('id,revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) return textResponse(`echo ${shSingle(error.message)}; exit 1\n`, 500);
    if (!data || data.revoked_at) return textResponse('echo "Invalid or revoked token"; exit 1\n', 401);

    const ssh = getMcpSshConfigFromEnv();
    const origin = getRequestOrigin(request);
    const registerUrl = `${origin}/api/rag/mcp-ssh/register-key`;
    const alias = sanitizeSshAlias(aliasParam || aliasFromTokenHash(tokenHash));

    const script = `#!/usr/bin/env bash
set -euo pipefail

if ! command -v ssh-keygen >/dev/null 2>&1; then
  echo "Missing ssh-keygen (OpenSSH). Please install it first." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "Missing curl. Please install it first." >&2
  exit 1
fi

MCP_TOKEN=${shSingle(token)}
REGISTER_URL=${shSingle(registerUrl)}
SSH_ALIAS=${shSingle(alias)}
SSH_HOST=${shSingle(ssh.host)}
SSH_PORT=${shSingle(String(ssh.port))}
SSH_USER=${shSingle(ssh.user)}

KEY_DIR="$HOME/.ssh"
KEY_FILE="$KEY_DIR/$SSH_ALIAS"
PUB_FILE="$KEY_FILE.pub"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [ ! -f "$KEY_FILE" ]; then
  ssh-keygen -t ed25519 -N "" -f "$KEY_FILE" -C "$SSH_ALIAS" >/dev/null
fi

if [ ! -f "$PUB_FILE" ]; then
  echo "Public key not found at $PUB_FILE" >&2
  exit 1
fi

PUB_KEY="$(cat "$PUB_FILE")"
MACHINE_NAME="$(hostname 2>/dev/null || echo unknown-machine)"

curl -fsS -X POST "$REGISTER_URL" \\
  -H "content-type: application/x-www-form-urlencoded" \\
  --data-urlencode "token=$MCP_TOKEN" \\
  --data-urlencode "publicKey=$PUB_KEY" \\
  --data-urlencode "machineName=$MACHINE_NAME" >/dev/null

SSH_CONFIG="$KEY_DIR/config"
touch "$SSH_CONFIG"
chmod 600 "$SSH_CONFIG"

if ! grep -q "^Host $SSH_ALIAS$" "$SSH_CONFIG" 2>/dev/null; then
  {
    echo ""
    echo "Host $SSH_ALIAS"
    echo "  HostName $SSH_HOST"
    echo "  User $SSH_USER"
    echo "  Port $SSH_PORT"
    echo "  IdentityFile $KEY_FILE"
    echo "  IdentitiesOnly yes"
    echo "  StrictHostKeyChecking accept-new"
  } >> "$SSH_CONFIG"
fi

echo ""
echo "Diregram MCP SSH setup complete."
echo "SSH alias: $SSH_ALIAS"
echo ""
echo "Next:"
echo "1) Claude Code: claude mcp add diregram -- ssh $SSH_ALIAS"
echo "2) Codex:      codex mcp add diregram -- ssh $SSH_ALIAS"
echo "3) Cursor/Claude Desktop: use command=ssh args=[$SSH_ALIAS]"
`;

    return textResponse(script, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build setup script';
    return textResponse(`echo ${shSingle(msg)}; exit 1\n`, 500);
  }
}
