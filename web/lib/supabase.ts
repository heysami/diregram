import { createBrowserClient } from '@supabase/ssr';

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  // Next.js may attempt to prerender client routes at build time.
  // Only create the browser client when we actually have a browser environment.
  if (typeof window === 'undefined') return null;
  return createBrowserClient(url, anon);
};
