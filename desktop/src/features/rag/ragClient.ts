import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfigV1 } from '../../lib/appConfig';
import { getSession } from '../../lib/supabase';
import { normalizeHttpBaseUrl } from '../../lib/url';
import { projectLocalPath, type ProjectLite } from '../../lib/localPaths';

export async function reindexRagForProjects(opts: {
  invoke: (cmd: string, args?: any) => Promise<any>;
  supabase: SupabaseClient;
  config: AppConfigV1;
  projects: ProjectLite[];
  vaultPath: string | null;
  syncRootFolderName: string;
  openAiKey: string;
}): Promise<void> {
  const key = String(opts.openAiKey || '').trim();
  if (!key) throw new Error('RAG ingest needs an OpenAI API key.');

  const session = await getSession(opts.supabase);
  if (!session?.user) throw new Error('Not signed in (session missing).');

  const base = normalizeHttpBaseUrl(opts.config.diregramApiBaseUrl);
  if (!base) throw new Error('Missing Diregram API base URL.');

  for (const p of opts.projects) {
    // eslint-disable-next-line no-await-in-loop
    await opts.invoke('rag_ingest_jwt', {
      req: {
        project_folder_id: p.id,
        access_token: session.access_token,
        api_base_url: base,
        openai_api_key: key,
      },
    });

    if (opts.vaultPath) {
      const loc = projectLocalPath(p, opts.vaultPath, opts.syncRootFolderName);
      // eslint-disable-next-line no-await-in-loop
      await opts.invoke('rag_export_once', {
        vaultPath: loc.abs,
        projectFolderId: p.id,
        auth: {
          supabase_url: opts.config.supabaseUrl,
          supabase_anon_key: opts.config.supabaseAnonKey,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          owner_id: session.user.id,
        },
      });
    }
  }
}

