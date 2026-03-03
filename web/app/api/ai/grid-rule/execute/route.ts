import { NextResponse } from 'next/server';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccessPerson = { email?: string; role?: string };

type FolderRow = {
  id: string;
  owner_id: string;
  access: unknown;
};

type FileRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  access: unknown;
  kind: string | null;
};

function pollUrl(request: Request, jobId: string) {
  const base = new URL(request.url);
  return `${base.origin}/api/async-jobs/${encodeURIComponent(jobId)}`;
}

function normalizeEmail(s: string) {
  return String(s || '').trim().toLowerCase();
}

function clampText(input: unknown, max: number) {
  return String(input || '').trim().slice(0, max);
}

function canEditFromAccess(access: unknown, userEmail: string | null) {
  const people = ((access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!people.length || !userEmail) return false;
  const email = normalizeEmail(userEmail);
  return people.some((p) => normalizeEmail(String(p?.email || '')) === email && String(p?.role || '') === 'edit');
}

type GridRuleInput = {
  id: string;
  name: string;
  tableId: string;
  mode: 'derive' | 'research';
  prompt: string;
  sourceColumnIds: string[];
  targetColumnId: string;
  defaultScope?: string;
  enabled?: boolean;
};

type GridRowInput = {
  rowId: string;
  sourceValues: Record<string, string>;
};

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
          fileId?: unknown;
          sheetId?: unknown;
          rule?: unknown;
          rows?: unknown;
          openaiApiKey?: unknown;
          chatModel?: unknown;
          embeddingModel?: unknown;
        };

    const projectFolderId = clampText(body?.projectFolderId, 120);
    const fileId = clampText(body?.fileId, 120);
    const sheetId = clampText(body?.sheetId, 120);
    if (!projectFolderId || !fileId || !sheetId) {
      return NextResponse.json({ error: 'Missing projectFolderId/fileId/sheetId' }, { status: 400 });
    }

    const ruleRaw = (body?.rule && typeof body.rule === 'object' ? (body.rule as Record<string, unknown>) : null) || null;
    if (!ruleRaw) return NextResponse.json({ error: 'Missing rule' }, { status: 400 });
    const rule: GridRuleInput = {
      id: clampText(ruleRaw.id, 120),
      name: clampText(ruleRaw.name, 140),
      tableId: clampText(ruleRaw.tableId, 120),
      mode: ruleRaw.mode === 'research' ? 'research' : 'derive',
      prompt: clampText(ruleRaw.prompt, 4000),
      sourceColumnIds: Array.isArray(ruleRaw.sourceColumnIds)
        ? (ruleRaw.sourceColumnIds as unknown[]).map((x) => clampText(x, 120)).filter(Boolean)
        : [],
      targetColumnId: clampText(ruleRaw.targetColumnId, 120),
      defaultScope: clampText(ruleRaw.defaultScope, 20) || undefined,
      enabled: typeof ruleRaw.enabled === 'boolean' ? ruleRaw.enabled : undefined,
    };
    if (!rule.id || !rule.tableId || !rule.prompt || !rule.targetColumnId) {
      return NextResponse.json({ error: 'Invalid rule payload' }, { status: 400 });
    }

    const rowsRaw = Array.isArray(body?.rows) ? (body?.rows as unknown[]) : [];
    if (!rowsRaw.length) return NextResponse.json({ error: 'Missing rows' }, { status: 400 });
    if (rowsRaw.length > 200) return NextResponse.json({ error: 'Maximum 200 rows per run' }, { status: 400 });
    const rows: GridRowInput[] = rowsRaw
      .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((r) => ({
        rowId: clampText(r.rowId, 120),
        sourceValues:
          r.sourceValues && typeof r.sourceValues === 'object'
            ? Object.fromEntries(
                Object.entries(r.sourceValues as Record<string, unknown>)
                  .map(([k, v]) => [clampText(k, 120), clampText(v, 2000)])
                  .filter(([k]) => Boolean(k)),
              )
            : {},
      }))
      .filter((r) => Boolean(r.rowId))
      .slice(0, 200);
    if (!rows.length) return NextResponse.json({ error: 'No valid rows' }, { status: 400 });

    const openaiApiKey = clampText(request.headers.get('x-openai-api-key') || body?.openaiApiKey, 400);
    if (!openaiApiKey && !String(process.env.OPENAI_API_KEY || '').trim()) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 400 });
    }

    const admin = getAdminSupabaseClient();
    const { data: fileData, error: fileErr } = await admin
      .from('files')
      .select('id,owner_id,folder_id,access,kind')
      .eq('id', fileId)
      .maybeSingle();
    if (fileErr) return NextResponse.json({ error: fileErr.message }, { status: 500 });
    if (!fileData) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const file = fileData as FileRow;
    if (String(file.kind || '') !== 'grid') return NextResponse.json({ error: 'File kind must be grid' }, { status: 400 });
    if (!file.folder_id || String(file.folder_id) !== projectFolderId) {
      return NextResponse.json({ error: 'File does not belong to project' }, { status: 400 });
    }

    const { data: folderData, error: folderErr } = await admin
      .from('folders')
      .select('id,owner_id,access')
      .eq('id', projectFolderId)
      .maybeSingle();
    if (folderErr) return NextResponse.json({ error: folderErr.message }, { status: 500 });
    if (!folderData) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const folder = folderData as FolderRow;

    const canEdit =
      user.id === String(file.owner_id || '') ||
      user.id === String(folder.owner_id || '') ||
      canEditFromAccess(file.access, user.email || null) ||
      canEditFromAccess(folder.access, user.email || null);
    if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ownerId = clampText(file.owner_id, 120);
    if (!ownerId) return NextResponse.json({ error: 'File owner not found' }, { status: 500 });

    const secretPayload = encryptOpenAiApiKey(openaiApiKey || null);
    const { job } = await createAsyncJob(
      {
        kind: 'ai_grid_rule',
        ownerId,
        requesterUserId: user.id,
        projectFolderId,
        secretPayload,
        input: {
          authMode: 'cookie_user',
          ownerId,
          projectFolderId,
          requestedBy: user.id,
          fileId,
          sheetId,
          rule,
          rows,
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
