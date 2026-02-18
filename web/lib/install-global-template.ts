import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';
import { readTemplateHeader } from '@/lib/nexus-template';

function nowIso() {
  return new Date().toISOString();
}

async function ensureFolderIdByName(
  supabase: SupabaseClient,
  res: { ownerId: string; name: string; parentId: string | null },
): Promise<string> {
  const name = String(res.name || '').trim() || 'Folder';

  let parentAccess: unknown = null;
  if (res.parentId) {
    try {
      const { data: parentRow, error: parentErr } = await supabase.from('folders').select('access').eq('id', res.parentId).maybeSingle();
      if (parentErr) throw parentErr;
      parentAccess = (parentRow as any)?.access ?? null;
    } catch {
      parentAccess = null;
    }
  }

  const base = supabase.from('folders').select('id,access').eq('owner_id', res.ownerId).eq('name', name);
  const { data: existing, error: existingErr } =
    res.parentId === null ? await base.is('parent_id', null).maybeSingle() : await base.eq('parent_id', res.parentId).maybeSingle();
  if (existingErr) throw existingErr;
  const existingId = (existing as { id?: unknown } | null)?.id;
  if (typeof existingId === 'string' && existingId) {
    const existingAccess = (existing as any)?.access ?? null;
    // Best-effort: keep child folders aligned with project-level access.
    if (res.parentId && parentAccess && !existingAccess) {
      try {
        await supabase.from('folders').update({ access: parentAccess as any }).eq('id', existingId);
      } catch {
        // ignore
      }
    }
    return existingId;
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({ name, owner_id: res.ownerId, parent_id: res.parentId, ...(res.parentId && parentAccess ? { access: parentAccess as any } : {}) })
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) throw new Error('Failed to create folder.');
  return id;
}

export async function installGlobalTemplateToLibrary(
  supabase: SupabaseClient,
  res: {
    userId: string;
    content: string;
    fallbackName: string;
    scope: 'account' | 'project';
    projectFolderId?: string | null;
  },
): Promise<{ fileId: string; folderId: string; name: string }> {
  const userId = String(res.userId || '').trim();
  if (!userId) throw new Error('Install failed: missing user id.');

  const content = String(res.content || '');
  if (!content.trim()) throw new Error('Install failed: template content is empty.');

  const { header } = readTemplateHeader(content);
  const name = String(header?.name || res.fallbackName || 'Template').trim() || 'Template';

  if (res.scope === 'project' && !res.projectFolderId) {
    throw new Error('Install failed: missing project folder id.');
  }

  const folderId =
    res.scope === 'account'
      ? await ensureFolderIdByName(supabase, { ownerId: userId, name: 'Account Templates', parentId: null })
      : await ensureFolderIdByName(supabase, {
          ownerId: userId,
          name: 'Templates',
          parentId: res.projectFolderId ?? null,
        });

  const defaultLayout = await fetchProfileDefaultLayoutDirection(supabase, userId);
  const roomName = `file-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from('files')
    .insert({
      name,
      owner_id: userId,
      folder_id: folderId,
      room_name: roomName,
      last_opened_at: nowIso(),
      layout_direction: defaultLayout,
      kind: 'template',
      content,
    })
    .select('id')
    .single();
  if (error) throw error;
  const fileId = (data as { id?: unknown } | null)?.id;
  if (typeof fileId !== 'string' || !fileId) throw new Error('Install failed: missing file id.');

  return { fileId, folderId, name };
}

