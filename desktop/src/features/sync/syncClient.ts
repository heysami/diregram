import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfigV1 } from '../../lib/appConfig';
import { getSession } from '../../lib/supabase';
import { projectLocalPath, type ProjectLite } from '../../lib/localPaths';

export type SyncEvent = { ts: string; kind: string; path: string; detail: string };

export async function startSyncAllProjects(opts: {
  invoke: (cmd: string, args?: any) => Promise<any>;
  supabase: SupabaseClient;
  config: AppConfigV1;
  projects: ProjectLite[];
  rootVault: string;
  syncRootFolderName: string;
  pullOnce?: boolean;
  startWatching?: boolean;
  startPulling?: boolean;
}): Promise<void> {
  const rootVault = String(opts.rootVault || '').trim();
  if (!rootVault) throw new Error('vaultPath is required');

  const session = await getSession(opts.supabase);
  if (!session?.user) throw new Error('Not signed in (session missing).');

  const auth = {
    supabase_url: opts.config.supabaseUrl,
    supabase_anon_key: opts.config.supabaseAnonKey,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    owner_id: session.user.id,
  };

  await opts.invoke('vault_ensure_dir', { vaultPath: rootVault, relativePath: opts.syncRootFolderName }).catch(() => {});

  if (opts.pullOnce ?? true) {
    for (const p of opts.projects) {
      const loc = projectLocalPath(p, rootVault, opts.syncRootFolderName);
      // eslint-disable-next-line no-await-in-loop
      await opts.invoke('vault_ensure_dir', { vaultPath: rootVault, relativePath: loc.rel });
      // eslint-disable-next-line no-await-in-loop
      await opts.invoke('sync_pull_once', { vaultPath: loc.abs, projectFolderId: p.id, auth });
    }
  }

  if (opts.startWatching ?? true) {
    for (const p of opts.projects) {
      const loc = projectLocalPath(p, rootVault, opts.syncRootFolderName);
      // eslint-disable-next-line no-await-in-loop
      await opts.invoke('sync_watch_start', { vaultPath: loc.abs, projectFolderId: p.id, auth });
    }
  }

  if (opts.startPulling ?? true) {
    for (const p of opts.projects) {
      const loc = projectLocalPath(p, rootVault, opts.syncRootFolderName);
      // eslint-disable-next-line no-await-in-loop
      await opts.invoke('sync_pull_start', { vaultPath: loc.abs, projectFolderId: p.id, auth, intervalMs: 5000 });
    }
  }
}

export async function stopSyncAllProjects(invoke: (cmd: string, args?: any) => Promise<any>): Promise<void> {
  await invoke('sync_watch_stop').catch(() => {});
  await invoke('sync_pull_stop').catch(() => {});
}

export async function loadAllProjectEvents(opts: {
  invoke: (cmd: string, args?: any) => Promise<any>;
  projects: ProjectLite[];
  rootVault: string;
  syncRootFolderName: string;
  limitPerProject?: number;
  totalLimit?: number;
}): Promise<SyncEvent[]> {
  const all: SyncEvent[] = [];
  const limit = opts.limitPerProject ?? 40;
  for (const p of opts.projects) {
    const loc = projectLocalPath(p, opts.rootVault, opts.syncRootFolderName);
    // eslint-disable-next-line no-await-in-loop
    const evs = (await opts.invoke('sync_read_events', { vaultPath: loc.abs, limit })) as any[];
    if (Array.isArray(evs)) all.push(...(evs as SyncEvent[]));
  }
  all.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return all.slice(0, opts.totalLimit ?? 80);
}

