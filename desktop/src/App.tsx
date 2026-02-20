import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { supabase, getSession } from './lib/supabase';
import { env } from './lib/env';
import { buildAiGuideMarkdown } from './lib/aiGuideContent';

type AppStep = 'signedOut' | 'signedIn';
type Project = { id: string; name: string };

export function App() {
  const [step, setStep] = useState<AppStep>('signedOut');
  const [email, setEmail] = useState<string>('');
  const [vaultPath, setVaultPath] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('My Vault Project');
  const [status, setStatus] = useState<string>('');
  const [syncInfo, setSyncInfo] = useState<string>('');
  const [watching, setWatching] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [events, setEvents] = useState<Array<{ ts: string; kind: string; path: string; detail: string }>>([]);

  const deepLinkHelp = useMemo(
    () =>
      [
        'Deep link scheme:',
        '  nexusmap://auth/callback?code=... (Supabase OAuth PKCE)',
        '',
        'Note: you must add this redirect URL in Supabase Auth settings.',
      ].join('\n'),
    [],
  );

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const boot = async () => {
      const session = await getSession();
      if (session?.user) {
        setEmail(session.user.email ?? '');
        setStep('signedIn');
        await refreshProjects();
      }

      const startUrls = await getCurrent();
      if (startUrls?.length) await handleOpenUrls(startUrls);

      unsub = await onOpenUrl(async (urls) => {
        await handleOpenUrls(urls);
      });
    };

    void boot();
    return () => {
      try {
        unsub?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleOpenUrls = async (urls: string[]) => {
    const url = urls[0];
    if (!url) return;

    // Expected: nexusmap://auth/callback?code=...
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (!code) return;

      setStatus('Completing sign-in…');
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;

      const session = await getSession();
      if (session?.user) {
        setEmail(session.user.email ?? '');
        setStep('signedIn');
        setStatus('Signed in.');
        await refreshProjects();
      }
    } catch (e: any) {
      setStatus(`Sign-in failed: ${e?.message ?? String(e)}`);
    }
  };

  const refreshProjects = async () => {
    const session = await getSession();
    if (!session?.user) return;

    setStatus('Loading projects…');
    const { data, error } = await supabase
      .from('folders')
      .select('id,name')
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      setStatus(`Failed to load projects: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as Project[];
    setProjects(rows);
    if (!selectedProjectId && rows[0]?.id) setSelectedProjectId(rows[0].id);
    setStatus('');
  };

  const signInWithGitHub = async () => {
    setStatus('Opening browser…');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: 'nexusmap://auth/callback', skipBrowserRedirect: true },
    });
    if (error) {
      setStatus(`Sign-in error: ${error.message}`);
      return;
    }
    if (data?.url) {
      try {
        await openExternal(data.url);
        setStatus('Browser opened. Finish auth and you’ll be redirected back.');
      } catch {
        setStatus(`Open this URL in your browser: ${data.url}`);
      }
    }
  };

  const pickVaultFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select your Obsidian/OneDrive vault folder',
    });
    if (typeof selected === 'string') setVaultPath(selected);
  };

  const createProject = async () => {
    const session = await getSession();
    if (!session?.user) return;

    const name = newProjectName.trim();
    if (!name) return;

    setStatus('Creating project…');
    const { data, error } = await supabase
      .from('folders')
      .insert({ name, owner_id: session.user.id, parent_id: null })
      .select('id,name')
      .single();

    if (error) {
      setStatus(`Failed to create project: ${error.message}`);
      return;
    }

    const p = data as Project;
    setProjects((prev) => [p, ...prev]);
    setSelectedProjectId(p.id);
    setStatus('Project created.');
    setTimeout(() => setStatus(''), 1200);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setStep('signedOut');
    setEmail('');
    setProjects([]);
    setSelectedProjectId('');
  };

  const initMapping = async () => {
    if (!vaultPath || !selectedProjectId) return;
    setStatus('Initializing sync mapping…');
    try {
      await invoke('sync_init', { vault_path: vaultPath, project_folder_id: selectedProjectId });
      setSyncInfo('Mapping initialized at .nexusmap/sync.json');
      setStatus('');
      void writeAiGuide();
    } catch (e: any) {
      setStatus(`Init failed: ${e?.message ?? String(e)}`);
    }
  };

  const runInitialImport = async () => {
    if (!vaultPath || !selectedProjectId) return;
    const session = await getSession();
    if (!session?.user) return;

    setStatus('Scanning vault + importing…');
    try {
      const auth = {
        supabase_url: env.supabaseUrl,
        supabase_anon_key: env.supabaseAnonKey,
        access_token: session.access_token,
        owner_id: session.user.id,
      };

      const summary = (await invoke('sync_initial_import', {
        vault_path: vaultPath,
        project_folder_id: selectedProjectId,
        auth,
      })) as any;

      setSyncInfo(
        `Initial import done. Folders created: ${summary.folders_created}, reused: ${summary.folders_reused}. Files created: ${summary.files_created}, updated: ${summary.files_updated}, skipped: ${summary.files_skipped}.`,
      );
      setStatus('');
      void triggerRagIngest();
    } catch (e: any) {
      setStatus(`Import failed: ${e?.message ?? String(e)}`);
    }
  };

  const startWatching = async () => {
    if (!vaultPath || !selectedProjectId) return;
    const session = await getSession();
    if (!session?.user) return;
    setStatus('Starting watcher…');
    try {
      const auth = {
        supabase_url: env.supabaseUrl,
        supabase_anon_key: env.supabaseAnonKey,
        access_token: session.access_token,
        owner_id: session.user.id,
      };
      await invoke('sync_watch_start', { vault_path: vaultPath, project_folder_id: selectedProjectId, auth });
      setWatching(true);
      setStatus('');
      setSyncInfo('Watcher running: local changes will sync automatically.');
    } catch (e: any) {
      setStatus(`Watcher failed: ${e?.message ?? String(e)}`);
    }
  };

  const stopWatching = async () => {
    setStatus('Stopping watcher…');
    try {
      await invoke('sync_watch_stop');
      setWatching(false);
      setStatus('');
      setSyncInfo('Watcher stopped.');
    } catch (e: any) {
      setStatus(`Stop failed: ${e?.message ?? String(e)}`);
    }
  };

  const pullOnce = async () => {
    if (!vaultPath || !selectedProjectId) return;
    const session = await getSession();
    if (!session?.user) return;
    setStatus('Pulling remote changes…');
    try {
      const auth = {
        supabase_url: env.supabaseUrl,
        supabase_anon_key: env.supabaseAnonKey,
        access_token: session.access_token,
        owner_id: session.user.id,
      };
      const summary = (await invoke('sync_pull_once', { vault_path: vaultPath, project_folder_id: selectedProjectId, auth })) as any;
      setStatus('');
      if (summary?.errors?.length) {
        setSyncInfo(`Pulled with ${summary.errors.length} errors (see console logs).`);
      } else {
        setSyncInfo('Pulled remote changes.');
      }
    } catch (e: any) {
      setStatus(`Pull failed: ${e?.message ?? String(e)}`);
    }
  };

  const triggerRagIngest = async () => {
    if (!selectedProjectId) return;
    const session = await getSession();
    if (!session?.user) return;
    setStatus('Triggering RAG ingest…');
    try {
      const base = env.nexusmapApiBaseUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/api/rag/ingest-jwt`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectFolderId: selectedProjectId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStatus('');
      setSyncInfo(`RAG ingest ok. Public project id: ${json.publicProjectId || '(unknown)'}`);
    } catch (e: any) {
      setStatus(`RAG ingest failed: ${e?.message ?? String(e)}`);
    }
  };

  const startPulling = async () => {
    if (!vaultPath || !selectedProjectId) return;
    const session = await getSession();
    if (!session?.user) return;
    setStatus('Starting remote poller…');
    try {
      const auth = {
        supabase_url: env.supabaseUrl,
        supabase_anon_key: env.supabaseAnonKey,
        access_token: session.access_token,
        owner_id: session.user.id,
      };
      await invoke('sync_pull_start', { vault_path: vaultPath, project_folder_id: selectedProjectId, auth, interval_ms: 5000 });
      setPulling(true);
      setStatus('');
      setSyncInfo('Remote poller running: remote edits will be pulled into the vault.');
    } catch (e: any) {
      setStatus(`Poller failed: ${e?.message ?? String(e)}`);
    }
  };

  const stopPulling = async () => {
    setStatus('Stopping remote poller…');
    try {
      await invoke('sync_pull_stop');
      setPulling(false);
      setStatus('');
      setSyncInfo('Remote poller stopped.');
    } catch (e: any) {
      setStatus(`Stop failed: ${e?.message ?? String(e)}`);
    }
  };

  const loadEvents = async () => {
    if (!vaultPath) return;
    try {
      const evs = (await invoke('sync_read_events', { vault_path: vaultPath, limit: 50 })) as any[];
      setEvents(Array.isArray(evs) ? evs : []);
    } catch {
      setEvents([]);
    }
  };

  const writeAiGuide = async () => {
    if (!vaultPath) return;
    setStatus('Writing AI guide into vault…');
    try {
      const content = buildAiGuideMarkdown();
      await invoke('vault_write_text_file', {
        vault_path: vaultPath,
        relative_path: 'NexusMap AI Guide.md',
        content,
      });
      setStatus('');
      setSyncInfo('Wrote `NexusMap AI Guide.md` into the vault.');
    } catch (e: any) {
      setStatus(`Write guide failed: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div className="appShell">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>NexusMap Sync (macOS)</div>
            <div className="muted" style={{ marginTop: 4 }}>
              Bidirectional filesystem sync for NexusMap Markdown.
            </div>
          </div>
          <div className="row">
            {step === 'signedIn' ? (
              <button className="btn" onClick={signOut} type="button">
                Sign out
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          {step === 'signedOut' ? (
            <>
              <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>
                {deepLinkHelp}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btnPrimary" onClick={signInWithGitHub} type="button">
                  Sign in with GitHub
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="row">
                <div className="muted">Signed in as</div>
                <div className="mono">{email || '(unknown)'}</div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btnPrimary" onClick={pickVaultFolder} type="button">
                  Choose vault folder
                </button>
                <div className="mono">{vaultPath || '(not selected)'}</div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="muted">Project (root folder in NexusMap)</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    style={{
                      border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: 'rgba(0,0,0,0.2)',
                      color: 'inherit',
                      minWidth: 320,
                    }}
                  >
                    {projects.length === 0 ? <option value="">(no projects yet)</option> : null}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={refreshProjects} type="button">
                    Refresh
                  </button>
                </div>

                <div className="row" style={{ marginTop: 10 }}>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="New project name"
                  />
                  <button className="btn btnPrimary" onClick={createProject} type="button">
                    Create project
                  </button>
                </div>

                <div className="muted" style={{ marginTop: 10 }}>
                  Next: we’ll store a mapping file in your vault and begin syncing.
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={initMapping} type="button" disabled={!vaultPath || !selectedProjectId}>
                    Initialize mapping
                  </button>
                  <button
                    className="btn btnPrimary"
                    onClick={runInitialImport}
                    type="button"
                    disabled={!vaultPath || !selectedProjectId}
                  >
                    Initial import
                  </button>
                  {watching ? (
                    <button className="btn" onClick={stopWatching} type="button">
                      Stop watching
                    </button>
                  ) : (
                    <button className="btn" onClick={startWatching} type="button" disabled={!vaultPath || !selectedProjectId}>
                      Start watching
                    </button>
                  )}
                  <button className="btn" onClick={pullOnce} type="button" disabled={!vaultPath || !selectedProjectId}>
                    Pull once
                  </button>
                  {pulling ? (
                    <button className="btn" onClick={stopPulling} type="button">
                      Stop remote poll
                    </button>
                  ) : (
                    <button className="btn" onClick={startPulling} type="button" disabled={!vaultPath || !selectedProjectId}>
                      Start remote poll
                    </button>
                  )}
                  <button className="btn" onClick={loadEvents} type="button" disabled={!vaultPath}>
                    View events
                  </button>
                  <button className="btn" onClick={triggerRagIngest} type="button" disabled={!selectedProjectId}>
                    Reindex (RAG)
                  </button>
                  <button className="btn" onClick={writeAiGuide} type="button" disabled={!vaultPath}>
                    Write AI guide
                  </button>
                </div>

                {syncInfo ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    {syncInfo}
                  </div>
                ) : null}

                {events.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted">Recent sync events</div>
                    <div style={{ marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
                      {events.map((e, idx) => (
                        <div key={idx} className="muted" style={{ marginBottom: 8 }}>
                          <div className="mono">
                            [{e.ts}] {e.kind} — {e.path}
                          </div>
                          <div style={{ opacity: 0.85 }}>{e.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {status ? (
          <div className="muted" style={{ marginTop: 14 }}>
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
}

