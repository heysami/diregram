import { useEffect, useMemo, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { invoke } from '@tauri-apps/api/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSession } from './lib/supabase';
import { buildAiGuideBundle } from './lib/aiGuideContent';
import { buildEnv } from './lib/env';
import { DiregramMark } from './components/DiregramMark';
import { ConnectPanel } from './components/ConnectPanel';
import { SignedOutPanel } from './components/SignedOutPanel';
import { OpenAiKeySection } from './components/OpenAiKeySection';
import { EventsList } from './components/EventsList';
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
import { fetchAccountProjects, type Project } from './features/projects/projectsClient';
import { writeAiBundleToVault } from './features/ai/aiBundleWriter';
import { reindexRagForProjects } from './features/rag/ragClient';
import { loadAllProjectEvents, startSyncAllProjects, stopSyncAllProjects } from './features/sync/syncClient';
import { projectLocalPath } from './lib/localPaths';

type AppStep = 'signedOut' | 'signedIn';

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
    try {
      setStatus('Loading projects…');
      const rows = await fetchAccountProjects(sb);
      setProjects(rows);
      setStatus('');
      return rows;
    } catch (e: any) {
      setStatus(`Failed to load projects: ${e?.message ?? String(e)}`);
      return [];
    }
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

  const startSyncAllForVault = async (
    rootVault: string,
    opts?: { startWatching?: boolean; startPulling?: boolean; pullOnce?: boolean },
  ) => {
    const startWatching = opts?.startWatching ?? true;
    const startPulling = opts?.startPulling ?? true;
    const pullOnce = opts?.pullOnce ?? true;

    if (!rootVault) return;
    setStatus('Loading projects…');
    const rows = supabase ? await refreshProjects(supabase) : projects;
    if (!rows.length) {
      setStatus('No projects found in your account.');
      return;
    }

    setStatus(`Preparing vault (${rows.length} projects)…`);
    try {
      if (!supabase || !config) throw new Error('Missing config');
      await startSyncAllProjects({
        invoke,
        supabase,
        config,
        projects: rows,
        rootVault,
        syncRootFolderName,
        pullOnce,
        startWatching,
        startPulling,
      });
      setWatching(Boolean(startWatching));
      setPulling(Boolean(startPulling));
    } catch (e: any) {
      setStatus(`Sync failed: ${e?.message ?? String(e)}`);
      return;
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
      await stopSyncAllProjects(invoke);
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
    if (!projects.length) return;
    try {
      setStatus('Triggering RAG ingest…');
      await reindexRagForProjects({
        invoke,
        supabase,
        config,
        projects,
        vaultPath: vaultPath || null,
        syncRootFolderName,
        openAiKey,
      });
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
      const evs = await loadAllProjectEvents({ invoke, projects, rootVault: vaultPath, syncRootFolderName });
      setEvents(evs);
      if (!evs.length) {
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
      await writeAiBundleToVault({ invoke, vaultPath: vp, apiBaseUrl: config?.nexusmapApiBaseUrl || null });
      setStatus('');
      setSyncInfo('Wrote the full AI bundle into `NexusMap AI/`.');
    } catch (e: any) {
      setStatus(`Write guide failed: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div className="appShell macDesktop">
      <div className="card macWindow">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="titleRow">
              <span className="brandMark">
                <DiregramMark size={16} />
              </span>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>Diregram Sync</div>
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
          {!config ? (
            <ConnectPanel
              hostedUrl={configHostedUrl}
              onHostedUrlChange={setConfigHostedUrl}
              onConnect={connectHosted}
              showAdvanced={showAdvancedConfig}
              onToggleAdvanced={() => setShowAdvancedConfig((v) => !v)}
              supabaseUrl={configSupabaseUrl}
              anonKey={configAnonKey}
              apiBaseUrl={configApiBaseUrl}
              onSupabaseUrlChange={setConfigSupabaseUrl}
              onAnonKeyChange={setConfigAnonKey}
              onApiBaseUrlChange={setConfigApiBaseUrl}
            />
          ) : null}

          {step === 'signedOut' ? (
            <SignedOutPanel
              loginEmail={loginEmail}
              loginOtp={loginOtp}
              onLoginEmailChange={setLoginEmail}
              onLoginOtpChange={setLoginOtp}
              onSendCode={sendEmailCode}
              onVerify={verifyEmailCode}
              onResetConfig={resetConfig}
            />
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

              <OpenAiKeySection
                value={openAiKeyDraft}
                onChange={setOpenAiKeyDraft}
                hasSavedKey={Boolean(openAiKey.trim())}
                onSave={saveKey}
                onClear={clearKey}
              />

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

                <EventsList events={events} />
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

