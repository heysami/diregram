import { NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };
type FolderRow = { id: string; owner_id: string; access: unknown };

type FileGenerationTaskInput = {
  outputKind: 'note' | 'user_story_grid' | 'vision';
  fileName: string;
  prompt: string;
  artifactUrls?: string[];
  artifactFiles?: string[];
  artifactImages?: Array<{ name?: string; dataUrl?: string }>;
};

function coerceOutputKind(input: unknown): FileGenerationTaskInput['outputKind'] {
  if (input === 'vision') return 'vision';
  return input === 'user_story_grid' ? 'user_story_grid' : 'note';
}

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function canEditFolder(folder: { owner_id: string; access: unknown }, user: { id: string; email: string | null }) {
  if (folder.owner_id === user.id) return true;
  const people = ((folder.access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!user.email) return false;
  const e = user.email.trim().toLowerCase();
  return people.some((p) => normalizeEmail(String(p?.email || '')) === e && String(p?.role || '') === 'edit');
}

function clampText(input: unknown, max: number) {
  return String(input || '').trim().slice(0, max);
}

function coerceStringList(input: unknown, opts: { maxItems: number; maxCharsPerItem: number }): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => clampText(x, opts.maxCharsPerItem))
    .filter(Boolean)
    .slice(0, opts.maxItems);
}

function coerceImageList(input: unknown, opts: { maxItems: number; maxCharsPerItem: number }) {
  if (!Array.isArray(input)) return [] as Array<{ name: string; dataUrl: string }>;
  return input
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null)
    .map((x, idx) => ({
      name: clampText(x.name, 120) || `image-${idx + 1}`,
      dataUrl: clampText(x.dataUrl, opts.maxCharsPerItem),
    }))
    .filter((x) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(x.dataUrl))
    .slice(0, opts.maxItems);
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
          projectFolderId?: unknown;
          tasks?: unknown;
          openaiApiKey?: unknown;
          chatModel?: unknown;
          embeddingModel?: unknown;
        };

    const projectFolderId = clampText(body?.projectFolderId, 120);
    if (!projectFolderId) return NextResponse.json({ error: 'Missing projectFolderId' }, { status: 400 });

    const tasksRaw = Array.isArray(body?.tasks) ? (body?.tasks as unknown[]) : [];
    if (!tasksRaw.length) return NextResponse.json({ error: 'Missing tasks' }, { status: 400 });
    if (tasksRaw.length > 20) return NextResponse.json({ error: 'Maximum 20 tasks per run' }, { status: 400 });

    const tasks: FileGenerationTaskInput[] = tasksRaw
      .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((t) => ({
        outputKind: coerceOutputKind(t.outputKind),
        fileName: clampText(t.fileName, 160),
        prompt: clampText(t.prompt, 8000),
        artifactUrls: coerceStringList(t.artifactUrls, { maxItems: 8, maxCharsPerItem: 1000 }),
        artifactFiles: coerceStringList(t.artifactFiles, { maxItems: 20, maxCharsPerItem: 220 }),
        artifactImages: coerceImageList(t.artifactImages, { maxItems: 4, maxCharsPerItem: 1_000_000 }),
      }))
      .filter((t) => {
        if (!t.fileName) return false;
        if (t.outputKind === 'vision') {
          return Boolean(t.prompt) || Boolean(t.artifactUrls?.length) || Boolean(t.artifactFiles?.length) || Boolean(t.artifactImages?.length);
        }
        return Boolean(t.prompt);
      })
      .slice(0, 20);
    if (!tasks.length) return NextResponse.json({ error: 'No valid tasks' }, { status: 400 });

    const openaiApiKey = clampText(request.headers.get('x-openai-api-key') || body?.openaiApiKey, 400);
    if (!openaiApiKey && !String(process.env.OPENAI_API_KEY || '').trim()) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 400 });
    }

    const admin = getAdminSupabaseClient();
    const { data: folder, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folder) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const folderRow = folder as FolderRow;

    if (!canEditFolder(folderRow, user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ownerId = clampText(folderRow.owner_id, 120);
    if (!ownerId) return NextResponse.json({ error: 'Project owner not found' }, { status: 500 });

    const secretPayload = encryptOpenAiApiKey(openaiApiKey || null);
    const { job } = await createAsyncJob(
      {
        kind: 'ai_file_generation',
        ownerId,
        requesterUserId: user.id,
        projectFolderId,
        secretPayload,
        input: {
          authMode: 'cookie_user',
          ownerId,
          projectFolderId,
          requestedBy: user.id,
          tasks,
          chatModel: clampText(body?.chatModel, 120) || null,
          embeddingModel: clampText(body?.embeddingModel, 120) || null,
        },
      },
      admin,
    );

    return NextResponse.json(
      {
        ok: true,
        async: true,
        jobId: job.id,
        status: job.status,
        pollUrl: pollUrl(request, job.id),
      },
      { status: 202 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
