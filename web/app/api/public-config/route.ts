import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const origin = new URL(request.url).origin;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Server missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 });
  }

  return NextResponse.json({
    supabaseUrl,
    supabaseAnonKey,
    nexusmapApiBaseUrl: origin,
  });
}

