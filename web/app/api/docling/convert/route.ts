import { NextResponse } from 'next/server';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const hostOrigin = new URL(request.url).origin;
  if (origin && origin !== hostOrigin) {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }

  const { user } = await getUserSupabaseClient();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | null
    | {
        inputObjectPath?: string;
        outputFormat?: 'markdown' | 'json';
        originalFilename?: string;
        jobId?: string;
      };

  const inputObjectPath = String(body?.inputObjectPath || '').trim().replace(/^\/+/, '');
  if (!inputObjectPath) return NextResponse.json({ error: 'Missing inputObjectPath' }, { status: 400 });

  const requiredPrefix = `docling/${user.id}/`;
  if (!inputObjectPath.startsWith(requiredPrefix)) {
    return NextResponse.json({ error: `inputObjectPath must start with ${requiredPrefix}` }, { status: 400 });
  }

  const outputFormat = body?.outputFormat === 'json' ? 'json' : 'markdown';
  const originalFilename = body?.originalFilename ? String(body.originalFilename).slice(0, 260) : undefined;
  const jobId = body?.jobId ? String(body.jobId).slice(0, 80) : undefined;

  const base = cleanBaseUrl(process.env.DOCLING_SERVICE_URL || 'http://127.0.0.1:8686');
  const url = `${base}/convert`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      bucketId: 'docling-files',
      objectPath: inputObjectPath,
      originalFilename,
      jobId,
      outputFormat,
    }),
  });

  const raw = await res.text().catch(() => '');
  const json = (() => {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  if (!res.ok) {
    const msg = (json as any)?.detail ? String((json as any).detail) : raw.trim() ? raw.trim().slice(0, 600) : `Failed (HTTP ${res.status})`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const outputObjectPath = String((json as any)?.outputObjectPath || '').trim();
  const bucketId = String((json as any)?.bucketId || 'docling-files').trim() || 'docling-files';
  if (!outputObjectPath) return NextResponse.json({ error: 'Docling service returned no outputObjectPath' }, { status: 500 });

  return NextResponse.json({ ok: true, bucketId, outputObjectPath, outputFormat });
}

