import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccessPerson } from '@/lib/local-file-store';

export type TemplateLibraryScope = 'project' | 'account';

export const ACCOUNT_TEMPLATES_FOLDER_NAME = 'Account Templates';
export const PROJECT_TEMPLATES_FOLDER_NAME = 'Templates';

export type FolderAccess = { people?: AccessPerson[] } | null;

export function isAccountTemplatesFolderName(name: unknown): boolean {
  return String(name || '') === ACCOUNT_TEMPLATES_FOLDER_NAME;
}

export function templateLibraryFolderName(scope: TemplateLibraryScope): string {
  return scope === 'account' ? ACCOUNT_TEMPLATES_FOLDER_NAME : PROJECT_TEMPLATES_FOLDER_NAME;
}

export async function getFolderAccess(supabase: SupabaseClient, folderId: string): Promise<FolderAccess> {
  const id = String(folderId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase.from('folders').select('access').eq('id', id).maybeSingle();
  if (error) throw error;
  const access = (data as { access?: unknown } | null)?.access ?? null;
  return (access && typeof access === 'object' ? (access as FolderAccess) : null) ?? null;
}

export async function ensureTemplateLibraryFolderId(
  supabase: SupabaseClient,
  res: {
    userId: string;
    scope: TemplateLibraryScope;
    projectFolderId?: string | null;
    inheritedAccess?: FolderAccess;
  },
): Promise<string> {
  const userId = String(res.userId || '').trim();
  if (!userId) throw new Error('Missing userId');

  const folderName = templateLibraryFolderName(res.scope);
  const parentId = res.scope === 'account' ? null : String(res.projectFolderId || '').trim() || null;
  if (res.scope === 'project' && !parentId) throw new Error('Missing projectFolderId');

  const q = supabase.from('folders').select('id,access').eq('owner_id', userId).eq('name', folderName);
  const { data: existing, error: existingErr } =
    parentId === null ? await q.is('parent_id', null).maybeSingle() : await q.eq('parent_id', parentId).maybeSingle();
  if (existingErr) throw existingErr;
  const existingId = (existing as { id?: unknown } | null)?.id;
  if (typeof existingId === 'string' && existingId) {
    // Best-effort: align child folder access with inherited access if it was missing.
    const currentAccess = (existing as { access?: unknown } | null)?.access ?? null;
    if (parentId && res.inheritedAccess && !currentAccess) {
      try {
        await supabase.from('folders').update({ access: res.inheritedAccess }).eq('id', existingId);
      } catch {
        // ignore
      }
    }
    return existingId;
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      name: folderName,
      owner_id: userId,
      parent_id: parentId,
      ...(parentId && res.inheritedAccess ? { access: res.inheritedAccess } : {}),
    })
    .select('id')
    .single();
  if (error) throw error;
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) throw new Error('Failed to create template library folder.');
  return id;
}

export async function moveTemplateFileToFolder(
  supabase: SupabaseClient,
  res: { fileId: string; targetFolderId: string },
): Promise<void> {
  const fileId = String(res.fileId || '').trim();
  const targetFolderId = String(res.targetFolderId || '').trim();
  if (!fileId) throw new Error('Missing fileId');
  if (!targetFolderId) throw new Error('Missing targetFolderId');
  const { error } = await supabase.from('files').update({ folder_id: targetFolderId, access: null }).eq('id', fileId);
  if (error) throw error;
}

