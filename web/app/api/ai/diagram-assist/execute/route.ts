import { NextResponse } from 'next/server';
import { createAsyncJob } from '@/lib/server/async-jobs/repo';
import { encryptOpenAiApiKey } from '@/lib/server/async-jobs/crypto';
import { getAdminSupabaseClient } from '@/lib/server/supabase-admin';
import { getUserSupabaseClient } from '@/lib/server/supabase-user';
import type {
  DiagramAssistAction,
  DiagramAssistDataObjectAttributesSelection,
  DiagramAssistExecuteInput,
  DiagramAssistMarkdownErrorsFixSelection,
  DiagramAssistNodeStructureSelection,
  DiagramAssistSelection,
  DiagramAssistStatusDescriptionsSelection,
  DiagramAssistStatusTargetConditionDimension,
  DiagramAssistStatusTargetDataObject,
} from '@/lib/diagram-ai-assist-types';

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

function clampArray(input: unknown, opts: { maxItems: number; maxChars: number }): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => clampText(x, opts.maxChars))
    .filter(Boolean)
    .slice(0, opts.maxItems);
}

function canEditFromAccess(access: unknown, userEmail: string | null) {
  const people = ((access as { people?: AccessPerson[] } | null)?.people || []) as AccessPerson[];
  if (!people.length || !userEmail) return false;
  const email = normalizeEmail(userEmail);
  return people.some((p) => normalizeEmail(String(p?.email || '')) === email && String(p?.role || '') === 'edit');
}

function coerceAction(input: unknown): DiagramAssistAction | null {
  const action = clampText(input, 64);
  if (
    action === 'node_structure' ||
    action === 'data_object_attributes' ||
    action === 'status_descriptions' ||
    action === 'markdown_errors_fix'
  ) {
    return action;
  }
  return null;
}

function coerceNodeStructureSelection(raw: Record<string, unknown>): DiagramAssistNodeStructureSelection {
  return {
    baseFileHash: clampText(raw.baseFileHash, 256),
    baseUpdatedAt: clampText(raw.baseUpdatedAt, 120) || null,
    nodeId: clampText(raw.nodeId, 120),
    lineIndex: Math.max(0, Math.floor(Number(raw.lineIndex || 0))),
    parentPathFingerprint: clampArray(raw.parentPathFingerprint, { maxItems: 40, maxChars: 240 }),
    selectedNodeContent: clampText(raw.selectedNodeContent, 500),
    subtreeMarkdown: clampText(raw.subtreeMarkdown, 14_000),
  };
}

function coerceDataObjectAttributesSelection(raw: Record<string, unknown>): DiagramAssistDataObjectAttributesSelection {
  const existingRaw = Array.isArray(raw.existingAttributes) ? (raw.existingAttributes as unknown[]) : [];
  return {
    baseFileHash: clampText(raw.baseFileHash, 256),
    baseUpdatedAt: clampText(raw.baseUpdatedAt, 120) || null,
    targetObjectId: clampText(raw.targetObjectId, 120),
    targetObjectName: clampText(raw.targetObjectName, 180),
    triggerSource: raw.triggerSource === 'logic_panel_linked_object' ? 'logic_panel_linked_object' : 'data_object_inspector',
    linkedObjectIds: clampArray(raw.linkedObjectIds, { maxItems: 50, maxChars: 120 }),
    linkedObjectNames: clampArray(raw.linkedObjectNames, { maxItems: 50, maxChars: 180 }),
    existingAttributes: existingRaw
      .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => x !== null)
      .map((item) => {
        const type: 'status' | 'text' = item.type === 'status' ? 'status' : 'text';
        return {
          name: clampText(item.name, 120),
          type,
          sample: clampText(item.sample, 300),
          values: clampArray(item.values, { maxItems: 20, maxChars: 80 }),
        };
      })
      .filter((x) => Boolean(x.name))
      .slice(0, 120),
    nodeContext:
      raw.nodeContext && typeof raw.nodeContext === 'object'
        ? {
            nodeId: clampText((raw.nodeContext as Record<string, unknown>).nodeId, 120) || undefined,
            nodeLabel: clampText((raw.nodeContext as Record<string, unknown>).nodeLabel, 240) || undefined,
          }
        : undefined,
  };
}

function coerceStatusTarget(raw: Record<string, unknown>): DiagramAssistStatusTargetDataObject | DiagramAssistStatusTargetConditionDimension | null {
  const kind = clampText(raw.kind, 64);
  if (kind === 'data_object_status') {
    return {
      kind: 'data_object_status',
      doId: clampText(raw.doId, 120),
      doName: clampText(raw.doName, 180),
      attrId: clampText(raw.attrId, 120),
      attrName: clampText(raw.attrName, 180),
      statusValues: clampArray(raw.statusValues, { maxItems: 30, maxChars: 80 }),
    };
  }
  if (kind === 'condition_dimension_status') {
    return {
      kind: 'condition_dimension_status',
      nodeId: clampText(raw.nodeId, 120),
      nodeLineIndex: Math.max(0, Math.floor(Number(raw.nodeLineIndex || 0))),
      hubLabel: clampText(raw.hubLabel, 240),
      dimensionKey: clampText(raw.dimensionKey, 180),
      statusValues: clampArray(raw.statusValues, { maxItems: 30, maxChars: 80 }),
    };
  }
  return null;
}

