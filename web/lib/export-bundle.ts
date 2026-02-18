import type { SupabaseClient } from '@supabase/supabase-js';
import { zipSync, strToU8 } from 'fflate';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot } from '@/lib/local-doc-snapshots';
import { exportKgAndVectorsForProject } from '@/lib/kg-vector-export';

type ProjectFileRow = { id: string; name: string; kind: string; folderId: string | null; content: string };

function nowIso() {
  return new Date().toISOString();
}

function downloadBlob(filename: string, blob: Blob) {
  const safe = filename.replace(/[^\w.\-()+ ]/g, '_').trim() || 'download.bin';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function listProjectFolderIdsSupabase(supabase: SupabaseClient, folderId: string): Promise<string[]> {
  // Include root project folder + all descendants.
  const seen = new Set<string>();
  let frontier: string[] = [folderId];
  while (frontier.length) {
    const batch = frontier.slice(0, 200);
    frontier = frontier.slice(200);
    batch.forEach((id) => seen.add(id));
    const { data, error } = await supabase.from('folders').select('id,parent_id').in('parent_id', batch);
    if (error) throw error;
    const childIds = (data || [])
      .map((r: any) => String(r?.id || ''))
      .filter(Boolean)
      .filter((id) => !seen.has(id));
    frontier.push(...childIds);
  }
  return Array.from(seen.values());
}

async function listProjectFilesSupabase(supabase: SupabaseClient, folderIds: string[]): Promise<ProjectFileRow[]> {
  const { data, error } = await supabase.from('files').select('id,name,kind,folder_id,content').in('folder_id', folderIds);
  if (error) throw error;
  return (data || [])
    .map((r: any) => ({
      id: String(r?.id || ''),
      name: String(r?.name || 'Untitled'),
      kind: String(r?.kind || 'diagram'),
      folderId: (r?.folder_id ? String(r.folder_id) : null) as string | null,
      content: String(r?.content || ''),
    }))
    .filter((r) => !!r.id);
}

function listProjectFolderIdsLocal(projectFolderId: string): string[] {
  const store = ensureLocalFileStore();
  const seen = new Set<string>();
  const queue: string[] = [projectFolderId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const childIds = store.folders.filter((f) => f.parentId === id).map((f) => f.id);
    childIds.forEach((cid) => {
      if (!seen.has(cid)) queue.push(cid);
    });
  }
  return Array.from(seen.values());
}

function listProjectFilesLocal(folderIds: string[]): ProjectFileRow[] {
  const store = ensureLocalFileStore();
  return (store.files || [])
    .filter((f) => f.folderId && folderIds.includes(f.folderId))
    .map((f) => ({
      id: String(f.id),
      name: String(f.name || 'Untitled'),
      kind: String(f.kind || 'diagram'),
      folderId: f.folderId,
      content: loadFileSnapshot(f.id) || '',
    }));
}

export async function exportProjectBundleZip(res: {
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  projectFolderId: string | null;
  includeKgVectors?: boolean;
}): Promise<{ blob: Blob; filename: string }> {
  if (!res.projectFolderId) throw new Error('Export requires an active project folder.');

  // Allow callers to pass any folder inside a project (e.g. "Templates"). Walk up to the project root.
  const resolveRootFolderIdLocal = (folderId: string): string => {
    const store = ensureLocalFileStore();
    const byId = new Map(store.folders.map((f) => [f.id, f]));
    let cur = folderId;
    let guard = 0;
    while (guard++ < 1000) {
      const f = byId.get(cur);
      const parent = f?.parentId ? String(f.parentId) : null;
      if (!parent) return cur;
      cur = parent;
    }
    return folderId;
  };

  const resolveRootFolderIdSupabase = async (supabase: SupabaseClient, folderId: string): Promise<string> => {
    let cur = folderId;
    let guard = 0;
    while (guard++ < 200) {
      const { data, error } = await supabase.from('folders').select('id,parent_id').eq('id', cur).maybeSingle();
      if (error) throw error;
      const parent = (data as any)?.parent_id ? String((data as any).parent_id) : null;
      if (!parent) return cur;
      cur = parent;
    }
    return folderId;
  };

  const rootProjectFolderId = res.supabaseMode
    ? await (async () => {
        if (!res.supabase) throw new Error('Not connected to Supabase.');
        return await resolveRootFolderIdSupabase(res.supabase, res.projectFolderId!);
      })()
    : resolveRootFolderIdLocal(res.projectFolderId!);

  const files: ProjectFileRow[] = res.supabaseMode
    ? await (async () => {
        if (!res.supabase) throw new Error('Not connected to Supabase.');
        const folderIds = await listProjectFolderIdsSupabase(res.supabase, rootProjectFolderId);
        return await listProjectFilesSupabase(res.supabase, folderIds);
      })()
    : (() => {
        const folderIds = listProjectFolderIdsLocal(rootProjectFolderId);
        return listProjectFilesLocal(folderIds);
      })();

  const exportedAt = nowIso();
  const manifest = {
    version: 1,
    exportedAt,
    projectFolderId: rootProjectFolderId,
    files: files
      .map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        folderId: f.folderId,
        path: `files/${f.kind}/${f.id}.md`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const zipEntries: Record<string, Uint8Array> = {};
  zipEntries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  for (const f of files) {
    const safeKind = String(f.kind || 'file').replace(/[^\w.-]+/g, '_');
    zipEntries[`files/${safeKind}/${f.id}.md`] = strToU8(String(f.content || ''), true);
    zipEntries[`files/${safeKind}/${f.id}.meta.json`] = strToU8(
      JSON.stringify(
        {
          id: f.id,
          name: f.name,
          kind: f.kind,
          folderId: f.folderId,
        },
        null,
        2,
      ),
    );
  }

  if (res.includeKgVectors) {
    const kg = await exportKgAndVectorsForProject({
      supabaseMode: res.supabaseMode,
      supabase: res.supabaseMode ? res.supabase : null,
      projectFolderId: rootProjectFolderId,
    });
    zipEntries['kg/graph.jsonl'] = strToU8(kg.graphJsonl, true);
    zipEntries['kg/embeddings.jsonl'] = strToU8(kg.embeddingsJsonl, true);
    zipEntries['kg/stats.json'] = strToU8(JSON.stringify(kg.stats, null, 2));
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  // Ensure the underlying buffer is a real ArrayBuffer for Blob typing.
  const bytes = new Uint8Array(zipped);
  const blob = new Blob([bytes], { type: 'application/zip' });
  const filename = `nexusmap-bundle-${rootProjectFolderId}-${exportedAt.slice(0, 10)}.zip`;
  return { blob, filename };
}

export function downloadProjectBundleZip(res: { blob: Blob; filename: string }) {
  downloadBlob(res.filename, res.blob);
}

