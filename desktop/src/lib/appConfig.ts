import { secureStorage } from './secureStorage';
import { buildEnv } from './env';

export type AppConfigV1 = {
  version: 1;
  supabaseUrl: string;
  supabaseAnonKey: string;
  diregramApiBaseUrl: string;
};

const CONFIG_KEY = 'diregram.sync.config.v1';

export async function loadAppConfig(): Promise<AppConfigV1 | null> {
  const raw = await secureStorage.getItem(CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<AppConfigV1>;
      if (
        parsed &&
        parsed.version === 1 &&
        typeof parsed.supabaseUrl === 'string' &&
        typeof parsed.supabaseAnonKey === 'string' &&
        typeof (parsed as any).diregramApiBaseUrl === 'string' &&
        parsed.supabaseUrl.trim() &&
        parsed.supabaseAnonKey.trim() &&
        String((parsed as any).diregramApiBaseUrl).trim()
      ) {
        return {
          version: 1,
          supabaseUrl: parsed.supabaseUrl.trim(),
          supabaseAnonKey: parsed.supabaseAnonKey.trim(),
          diregramApiBaseUrl: String((parsed as any).diregramApiBaseUrl).trim(),
        };
      }
    } catch {
      // ignore
    }
  }

  // Dev fallback: allow running with Vite env vars.
  if (buildEnv.supabaseUrl && buildEnv.supabaseAnonKey) {
    return {
      version: 1,
      supabaseUrl: buildEnv.supabaseUrl,
      supabaseAnonKey: buildEnv.supabaseAnonKey,
      diregramApiBaseUrl: buildEnv.diregramApiBaseUrl,
    };
  }

  return null;
}

export async function fetchPublicConfigFromDiregram(baseUrl: string): Promise<AppConfigV1> {
  const origin = baseUrl.trim().replace(/\/$/, '');
  const res = await fetch(`${origin}/api/public-config`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  if (!json?.supabaseUrl || !json?.supabaseAnonKey || !json?.diregramApiBaseUrl) {
    throw new Error('Bad public config response');
  }
  return {
    version: 1,
    supabaseUrl: String(json.supabaseUrl).trim(),
    supabaseAnonKey: String(json.supabaseAnonKey).trim(),
    diregramApiBaseUrl: String(json.diregramApiBaseUrl).trim().replace(/\/$/, ''),
  };
}

export async function saveAppConfig(config: Omit<AppConfigV1, 'version'>): Promise<AppConfigV1> {
  const next: AppConfigV1 = {
    version: 1,
    supabaseUrl: config.supabaseUrl.trim(),
    supabaseAnonKey: config.supabaseAnonKey.trim(),
    diregramApiBaseUrl: config.diregramApiBaseUrl.trim().replace(/\/$/, ''),
  };
  await secureStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export async function clearAppConfig(): Promise<void> {
  await secureStorage.removeItem(CONFIG_KEY);
}

