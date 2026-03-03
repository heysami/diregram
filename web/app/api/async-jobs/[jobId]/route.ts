import { NextResponse } from 'next/server';
import { getAsyncJobById } from '@/lib/server/async-jobs/repo';
import { resolveAsyncJobRequestAuth } from '@/lib/server/async-jobs/auth';
import { toAsyncJobSummary, type AsyncJobRow } from '@/lib/server/async-jobs/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractJobId(request: Request): string {
  const { pathname } = new URL(request.url);
  const m = pathname.match(/\/api\/async-jobs\/([^/]+)$/);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getJobAuthMode(job: AsyncJobRow): string {
  const input = job.input || {};
  const mode = (input as Record<string, unknown>).authMode;
  return String(mode || '');
}

function canReadJob(auth: Awaited<ReturnType<typeof resolveAsyncJobRequestAuth>>, job: AsyncJobRow): boolean {
  if (auth.mode === 'api_key') {
    return getJobAuthMode(job) === 'api_key';
  }
  if (auth.mode === 'user') {
    return auth.user.id === String(job.owner_id || '') || auth.user.id === String(job.requester_user_id || '');
  }
  return false;
}

export async function GET(request: Request) {
  try {
    const jobId = extractJobId(request);
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    if (!isUuid(jobId)) return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });

    const auth = await resolveAsyncJobRequestAuth(request);
    if (auth.mode === 'none') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const job = await getAsyncJobById(jobId);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!canReadJob(auth, job)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({
      ok: true,
      job: toAsyncJobSummary(job),
      result: job.result || {},
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
