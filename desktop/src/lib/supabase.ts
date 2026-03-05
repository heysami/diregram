import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { AppConfigV1 } from './appConfig';
import { clearStoredAuthSession, loadStoredAuthSession } from './authSession';

export function createSupabaseClient(config: AppConfigV1): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export async function getSession(supabase: SupabaseClient): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  // Fallback for desktop: recover from keychain-backed tokens if webview storage is stale/cleared.
  const stored = await loadStoredAuthSession();
  if (!stored) return null;

  const { error } = await supabase.auth.setSession(stored);
  if (error) {
    await clearStoredAuthSession().catch(() => {});
    return null;
  }

  const { data: next } = await supabase.auth.getSession();
  return next.session ?? null;
}
