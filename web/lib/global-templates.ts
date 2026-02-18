import type { SupabaseClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/is-uuid';
import { readTemplateHeader } from '@/lib/nexus-template';

export type GlobalTemplateListEntry = { id: string; name: string };

export type GlobalTemplateBrowserEntry = {
  id: string;
  name: string;
  ownerId: string;
  updatedAtIso: string | null;
  createdAtIso: string | null;
  content: string;
  templateTargetKind?: string | null;
  templateMode?: string | null;
  templateFragmentKind?: string | null;
};

export type GlobalTemplateFullRow = {
  id: string;
  name: string;
  ownerId: string;
  updatedAtIso: string | null;
  createdAtIso: string | null;
  content: string;
  templateTargetKind?: string | null;
  templateMode?: string | null;
  templateFragmentKind?: string | null;
};

function friendlyGlobalTemplatesError(err: unknown): string | null {
  const e = err as any;
  const code = typeof e?.code === 'string' ? e.code : null;
  if (code === 'PGRST205') {
    return 'Global templates are not set up for this Supabase project yet. Run `Plan/supabase-global-templates.sql` in the Supabase SQL editor, then refresh and try again.';
  }
  return null;
}

function isMissingColumnError(err: unknown): boolean {
  const e = err as any;
  const code = typeof e?.code === 'string' ? e.code : '';
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (code === '42703') return true; // Postgres undefined_column
  if (code === 'PGRST204') return true; // PostgREST: missing column in select/insert payload
  if (/column/i.test(msg) && /does not exist/i.test(msg)) return true;
  return false;
}

export async function listGlobalTemplates(supabase: SupabaseClient, opts?: { limit?: number }): Promise<GlobalTemplateListEntry[]> {
  const limit = Math.max(1, Math.min(500, Number(opts?.limit ?? 200)));
  const { data, error } = await supabase
    .from('global_templates')
    .select('id,name,updated_at,created_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[] | null | undefined || [])
    .map((r) => ({ id: String(r?.id || ''), name: String(r?.name || 'Untitled') }))
    .filter((r) => !!r.id);
}

export async function listGlobalTemplatesForBrowserPaged(
  supabase: SupabaseClient,
  opts?: { pageIndex?: number; pageSize?: number; query?: string },
): Promise<{ rows: GlobalTemplateBrowserEntry[]; total: number | null }> {
  const pageSize = Math.max(6, Math.min(60, Number(opts?.pageSize ?? 24)));
  const pageIndex = Math.max(0, Math.floor(Number(opts?.pageIndex ?? 0)));
  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;
  const q = String(opts?.query ?? '').trim();

  const run = async (select: string) => {
    let qb = supabase
      .from('global_templates')
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      .select(select, { count: 'exact' as any })
      .order('updated_at', { ascending: false })
      .range(from, to);
    if (q) qb = qb.ilike('name', `%${q}%`);
    return await qb;
  };

  // First try: include derived type columns if present.
  let data: unknown[] | null = null;
  let count: number | null = null;
  let error: any = null;
  {
    const res = await run('id,name,owner_id,updated_at,created_at,content,template_target_kind,template_mode,template_fragment_kind');
    data = res.data as any;
    count = (res as any).count ?? null;
    error = res.error as any;
  }

  if (error && isMissingColumnError(error)) {
    const res = await run('id,name,owner_id,updated_at,created_at,content');
    data = res.data as any;
    count = (res as any).count ?? null;
    error = res.error as any;
  }

  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[] | null | undefined || [])
    .map((r) => ({
      id: String(r?.id || ''),
      name: String(r?.name || 'Untitled'),
      ownerId: String(r?.owner_id || ''),
      updatedAtIso: typeof r?.updated_at === 'string' ? r.updated_at : null,
      createdAtIso: typeof r?.created_at === 'string' ? r.created_at : null,
      content: String(r?.content || ''),
      templateTargetKind: typeof r?.template_target_kind === 'string' ? r.template_target_kind : null,
      templateMode: typeof r?.template_mode === 'string' ? r.template_mode : null,
      templateFragmentKind: typeof r?.template_fragment_kind === 'string' ? r.template_fragment_kind : null,
    }))
    .filter((r) => !!r.id);

  return { rows, total: typeof count === 'number' ? count : null };
}

export async function listGlobalTemplatesForBrowser(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<GlobalTemplateBrowserEntry[]> {
  const limit = Math.max(1, Math.min(200, Number(opts?.limit ?? 80)));
  const { data, error } = await supabase
    .from('global_templates')
    .select('id,name,owner_id,updated_at,created_at,content')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[] | null | undefined || [])
    .map((r) => ({
      id: String(r?.id || ''),
      name: String(r?.name || 'Untitled'),
      ownerId: String(r?.owner_id || ''),
      updatedAtIso: typeof r?.updated_at === 'string' ? r.updated_at : null,
      createdAtIso: typeof r?.created_at === 'string' ? r.created_at : null,
      content: String(r?.content || ''),
    }))
    .filter((r) => !!r.id);
}

export async function loadGlobalTemplateContent(supabase: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await supabase.from('global_templates').select('content').eq('id', id).single();
  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return String((data as any)?.content || '');
}

export async function loadGlobalTemplateRow(supabase: SupabaseClient, id: string): Promise<GlobalTemplateFullRow> {
  const run = async (select: string) => {
    return await supabase.from('global_templates').select(select).eq('id', id).single();
  };

  let data: unknown = null;
  let error: any = null;
  {
    const res = await run('id,name,owner_id,updated_at,created_at,content,template_target_kind,template_mode,template_fragment_kind');
    data = res.data as any;
    error = res.error as any;
  }
  if (error && isMissingColumnError(error)) {
    const res = await run('id,name,owner_id,updated_at,created_at,content');
    data = res.data as any;
    error = res.error as any;
  }
  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) throw new Error(friendly);
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  return {
    id: String(r?.id || ''),
    name: String(r?.name || 'Untitled'),
    ownerId: String(r?.owner_id || ''),
    updatedAtIso: typeof r?.updated_at === 'string' ? r.updated_at : null,
    createdAtIso: typeof r?.created_at === 'string' ? r.created_at : null,
    content: String(r?.content || ''),
    templateTargetKind: typeof r?.template_target_kind === 'string' ? r.template_target_kind : null,
    templateMode: typeof r?.template_mode === 'string' ? r.template_mode : null,
    templateFragmentKind: typeof r?.template_fragment_kind === 'string' ? r.template_fragment_kind : null,
  };
}

