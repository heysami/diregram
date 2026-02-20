import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { AppConfigV1 } from './appConfig';

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
  return data.session ?? null;
}

