import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { env } from './env';
import { secureStorage } from './secureStorage';

export const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    storage: secureStorage as any,
    detectSessionInUrl: false
  },
});

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

