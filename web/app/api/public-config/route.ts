import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function withCors(res: NextResponse) {
  // This endpoint only returns PUBLIC config (same as NEXT_PUBLIC_*).
  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('access-control-allow-methods', 'GET,OPTIONS');
  res.headers.set('access-control-allow-headers', 'content-type,authorization');
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: Request) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const origin = new URL(request.url).origin;

  if (!supabaseUrl || !supabaseAnonKey) {
    return withCors(
      NextResponse.json({ error: 'Server missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 }),
    );
  }

  return withCors(
    NextResponse.json({
      supabaseUrl,
      supabaseAnonKey,
      diregramApiBaseUrl: origin,
    }),
  );
}

