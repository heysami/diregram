import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getMcpSshConfigFromEnv, isValidSshPublicKey, normalizeSshPublicKey, sanitizeMachineName, sha256Hex } from '@/lib/server/mcp-ssh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegisterBody = {
  token: string;
  publicKey: string;
  machineName: string;
};

async function parseRegisterBody(request: Request): Promise<RegisterBody> {
  const ct = String(request.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const json = (await request.json().catch(() => null)) as null | { token?: string; publicKey?: string; machineName?: string };
    return {
      token: String(json?.token || '').trim(),
      publicKey: String(json?.publicKey || '').trim(),
      machineName: String(json?.machineName || '').trim(),
    };
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const raw = await request.text();
    const params = new URLSearchParams(raw);
    return {
      token: String(params.get('token') || '').trim(),
      publicKey: String(params.get('publicKey') || '').trim(),
      machineName: String(params.get('machineName') || '').trim(),
    };
  }
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  return {
    token: String(params.get('token') || '').trim(),
    publicKey: String(params.get('publicKey') || '').trim(),
    machineName: String(params.get('machineName') || '').trim(),
  };
}

function keyFingerprintHex(publicKey: string): string {
  return createHash('sha256').update(publicKey, 'utf8').digest('hex');
}

export async function POST(request: Request) {
  try {
    const body = await parseRegisterBody(request);
    const token = String(body.token || '').trim();
    const publicKey = normalizeSshPublicKey(body.publicKey);
    const machineName = sanitizeMachineName(body.machineName);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    if (!publicKey) return NextResponse.json({ error: 'Missing publicKey' }, { status: 400 });
    if (!isValidSshPublicKey(publicKey)) return NextResponse.json({ error: 'Invalid SSH public key format' }, { status: 400 });

    const tokenHash = sha256Hex(token);
    const admin = getAdminSupabaseClient();
    const { data: mcpToken, error: tokenErr } = await admin
      .from('rag_mcp_tokens')
      .select('id,owner_id,revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (tokenErr) return NextResponse.json({ error: tokenErr.message }, { status: 500 });
    if (!mcpToken || mcpToken.revoked_at) return NextResponse.json({ error: 'Invalid or revoked token' }, { status: 401 });

    const fingerprint = keyFingerprintHex(publicKey);
    const { error: keyErr } = await admin.from('rag_mcp_ssh_keys').upsert(
      {
        owner_id: mcpToken.owner_id,
        token_id: mcpToken.id,
        key_name: machineName,
        public_key: publicKey,
        public_key_fingerprint: fingerprint,
        revoked_at: null,
      },
      { onConflict: 'token_id,public_key_fingerprint' },
    );
    if (keyErr) return NextResponse.json({ error: keyErr.message }, { status: 500 });

    const ssh = getMcpSshConfigFromEnv();
    return NextResponse.json({
      ok: true,
      keyFingerprint: fingerprint.slice(0, 16),
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUser: ssh.user,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to register SSH public key';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

