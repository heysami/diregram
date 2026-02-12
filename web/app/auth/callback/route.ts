import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function safeNext(next: string | null) {
  if (!next) return '/';
  // Only allow relative redirects within this site.
  if (!next.startsWith('/')) return '/';
  return next;
}

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const code = reqUrl.searchParams.get('code');
  const next = safeNext(reqUrl.searchParams.get('next'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.redirect(new URL(next, reqUrl.origin));
  }

  // In Next route handlers, we can set cookies directly on the response.
  const cookieStore = cookies();

  if (code) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    });

    // Establish the session by exchanging the PKCE code.
    // If this fails (expired/invalid), just continue to the app.
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      // ignore
    }
  }

  return NextResponse.redirect(new URL(next, reqUrl.origin));
}

