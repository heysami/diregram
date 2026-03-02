import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

export function normalizeSshPublicKey(input: string): string {
  return String(input || '')
    .replace(/\r/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const SSH_KEY_RE =
  /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/=]+(?:\s+[\w.@:+\-_/ ]+)?$/;

export function isValidSshPublicKey(input: string): boolean {
  const key = normalizeSshPublicKey(input);
  if (!key) return false;
  if (key.length > 8192) return false;
  return SSH_KEY_RE.test(key);
}

export type MpcSshConfig = {
  host: string;
  port: number;
  user: string;
};

export function getMcpSshConfigFromEnv(): MpcSshConfig {
  const host = String(process.env.NEXT_PUBLIC_MCP_SSH_HOST || '').trim();
  const portRaw = String(process.env.NEXT_PUBLIC_MCP_SSH_PORT || '22').trim();
  const user = String(process.env.NEXT_PUBLIC_MCP_SSH_USER || 'mcp').trim();
  const port = Number(portRaw);
  if (!host) throw new Error('Missing NEXT_PUBLIC_MCP_SSH_HOST');
  if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('Invalid NEXT_PUBLIC_MCP_SSH_PORT');
  if (!user) throw new Error('Missing NEXT_PUBLIC_MCP_SSH_USER');
  return { host, port, user };
}

export function getRequestOrigin(request: Request): string {
  const u = new URL(request.url);
  const host = String(request.headers.get('x-forwarded-host') || request.headers.get('host') || u.host || '').split(',')[0].trim();
  const proto = String(request.headers.get('x-forwarded-proto') || u.protocol.replace(/:$/, '') || 'https')
    .split(',')[0]
    .trim();
  if (!host) return u.origin;
  return `${proto}://${host}`;
}

export function aliasFromTokenHash(tokenHash: string): string {
  const suffix = String(tokenHash || '').slice(0, 10);
  return `diregram-mcp-${suffix || 'user'}`;
}

export function sanitizeSshAlias(input: string): string {
  const raw = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return raw || 'diregram-mcp-user';
}

export function sanitizeMachineName(input: string): string {
  const name = String(input || '')
    .trim()
    .replace(/[^\w .@:+-]/g, '-')
    .slice(0, 120);
  return name || 'unknown-machine';
}

export function shSingle(input: string): string {
  return `'${String(input || '').replace(/'/g, `'\\''`)}'`;
}
