import { secureStorage } from './secureStorage';

const KEY = 'diregram.sync.auth.session.v1';

type StoredAuthSessionV1 = {
  version: 1;
  accessToken: string;
  refreshToken: string;
};

export type StoredSupabaseSessionTokens = {
  access_token: string;
  refresh_token: string;
};

export async function loadStoredAuthSession(): Promise<StoredSupabaseSessionTokens | null> {
  const raw = await secureStorage.getItem(KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSessionV1>;
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      parsed.accessToken.trim() &&
      parsed.refreshToken.trim()
    ) {
      return {
        access_token: parsed.accessToken.trim(),
        refresh_token: parsed.refreshToken.trim(),
      };
    }
  } catch {
    // ignore invalid payload
  }

  return null;
}

export async function saveStoredAuthSession(accessToken: string, refreshToken: string): Promise<void> {
  const at = String(accessToken || '').trim();
  const rt = String(refreshToken || '').trim();
  if (!at || !rt) return;
  const payload: StoredAuthSessionV1 = {
    version: 1,
    accessToken: at,
    refreshToken: rt,
  };
  await secureStorage.setItem(KEY, JSON.stringify(payload));
}

export async function clearStoredAuthSession(): Promise<void> {
  await secureStorage.removeItem(KEY);
}