export async function publishGlobalTemplateSnapshot(supabase: SupabaseClient, res: { name: string; content: string; ownerId: string }): Promise<string> {
  if (!isUuid(res?.ownerId)) {
    throw new Error('Global template publishing failed: ownerId must be a UUID (Supabase auth user id).');
  }

  const parsed = readTemplateHeader(res.content || '');
  const header = parsed.header || null;
  const meta = {
    template_target_kind: header ? String(header.targetKind) : null,
    template_mode: header ? String(header.mode) : null,
    template_fragment_kind: header ? String(header.fragmentKind || '') || null : null,
  };

  const attemptInsert = async (withMeta: boolean) => {
    const payload = withMeta
      ? { name: res.name, content: res.content, owner_id: res.ownerId, ...meta }
      : { name: res.name, content: res.content, owner_id: res.ownerId };
    return await supabase.from('global_templates').insert(payload as any).select('id').single();
  };

  let data: unknown = null;
  let error: any = null;
  {
    const res1 = await attemptInsert(true);
    data = res1.data as any;
    error = res1.error as any;
  }
  if (error && isMissingColumnError(error)) {
    const res2 = await attemptInsert(false);
    data = res2.data as any;
    error = res2.error as any;
  }

  if (error) {
    const friendly = friendlyGlobalTemplatesError(error);
    if (friendly) {
      throw new Error(friendly);
    }
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const id = String((data as any)?.id || '');
  return id;
}

export async function isGlobalTemplatesAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  try {
    const { data, error } = await supabase.rpc('is_global_templates_admin', { uid: userId } as any);
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function clearGlobalTemplates(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('clear_global_templates');
  if (error) throw error;
  const n = Number(data);
  return Number.isFinite(n) ? n : 0;
}

export async function deleteGlobalTemplate(supabase: SupabaseClient, id: string): Promise<void> {
  if (!id) throw new Error('Missing template id.');
  const { error } = await supabase.from('global_templates').delete().eq('id', id);
  if (error) throw error;
}

