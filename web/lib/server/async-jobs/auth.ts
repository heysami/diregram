import { createClient } from '@supabase/supabase-js';
import { hasValidRagApiKey } from '@/lib/server/rag-auth';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';

export type ResolvedAsyncJobAuth =
  | { mode: 'api_key' }
  | { mode: 'user'; user: { id: string; email: string | null }; source: 'cookie' | 'bearer' }
  | { mode: 'none' };

function getBearerToken(request: Request): string | null {
  const h = String(request.headers.get('authorization') || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

async function resolveBearerUser(token: string): Promise<{ id: string; email: string | null } | null> {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anon) return null;

  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function resolveAsyncJobRequestAuth(request: Request): Promise<ResolvedAsyncJobAuth> {
  if (hasValidRagApiKey(request)) return { mode: 'api_key' };

  const bearer = getBearerToken(request);
  if (bearer) {
    const user = await resolveBearerUser(bearer);
    if (user) return { mode: 'user', user, source: 'bearer' };
  }

  try {
    const { user } = await getUserSupabaseClient();
    if (user) return { mode: 'user', user, source: 'cookie' };
  } catch {
    // ignore
  }

  return { mode: 'none' };
}
