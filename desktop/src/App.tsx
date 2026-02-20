import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { invoke } from '@tauri-apps/api/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSession } from './lib/supabase';
import { buildAiGuideBundle } from './lib/aiGuideContent';
import { buildEnv } from './lib/env';
import {
  clearAppConfig,
  fetchPublicConfigFromNexusMap,
  loadAppConfig,
  saveAppConfig,
  type AppConfigV1,
} from './lib/appConfig';
import { loadRuntimeState, saveRuntimeState } from './lib/runtimeState';
import { clearOpenAiKey, loadOpenAiKey, saveOpenAiKey } from './lib/openaiKey';
import { enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart';

type AppStep = 'signedOut' | 'signedIn';
type Project = { id: string; name: string };

export function App() {
  const syncRootFolderName = 'NexusMap';

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
  const [status, setStatus] = useState<string>('');
  const [syncInfo, setSyncInfo] = useState<string>('');
  const [watching, setWatching] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [events, setEvents] = useState<Array<{ ts: string; kind: string; path: string; detail: string }>>([]);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean>(false);
  const [openAiKey, setOpenAiKey] = useState<string>('');
  const [openAiKeyDraft, setOpenAiKeyDraft] = useState<string>('');

  const joinPath = (a: string, b: string) => {
    const aa = a.replace(/[\\/]+$/, '');
    const bb = b.replace(/^[\\/]+/, '');
    return `${aa}/${bb}`;
  };

  const safeFolderName = (name: string) => {
    const base = name.trim() || 'Untitled';
    return base
      .replace(/[\\/]/g, '-')
      .replace(/[:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .trim();
  };

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const boot = async () => {
      try {
        const k = await loadOpenAiKey();
        setOpenAiKey(k);
        setOpenAiKeyDraft(k);
      } catch {
        // ignore
      }
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

      try {
        setLaunchAtLogin(await isAutostartEnabled());
      } catch {
        // ignore
      }

      const session = await getSession(sb);
      if (session?.user) {
        setEmail(session.user.email ?? '');
        setStep('signedIn');
        await refreshProjects(sb);
      }

      // Resume background sync if previously enabled.
      try {
        const rs = await loadRuntimeState();
        if (rs && rs.vaultPath && rs.syncAllProjects && session?.user) {
          setVaultPath(rs.vaultPath);
          if (rs.watching || rs.pulling) {
            setWatching(Boolean(rs.watching));
            setPulling(Boolean(rs.pulling));
            setStatus('Resuming sync…');
            void startSyncAllForVault(rs.vaultPath, { startWatching: rs.watching, startPulling: rs.pulling, pullOnce: true });
          }
        }
      } catch {
        // ignore resume failures
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

  const toggleLaunchAtLogin = async () => {
    try {
      const next = !(await isAutostartEnabled());
      if (next) await enableAutostart();
      else await disableAutostart();
      setLaunchAtLogin(next);
    } catch {
      // ignore
    }
  };

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

  const refreshProjects = async (sb: SupabaseClient): Promise<Project[]> => {
    const session = await getSession(sb);
    if (!session?.user) {
      setStatus('Not signed in (session missing).');
      return [];
    }

    setStatus('Loading projects…');
    const { data, error } = await sb
      .from('folders')
      .select('id,name')
      .is('parent_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      setStatus(`Failed to load projects: ${error.message}`);
      return [];
    }

    const rows = (data ?? []) as Project[];
    setProjects(rows);
    setStatus('');
    return rows;
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
    const { data, error } = await supabase.auth.verifyOtp({ email: e, token, type: 'email' });
    if (error) {
      setStatus(`Verify failed: ${error.message}`);
      return;
    }

    const access = data?.session?.access_token;
    const refresh = data?.session?.refresh_token;
    if (!access || !refresh) {
      setStatus('Sign-in incomplete. Please resend the code and try again.');
      return;
    }

    // Ensure the session is installed + persisted (more reliable than relying on implicit behavior).
    const { error: setErr } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    if (setErr) {
      setStatus(`Session error: ${setErr.message}`);
      return;
    }

    // Wait briefly for the auth client to reflect session state.
    let session = null as Awaited<ReturnType<typeof getSession>>;
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      session = await getSession(supabase);
      if (session?.user) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!session?.user) {
      setStatus('Signed in, but session is not available. Please restart the app.');
      return;
    }

    setEmail(session.user.email ?? e);
    setStep('signedIn');
    setStatus('');
    await refreshProjects(supabase);
  };

  const pickVaultFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select your Obsidian/OneDrive vault folder',
    });
    if (typeof selected === 'string') {
      setVaultPath(selected);
      // First-time vault pick should immediately write the full AI bundle.
      void writeAiGuide(selected);
      setStatus('Starting sync…');
      void startSyncAllForVault(selected, { startWatching: true, startPulling: true, pullOnce: true });
    }
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setStep('signedOut');
    setEmail('');
    setProjects([]);
    setWatching(false);
    setPulling(false);
    try {
      await saveRuntimeState({ version: 1, vaultPath: '', syncAllProjects: true, watching: false, pulling: false });
    } catch {
      // ignore
    }
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
    setVaultPath('');
    setStatus('Reset.');
    setWatching(false);
    setPulling(false);
    try {
      await saveRuntimeState({ version: 1, vaultPath: '', syncAllProjects: true, watching: false, pulling: false });
    } catch {
      // ignore
    }
  };

  const getAuth = async () => {
    if (!supabase || !config) return null;
    const session = await getSession(supabase);
    if (!session?.user) return null;
    return {
      session,
      auth: {
        supabase_url: config.supabaseUrl,
        supabase_anon_key: config.supabaseAnonKey,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        owner_id: session.user.id,
      },
    };
  };

  const projectLocal = (p: Project, rootVault: string) => {
    const name = safeFolderName(p.name);
    const suffix = p.id.slice(0, 8);
    const rel = `${syncRootFolderName}/${name}__${suffix}`;
    const abs = joinPath(rootVault, rel);
    return { rel, abs };
  };

  const startSyncAllForVault = async (
    rootVault: string,
    opts?: { startWatching?: boolean; startPulling?: boolean; pullOnce?: boolean },
  ) => {
    const startWatching = opts?.startWatching ?? true;
    const startPulling = opts?.startPulling ?? true;
    const pullOnce = opts?.pullOnce ?? true;

    if (!rootVault) return;
    const authPack = await getAuth();
    if (!authPack) {
      setStatus('Not signed in (session missing).');
      return;
    }

    setStatus('Loading projects…');
    const rows = supabase ? await refreshProjects(supabase) : projects;
    if (!rows.length) {
      setStatus('No projects found in your account.');
      return;
    }

    setStatus(`Preparing vault (${rows.length} projects)…`);
    try {
      await invoke('vault_ensure_dir', { vaultPath: rootVault, relativePath: syncRootFolderName });
    } catch {
      // ignore; root vault may already have it
    }

    // First pull everything, then start background loops.
    if (pullOnce) {
      for (const p of rows) {
        const loc = projectLocal(p, rootVault);
        // eslint-disable-next-line no-await-in-loop
        await invoke('vault_ensure_dir', { vaultPath: rootVault, relativePath: loc.rel });
        // eslint-disable-next-line no-await-in-loop
        await invoke('sync_pull_once', { vaultPath: loc.abs, projectFolderId: p.id, auth: authPack.auth });
      }
    }

    if (startWatching) {
      for (const p of rows) {
        const loc = projectLocal(p, rootVault);
        // eslint-disable-next-line no-await-in-loop
        await invoke('sync_watch_start', { vaultPath: loc.abs, projectFolderId: p.id, auth: authPack.auth });
      }
      setWatching(true);
    }

    if (startPulling) {
      for (const p of rows) {
        const loc = projectLocal(p, rootVault);
        // eslint-disable-next-line no-await-in-loop
        await invoke('sync_pull_start', { vaultPath: loc.abs, projectFolderId: p.id, auth: authPack.auth, intervalMs: 5000 });
      }
      setPulling(true);
    }

    setStatus('');
    setSyncInfo(
      `Syncing ${rows.length} projects into ${syncRootFolderName}/… (${startWatching ? 'push' : 'no push'} + ${
        startPulling ? 'pull' : 'no pull'
      }).`,
    );
    void writeAiGuide(rootVault);
    try {
      await saveRuntimeState({ version: 1, vaultPath: rootVault, syncAllProjects: true, watching: startWatching, pulling: startPulling });
    } catch {
      // ignore
    }
  };

  const stopSyncAll = async () => {
    setStatus('Stopping sync…');
    try {
      await invoke('sync_watch_stop');
    } catch {
      // ignore
    }
    try {
      await invoke('sync_pull_stop');
    } catch {
      // ignore
    }
    setWatching(false);
    setPulling(false);
    setStatus('');
    setSyncInfo('Sync stopped.');
    try {
      await saveRuntimeState({ version: 1, vaultPath, syncAllProjects: true, watching: false, pulling: false });
    } catch {
      // ignore
    }
  };

  const triggerRagIngestAll = async () => {
    if (!supabase || !config) return;
    const session = await getSession(supabase);
    if (!session?.user) return;
    if (!projects.length) return;
    if (!openAiKey.trim()) {
      setStatus('RAG ingest needs an OpenAI API key (set it below).');
      return;
    }
    const normalizeBase = (raw: string) => {
      const s = String(raw || '').trim().replace(/\/$/, '');
      if (!s) return '';
      if (/^https?:\/\//i.test(s)) return s;
      return `https://${s}`;
    };
    const base = normalizeBase(config.nexusmapApiBaseUrl);
    setStatus(`Triggering RAG ingest… (${base || 'unknown base'})`);
    try {
      const okProjects: string[] = [];
      for (const p of projects) {
        // Use Rust backend for network reliability (WebView fetch can fail).
        // eslint-disable-next-line no-await-in-loop
        await invoke('rag_ingest_jwt', {
          req: {
            project_folder_id: p.id,
            access_token: session.access_token,
            api_base_url: base,
            openai_api_key: openAiKey.trim(),
          },
        });
        okProjects.push(p.name);
      }
      setStatus('');
      setSyncInfo('RAG ingest triggered for all projects.');
    } catch (e: any) {
      const msg =
        typeof e === 'string'
          ? e
          : e?.message
            ? String(e.message)
            : e?.error
              ? String(e.error)
              : (() => {
                  try {
                    return JSON.stringify(e);
                  } catch {
                    return String(e);
                  }
                })();
      setStatus(`RAG ingest failed: ${msg || 'unknown error'}`);
    }
  };

  const saveKey = async () => {
    const k = openAiKeyDraft.trim();
    if (!k) return;
    try {
      await saveOpenAiKey(k);
      setOpenAiKey(k);
      setStatus('Saved OpenAI API key.');
      setTimeout(() => setStatus(''), 1200);
    } catch (e: any) {
      setStatus(`Failed to save key: ${e?.message ?? String(e)}`);
    }
  };

  const clearKey = async () => {
    try {
      await clearOpenAiKey();
      setOpenAiKey('');
      setOpenAiKeyDraft('');
      setStatus('Cleared OpenAI API key.');
      setTimeout(() => setStatus(''), 1200);
    } catch (e: any) {
      setStatus(`Failed to clear key: ${e?.message ?? String(e)}`);
    }
  };

  const loadEvents = async () => {
    if (!vaultPath) return;
    try {
      const all: any[] = [];
      for (const p of projects) {
        const loc = projectLocal(p, vaultPath);
        // eslint-disable-next-line no-await-in-loop
        const evs = (await invoke('sync_read_events', { vaultPath: loc.abs, limit: 40 })) as any[];
        if (Array.isArray(evs)) all.push(...evs);
      }
      all.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
      setEvents(all.slice(0, 80));
      if (!all.length) {
        setStatus('No events yet (sync can still be healthy). Try again after an edit or a remote change.');
        setTimeout(() => setStatus(''), 2500);
      }
    } catch {
      setEvents([]);
      setStatus('Failed to load events.');
      setTimeout(() => setStatus(''), 2000);
    }
  };

  const writeAiGuide = async (vaultOverride?: string) => {
    const vp = vaultOverride || vaultPath;
    if (!vp) return;
    setStatus('Writing AI bundle into vault…');
    try {
      let bundle = buildAiGuideBundle();
      if (config?.nexusmapApiBaseUrl) {
        try {
          const base = config.nexusmapApiBaseUrl.replace(/\/$/, '');
          const res = await fetch(`${base}/api/ai-guides/bundle`, { method: 'GET' });
          const json = (await res.json().catch(() => null)) as any;
          if (res.ok && json?.ok && Array.isArray(json?.files) && json.files.length) {
            bundle = json.files.map((f: any) => ({ relativePath: String(f.relativePath || ''), content: String(f.content || '') }));
          }
        } catch {
          // fall back to built-in bundle
        }
      }
      try {
        await invoke('vault_ensure_dir', { vaultPath: vp, relativePath: 'NexusMap AI' });
      } catch {
        // ignore
      }
      for (const f of bundle) {
        // eslint-disable-next-line no-await-in-loop
        await invoke('vault_write_text_file', { vaultPath: vp, relativePath: f.relativePath, content: f.content });
      }
      setStatus('');
      setSyncInfo('Wrote the full AI bundle into `NexusMap AI/`.');
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

              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={toggleLaunchAtLogin} type="button">
                  {launchAtLogin ? 'Disable launch at login' : 'Enable launch at login'}
                </button>
                <div className="muted">{launchAtLogin ? 'Launch at login: ON' : 'Launch at login: OFF'}</div>
              </div>

              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btnPrimary" onClick={pickVaultFolder} type="button">
                  Choose vault folder
                </button>
                <div className="mono">{vaultPath || '(not selected)'}</div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="muted">OpenAI API key (for RAG reindex)</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <input
                    value={openAiKeyDraft}
                    onChange={(e) => setOpenAiKeyDraft(e.target.value)}
                    placeholder="sk-…"
                    type="password"
                  />
                  <button className="btn btnPrimary" onClick={saveKey} type="button" disabled={!openAiKeyDraft.trim()}>
                    Save
                  </button>
                  <button className="btn" onClick={clearKey} type="button" disabled={!openAiKey.trim()}>
                    Clear
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Stored locally in Keychain. Never sent to NexusMap except as a request header to generate embeddings.
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="muted">
                    Projects in account: <span className="mono">{projects.length}</span>
                  </div>
                  <button className="btn" onClick={() => supabase && refreshProjects(supabase)} type="button">
                    Refresh
                  </button>
                </div>

                {projects.length === 0 ? (
                  <div className="muted" style={{ marginTop: 10 }}>
                    No projects found. If you have “projects” in the web app but don’t see them here, those may be local-only (not saved to
                    Supabase) or you may be connected to a different environment/account.
                  </div>
                ) : null}

                <div className="muted" style={{ marginTop: 10 }}>
                  When you choose a vault, NexusMap Sync will mirror every project into{' '}
                  <span className="mono">{syncRootFolderName}/&lt;ProjectName&gt;/…</span>.
                </div>

                <div className="row" style={{ marginTop: 12 }}>
                  {watching || pulling ? (
                    <button className="btn" onClick={stopSyncAll} type="button">
                      Stop sync
                    </button>
                  ) : (
                    <button className="btn btnPrimary" onClick={() => startSyncAllForVault(vaultPath)} type="button" disabled={!vaultPath}>
                      Start sync
                    </button>
                  )}
                  <button className="btn" onClick={loadEvents} type="button" disabled={!vaultPath}>
                    View events
                  </button>
                  <button className="btn" onClick={triggerRagIngestAll} type="button" disabled={!projects.length}>
                    Reindex (RAG)
                  </button>
                  <button className="btn" onClick={() => writeAiGuide()} type="button" disabled={!vaultPath}>
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