function coerceStatusDescriptionsSelection(raw: Record<string, unknown>): DiagramAssistStatusDescriptionsSelection | null {
  const targetRaw = raw.target && typeof raw.target === 'object' ? (raw.target as Record<string, unknown>) : null;
  if (!targetRaw) return null;
  const target = coerceStatusTarget(targetRaw);
  if (!target) return null;
  return {
    baseFileHash: clampText(raw.baseFileHash, 256),
    baseUpdatedAt: clampText(raw.baseUpdatedAt, 120) || null,
    target,
  };
}

function coerceMarkdownErrorsFixSelection(raw: Record<string, unknown>): DiagramAssistMarkdownErrorsFixSelection {
  return {
    baseFileHash: clampText(raw.baseFileHash, 256),
    baseUpdatedAt: clampText(raw.baseUpdatedAt, 120) || null,
    issueKeys: clampArray(raw.issueKeys, { maxItems: 120, maxChars: 500 }),
    maxPatches: Math.min(40, Math.max(1, Math.floor(Number(raw.maxPatches || 24)))),
  };
}

function coerceSelection(action: DiagramAssistAction, input: unknown): DiagramAssistSelection | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw) return null;
  if (action === 'node_structure') return coerceNodeStructureSelection(raw);
  if (action === 'data_object_attributes') return coerceDataObjectAttributesSelection(raw);
  if (action === 'markdown_errors_fix') return coerceMarkdownErrorsFixSelection(raw);
  return coerceStatusDescriptionsSelection(raw);
}

function validateSelection(action: DiagramAssistAction, selection: DiagramAssistSelection): string | null {
  if (!selection.baseFileHash) return 'Missing baseFileHash';

  if (action === 'node_structure') {
    const s = selection as DiagramAssistNodeStructureSelection;
    if (!s.nodeId) return 'Missing node id';
    if (!s.subtreeMarkdown) return 'Missing subtree markdown';
    return null;
  }

  if (action === 'data_object_attributes') {
    const s = selection as DiagramAssistDataObjectAttributesSelection;
    if (!s.targetObjectId) return 'Missing targetObjectId';
    return null;
  }

  if (action === 'markdown_errors_fix') {
    return null;
  }

  const s = selection as DiagramAssistStatusDescriptionsSelection;
  if (s.target.kind === 'data_object_status') {
    if (!s.target.doId || !s.target.attrId) return 'Missing status target data object id/attribute id';
    return null;
  }
  if (!s.target.nodeId || !s.target.dimensionKey) return 'Missing status target dimension context';
  return null;
}

function buildDedupeKey(fileId: string, action: DiagramAssistAction, selection: DiagramAssistSelection) {
  const hash = clampText(selection.baseFileHash, 128);
  if (action === 'node_structure') {
    const s = selection as DiagramAssistNodeStructureSelection;
    return `ai_diagram_assist:${fileId}:${action}:${s.nodeId}:${s.lineIndex}:${hash}`;
  }
  if (action === 'data_object_attributes') {
    const s = selection as DiagramAssistDataObjectAttributesSelection;
    return `ai_diagram_assist:${fileId}:${action}:${s.targetObjectId}:${hash}`;
  }
  if (action === 'markdown_errors_fix') {
    const s = selection as DiagramAssistMarkdownErrorsFixSelection;
    const issuesHash = clampText((s.issueKeys || []).slice(0, 40).join('|'), 400);
    return `ai_diagram_assist:${fileId}:${action}:${issuesHash}:${hash}`;
  }
  const s = selection as DiagramAssistStatusDescriptionsSelection;
  if (s.target.kind === 'data_object_status') {
    return `ai_diagram_assist:${fileId}:${action}:${s.target.doId}:${s.target.attrId}:${hash}`;
  }
  return `ai_diagram_assist:${fileId}:${action}:${s.target.nodeId}:${s.target.dimensionKey}:${hash}`;
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
          fileId?: unknown;
          action?: unknown;
          selection?: unknown;
          openaiApiKey?: unknown;
          chatModel?: unknown;
          embeddingModel?: unknown;
        };

    const projectFolderId = clampText(body?.projectFolderId, 120);
    const fileId = clampText(body?.fileId, 120);
    const action = coerceAction(body?.action);
    if (!projectFolderId || !fileId) {
      return NextResponse.json({ error: 'Missing projectFolderId/fileId' }, { status: 400 });
    }
    if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    const selection = coerceSelection(action, body?.selection);
    if (!selection) return NextResponse.json({ error: 'Invalid selection payload' }, { status: 400 });
    const selectionErr = validateSelection(action, selection);
    if (selectionErr) return NextResponse.json({ error: selectionErr }, { status: 400 });

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
    if (String(file.kind || '') !== 'diagram') return NextResponse.json({ error: 'File kind must be diagram' }, { status: 400 });
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

    const input: DiagramAssistExecuteInput = {
      ownerId,
      projectFolderId,
      fileId,
      requestedBy: user.id,
      chatModel: clampText(body?.chatModel, 120) || null,
      embeddingModel: clampText(body?.embeddingModel, 120) || null,
      action,
      selection,
    };

    const secretPayload = encryptOpenAiApiKey(openaiApiKey || null);
    const { job } = await createAsyncJob(
      {
        kind: 'ai_diagram_assist',
        ownerId,
        requesterUserId: user.id,
        projectFolderId,
        secretPayload,
        dedupeKey: buildDedupeKey(fileId, action, selection),
        input: {
          authMode: 'cookie_user',
          ...input,
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
