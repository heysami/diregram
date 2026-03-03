import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getEncryptionKey(): Buffer {
  const raw = String(process.env.ASYNC_JOB_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('Missing ASYNC_JOB_ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ASYNC_JOB_ENCRYPTION_KEY must be base64-encoded 32-byte key');
  return key;
}

export function encryptSecretPayload(payload: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const clear = Buffer.from(JSON.stringify(payload), 'utf8');
  const enc = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecretPayload(token: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload format');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const enc = Buffer.from(parts[2], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  const parsed = JSON.parse(out);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid decrypted payload');
  return parsed as Record<string, unknown>;
}

export function encryptOpenAiApiKey(apiKey: string | null): string | null {
  const key = String(apiKey || '').trim();
  if (!key) return null;
  return encryptSecretPayload({ openaiApiKey: key });
}

export function decryptOpenAiApiKey(secretPayload: string | null): string {
  if (!secretPayload) return '';
  const parsed = decryptSecretPayload(secretPayload);
  return String(parsed.openaiApiKey || '').trim();
}
