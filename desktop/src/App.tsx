import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { invoke } from '@tauri-apps/api/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSession } from './lib/supabase';
import { buildAiGuideMarkdown } from './lib/aiGuideContent';
import { buildEnv } from './lib/env';
import {
  clearAppConfig,
  fetchPublicConfigFromNexusMap,
  loadAppConfig,
  saveAppConfig,
  type AppConfigV1,
} from './lib/appConfig';

type AppStep = 'signedOut' | 'signedIn';
type Project = { id: string; name: string };

export function App() {
  const [config, setConfig] = useState<AppConfigV1 | null>(null);
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configHostedUrl, setConfigHostedUrl] = useState<string>(buildEnv.nexusmapHostedUrl || '');
  const [showAdvancedConfig, setShowAdvancedConfig] = useState<boolean>(false);
  const [configSupabaseUrl, setConfigSupabaseUrl] = useState<string>('');
  const [configAnonKey, setConfigAnonKey] = useState<string>('');
  const [configApiBaseUrl, setConfigApiBaseUrl] = useState<string>(buildEnv.nexusmapHostedUrl || 'http://localhost:3000');

  const [step, setStep] = useState<AppStep>('signedOut');
  const [email, setEmail] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginOtp, setLoginOtp] = useState<string>('');
  const [vaultPath, setVaultPath] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('My Vault Project');
  const [status, setStatus] = useState<string>('');
  const [syncInfo, setSyncInfo] = useState<string>('');
  const [watching, setWatching] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [events, setEvents] = useState<Array<{ ts: string; kind: string; path: string; detail: string }>>([]);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const boot = async () => {
      const cfg = await loadAppConfig();
      if (!cfg) {
        // Official builds can bake in a hosted URL; auto-fetch config from there.
        if (buildEnv.nexusmapHostedUrl) {
          try {
            setStatus('Connecting to NexusMap…');
            const pub = await fetchPublicConfigFromNexusMap(buildEnv.nexusmapHostedUrl);
            const saved = await saveAppConfig({
              supabaseUrl: pub.supabaseUrl,
              supabaseAnonKey: pub.supabaseAnonKey,
              nexusmapApiBaseUrl: pub.nexusmapApiBaseUrl,
            });
            setConfig(saved);
            setConfigHostedUrl(buildEnv.nexusmapHostedUrl);
            setConfigSupabaseUrl(saved.supabaseUrl);
            setConfigAnonKey(saved.supabaseAnonKey);
            setConfigApiBaseUrl(saved.nexusmapApiBaseUrl);
            const sb = createSupabaseClient(saved);
            setSupabase(sb);
            setStatus('');
          } catch (e: any) {
            setStatus(`Failed to connect: ${e?.message ?? String(e)}`);
          }
          return;
        }

        setStatus('Not configured.');
        return;
      }

      setConfig(cfg);
      setConfigSupabaseUrl(cfg.supabaseUrl);
      setConfigAnonKey(cfg.supabaseAnonKey);
      setConfigApiBaseUrl(cfg.nexusmapApiBaseUrl);

      const sb = createSupabaseClient(cfg);
      setSupabase(sb);

      const session = await getSession(sb);
      if (session?.user) {
        setEmail(session.user.email ?? '');
        setStep('signedIn');
        await refreshProjects(sb);
      }

      const startUrls = await getCurrent();
      if (startUrls?.length) await handleOpenUrls(sb, startUrls);

      unsub = await onOpenUrl(async (urls) => {
        await handleOpenUrls(sb, urls);
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

  const handleOpenUrls = async (sb: SupabaseClient, urls: string[]) => {
    const url = urls[0];
    if (!url) return;

    try {
      const parsed = new URL(url);
      setStatus('Completing sign-in…');

      const code = parsed.searchParams.get('code');
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else {
        // Magic link may return tokens in the fragment.
        const hash = String(parsed.hash || '').replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await sb.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
        } else {
          return;
        }
      }

      const session = await getSession(sb);
      if (session?.user) {
        setEmail(session.user.email ?? '');
        setStep('signedIn');
        setStatus('Signed in.');
        await refreshProjects(sb);
      }
    } catch (e: any) {
      setStatus(`Sign-in failed: ${e?.message ?? String(e)}`);
    }
  };

  const refreshProjects = async (sb: SupabaseClient) => {
    const session = await getSession(sb);
    if (!session?.user) return;

    setStatus('Loading projects…');
    const { data, error } = await sb
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

  const sendEmailCode = async () => {
    if (!supabase) return;
    const e = loginEmail.trim();
    if (!e) return;
    setStatus('Sending code…');
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      setStatus(`Sign-in error: ${error.message}`);
      return;
    }
    setStatus('Code sent. Check your email.');
  };

  const verifyEmailCode = async () => {
    if (!supabase) return;
    const e = loginEmail.trim();
    const token = loginOtp.trim();
    if (!e || !token) return;
    setStatus('Verifying…');
    const { error } = await supabase.auth.verifyOtp({ email: e, token, type: 'email' });
    if (error) {
      setStatus(`Verify failed: ${error.message}`);
      return;
    }
    const session = await getSession(supabase);
    if (session?.user) {
      setEmail(session.user.email ?? '');
      setStep('signedIn');
      setStatus('');
      await refreshProjects(supabase);
    } else {
      setStatus('Signed in.');
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
    if (!supabase) return;
    const session = await getSession(supabase);
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
    if (supabase) await supabase.auth.signOut();
    setStep('signedOut');
    setEmail('');
    setProjects([]);
    setSelectedProjectId('');
  };

  const connectHosted = async () => {
    const base = configHostedUrl.trim();
    if (!base) return;
    setStatus('Connecting…');
    try {
      const pub = await fetchPublicConfigFromNexusMap(base);
      const next = await saveAppConfig({
        supabaseUrl: pub.supabaseUrl,
        supabaseAnonKey: pub.supabaseAnonKey,
        nexusmapApiBaseUrl: pub.nexusmapApiBaseUrl,
      });

      setConfigHostedUrl(base);
      setConfigSupabaseUrl(next.supabaseUrl);
      setConfigAnonKey(next.supabaseAnonKey);
      setConfigApiBaseUrl(next.nexusmapApiBaseUrl);
      setConfig(next);

      const sb = createSupabaseClient(next);
      setSupabase(sb);
      setStatus('Connected.');
      setTimeout(() => setStatus(''), 800);
    } catch (e: any) {
      setStatus(`Connect failed: ${e?.message ?? String(e)}`);
    }
  };

  const resetConfig = async () => {
    await clearAppConfig();
    setConfig(null);
    setSupabase(null);
    setStep('signedOut');
    setEmail('');
    setProjects([]);
    setSelectedProjectId('');
    setVaultPath('');
    setStatus('Reset.');
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
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;

    setStatus('Scanning vault + importing…');
    try {
      const auth = {
        supabase_url: config.supabaseUrl,
        supabase_anon_key: config.supabaseAnonKey,
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
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;
    setStatus('Starting watcher…');
    try {
      const auth = {
        supabase_url: config.supabaseUrl,
        supabase_anon_key: config.supabaseAnonKey,
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
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;
    setStatus('Pulling remote changes…');
    try {
      const auth = {
        supabase_url: config.supabaseUrl,
        supabase_anon_key: config.supabaseAnonKey,
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
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;
    setStatus('Triggering RAG ingest…');
    try {
      const base = config.nexusmapApiBaseUrl.replace(/\/$/, '');
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
      setStatus('RAG ingest failed.');
    }
  };

  const startPulling = async () => {
    if (!vaultPath || !selectedProjectId) return;
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;
    setStatus('Starting remote poller…');
    try {
      const auth = {
        supabase_url: config.supabaseUrl,
        supabase_anon_key: config.supabaseAnonKey,
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
            <div style={{ fontSize: 18, fontWeight: 700 }}>NexusMap Sync</div>
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
          {!config ? (
            <>
              <div className="row" style={{ marginTop: 12 }}>
                <input
                  value={configHostedUrl}
                  onChange={(e) => setConfigHostedUrl(e.target.value)}
                  placeholder="Connect URL"
                />
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btnPrimary" onClick={connectHosted} type="button">
                  Connect
                </button>
                <button className="btn" onClick={() => setShowAdvancedConfig((v) => !v)} type="button">
                  {showAdvancedConfig ? 'Hide advanced' : 'Advanced'}
                </button>
              </div>

              {showAdvancedConfig ? (
                <div style={{ marginTop: 12 }}>
                  <div className="muted">Advanced (self-host / development)</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <input
                      value={configSupabaseUrl}
                      onChange={(e) => setConfigSupabaseUrl(e.target.value)}
                      placeholder="Supabase URL"
                    />
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <input
                      value={configAnonKey}
                      onChange={(e) => setConfigAnonKey(e.target.value)}
                      placeholder="Supabase anon key"
                    />
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <input
                      value={configApiBaseUrl}
                      onChange={(e) => setConfigApiBaseUrl(e.target.value)}
                      placeholder="NexusMap API base URL"
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 'signedOut' ? (
            <>
              <div className="row" style={{ marginTop: 12 }}>
                <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" />
                <button className="btn btnPrimary" onClick={sendEmailCode} type="button">
                  Send code
                </button>
                <button className="btn" onClick={resetConfig} type="button">
                  Reset config
                </button>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <input value={loginOtp} onChange={(e) => setLoginOtp(e.target.value)} placeholder="Code" />
                <button className="btn btnPrimary" onClick={verifyEmailCode} type="button">
                  Verify
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

