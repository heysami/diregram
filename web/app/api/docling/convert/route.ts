import { NextResponse } from 'next/server';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

export async function POST(request: Request) {
  try {
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
          projectFolderId?: string;
        };

    const inputObjectPath = String(body?.inputObjectPath || '').trim().replace(/^\/+/, '');
    if (!inputObjectPath) return NextResponse.json({ error: 'Missing inputObjectPath' }, { status: 400 });

    const requiredPrefix = `docling/${user.id}/`;
    if (!inputObjectPath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: `inputObjectPath must start with ${requiredPrefix}` }, { status: 400 });
    }

    const outputFormat = body?.outputFormat === 'json' ? 'json' : 'markdown';
    const originalFilename = body?.originalFilename ? String(body.originalFilename).slice(0, 260) : undefined;
    const importJobId = body?.jobId ? String(body.jobId).slice(0, 80) : undefined;
    const projectFolderId = String(body?.projectFolderId || '').trim();
    const saveToProject = outputFormat === 'markdown' && !!projectFolderId;

    const admin = getAdminSupabaseClient();
    const dedupeKey = `docling:${user.id}:${inputObjectPath}:${outputFormat}:${projectFolderId || '-'}`;
    const { job, deduped } = await createAsyncJob({
      kind: 'docling_convert',
      ownerId: user.id,
      requesterUserId: user.id,
      projectFolderId: projectFolderId || null,
      dedupeKey,
      input: {
        authMode: 'cookie_user',
        userId: user.id,
        bucketId: 'docling-files',
        inputObjectPath,
        outputFormat,
        originalFilename: originalFilename || '',
        jobId: importJobId || '',
        projectFolderId: projectFolderId || null,
        saveToProject,
      },
    }, admin);

    return NextResponse.json(
      {
        ok: true,
        async: true,
        deduped,
        jobId: job.id,
        status: job.status,
        pollUrl: pollUrl(request, job.id),
      },
      { status: 202 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Docling async enqueue failed: ${msg}` },
      { status: 502 },
    );
  }
}
