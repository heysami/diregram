'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { normalizeLayoutDirection, type LayoutDirection } from '@/lib/layout-direction';
import { fetchProfileDefaultLayoutDirection, updateProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';
import { DiregramMark } from '@/components/DiregramMark';
import { loadOpenAiApiKeyFromBrowser, saveOpenAiApiKeyToBrowser } from '@/lib/openai-key-browser';

type McpTargetClient = 'cursor' | 'codex' | 'claude_desktop' | 'claude_web';

const MCP_TARGET_OPTIONS: Array<{ value: McpTargetClient; label: string }> = [
  { value: 'cursor', label: 'Cursor (STDIO)' },
  { value: 'codex', label: 'Codex (STDIO)' },
  { value: 'claude_desktop', label: 'Claude Desktop (STDIO)' },
  { value: 'claude_web', label: 'Claude Web (Remote URL)' },
];

function loadOpenAiKey(): string {
  return loadOpenAiApiKeyFromBrowser();
}

function saveOpenAiKey(next: string) {
  saveOpenAiApiKeyToBrowser(next);
}

function normalizeTargetClient(input: string): McpTargetClient {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'codex') return 'codex';
  if (raw === 'claude_desktop') return 'claude_desktop';
  if (raw === 'claude_web') return 'claude_web';
  return 'cursor';
}

type SshOnboardingBundle = {
  targetClient: McpTargetClient;
  tokenScope: 'account' | 'project';
  projectPublicId: string | null;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  command: string;
  args: string[];
  argsWithOpenAiKey: string[];
  argsJson: string;
  argsWithOpenAiKeyJson: string;
  codexToml: string;
  codexTomlWithOpenAiKey: string;
  cursorSnippet: string;
  cursorSnippetWithOpenAiEnv: string;
  claudeDesktopSnippet: string;
  claudeDesktopSnippetWithOpenAiEnv: string;
  claudeConnectorUrl: string;
  tokenHint: string;
  note: string;
  hasInjectedOpenAiKey: boolean;
  supportsOauth: boolean;
};

type McpProjectOption = {
  publicId: string;
  name: string;
};

export default function AccountClient() {
  const router = useRouter();
  const { configured, supabase, ready, user, signOut } = useAuth();
  const [defaultLayoutDirection, setDefaultLayoutDirection] = useState<LayoutDirection>('horizontal');
  const [savingLayoutDirection, setSavingLayoutDirection] = useState(false);
  const [openAiKey, setOpenAiKey] = useState('');
  const [mcpTargetClient, setMcpTargetClient] = useState<McpTargetClient>('cursor');
  const [mcpOpenAiKey, setMcpOpenAiKey] = useState('');
  const [mcpProjects, setMcpProjects] = useState<McpProjectOption[]>([]);
  const [mcpProjectsLoading, setMcpProjectsLoading] = useState(false);
  const [mcpProjectPublicId, setMcpProjectPublicId] = useState('');
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [sshBundle, setSshBundle] = useState<SshOnboardingBundle | null>(null);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshError, setSshError] = useState<string | null>(null);

  useEffect(() => {
    const key = loadOpenAiKey();
    setOpenAiKey(key);
    setMcpOpenAiKey(key);
  }, []);

  useEffect(() => {
    if (!configured) return;
    if (!ready) return;
    if (!supabase) return;
    if (!user?.id) return;
    let cancelled = false;
    fetchProfileDefaultLayoutDirection(supabase, user.id).then((dir) => {
      if (cancelled) return;
      setDefaultLayoutDirection(dir);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, ready, supabase, user?.id]);

  useEffect(() => {
    if (!configured) return;
    if (!ready) return;
    if (!supabase) return;
    if (!user?.id) return;
    let cancelled = false;
    setMcpProjectsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('rag_projects')
          .select('public_id,updated_at,folders(name)')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false });
        if (cancelled) return;
        if (error) {
          setMcpProjects([]);
          return;
        }
        const rows = Array.isArray(data) ? (data as Array<{ public_id?: string | null; folders?: { name?: string | null } | null }>) : [];
        setMcpProjects(
          rows
            .map((r) => ({
              publicId: String(r.public_id || '').trim(),
              name: String(r.folders?.name || '').trim(),
            }))
            .filter((r) => Boolean(r.publicId)),
        );
      } finally {
        if (!cancelled) setMcpProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, ready, supabase, user?.id]);

  const showToast = (msg: string) => {
    setSavedToast(msg);
    window.setTimeout(() => setSavedToast(null), 2000);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const createSshOnboarding = async () => {
    setSshError(null);
    const key = mcpOpenAiKey.trim();
    if (mcpTargetClient !== 'claude_web' && !key) {
      setSshError('OpenAI key is required to generate STDIO config with key included.');
      return;
    }
    setSshLoading(true);
    try {
      const res = await fetch('/api/rag/mcp-ssh/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client: mcpTargetClient, openAiApiKey: key, projectPublicId: String(mcpProjectPublicId || '').trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<SshOnboardingBundle> & { error?: string };
      if (!res.ok) {
        const msg = json?.error ? String(json.error) : `Failed (HTTP ${res.status})`;
        setSshError(msg);
        return;
      }
      const rawArgs = (json as Record<string, unknown>).args;
      const next: SshOnboardingBundle = {
        targetClient: normalizeTargetClient(String((json as Record<string, unknown>).targetClient || mcpTargetClient)),
        tokenScope: String((json as Record<string, unknown>).tokenScope || 'account').toLowerCase() === 'project' ? 'project' : 'account',
        projectPublicId: String((json as Record<string, unknown>).projectPublicId || '').trim() || null,
        sshHost: String(json.sshHost || ''),
        sshPort: Number(json.sshPort || 22),
        sshUser: String(json.sshUser || ''),
        command: String(json.command || 'ssh'),
        args: Array.isArray(rawArgs) ? rawArgs.map((x) => String(x)) : [],
        argsWithOpenAiKey: Array.isArray((json as Record<string, unknown>).argsWithOpenAiKey)
          ? ((json as Record<string, unknown>).argsWithOpenAiKey as unknown[]).map((x) => String(x))
          : [],
        argsJson: String(json.argsJson || ''),
        argsWithOpenAiKeyJson: String((json as Record<string, unknown>).argsWithOpenAiKeyJson || ''),
        codexToml: String(json.codexToml || ''),
        codexTomlWithOpenAiKey: String((json as Record<string, unknown>).codexTomlWithOpenAiKey || ''),
        cursorSnippet: String(json.cursorSnippet || ''),
        cursorSnippetWithOpenAiEnv: String((json as Record<string, unknown>).cursorSnippetWithOpenAiEnv || ''),
        claudeDesktopSnippet: String(json.claudeDesktopSnippet || ''),
        claudeDesktopSnippetWithOpenAiEnv: String((json as Record<string, unknown>).claudeDesktopSnippetWithOpenAiEnv || ''),
        claudeConnectorUrl: String((json as Record<string, unknown>).claudeConnectorUrl || ''),
        tokenHint: String(json.tokenHint || ''),
        note: String(json.note || ''),
        hasInjectedOpenAiKey: Boolean((json as Record<string, unknown>).hasInjectedOpenAiKey),
        supportsOauth: Boolean((json as Record<string, unknown>).supportsOauth),
      };
      if (!next.command || !next.args.length || !next.argsJson) {
        setSshError('Server response was incomplete. Check MCP SSH env vars.');
        return;
      }
      setSshBundle(next);
      showToast('MCP config is ready');
    } catch (e) {
      setSshError(e instanceof Error ? e.message : 'Failed to create SSH setup package');
    } finally {
      setSshLoading(false);
    }
  };

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <header className="mac-menubar px-4 flex items-center justify-between shrink-0 z-10 relative">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push('/')} className="text-left">
            <h1 className="text-[13px] font-bold tracking-tight">
              <span aria-hidden className="mr-1 select-none inline-flex items-center align-middle">
                <DiregramMark size={14} />
              </span>
              Diregram <span className="text-[11px] font-normal opacity-70">Account</span>
            </h1>
          </button>
        </div>
        <button type="button" className="mac-btn" onClick={() => router.push('/workspace')}>
          Home
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="mac-window w-[640px] max-w-[92vw] overflow-hidden">
          <div className="mac-titlebar">
            <div className="mac-title">Profile</div>
          </div>
          <div className="p-4 space-y-3 text-xs">
            {savedToast ? <div className="mac-double-outline p-2">{savedToast}</div> : null}
            {!configured ? (
              <div>Supabase auth is not configured.</div>
            ) : !supabase ? (
              <div>Loading…</div>
            ) : !ready ? (
              <div>Loading…</div>
            ) : !user ? (
              <div className="space-y-2">
                <div>You’re signed out.</div>
                <button type="button" className="mac-btn mac-btn--primary" onClick={() => router.push('/login')}>
                  Sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mac-double-outline p-3">
                  <div>
                    <span className="font-semibold">Email:</span> {user.email}
                  </div>
                  <div>
                    <span className="font-semibold">User ID:</span> <span className="font-mono">{user.id}</span>
                  </div>
                </div>

                <div className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold">AI</div>
                  <div className="space-y-1">
                    <div>OpenAI API key (stored only in this browser)</div>
                    <input
                      className="mac-field w-full"
                      value={openAiKey}
                      placeholder="sk-..."
                      onChange={(e) => setOpenAiKey(e.target.value)}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        className="mac-btn"
                        onClick={() => {
                          setOpenAiKey('');
                          setMcpOpenAiKey('');
                          saveOpenAiKey('');
                          setSavedToast('Cleared');
                          window.setTimeout(() => setSavedToast(null), 1600);
                        }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="mac-btn mac-btn--primary"
                        onClick={() => {
                          const next = openAiKey.trim();
                          setMcpOpenAiKey(next);
                          saveOpenAiKey(next);
                          setSavedToast(next ? 'Saved' : 'Cleared');
                          window.setTimeout(() => setSavedToast(null), 1600);
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <div className="text-[11px] opacity-70">
                      This key is used for “Build knowledge base (RAG)” and RAG queries. It is not uploaded to Supabase by default.
                    </div>
                  </div>
                </div>

                <div className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold">Defaults</div>
                  <div className="flex items-center justify-between gap-3">
                    <div>New file layout</div>
                    <select
                      className="mac-field h-7"
                      value={defaultLayoutDirection}
                      disabled={!configured || !supabase || savingLayoutDirection}
                      onChange={async (e) => {
                        const next = normalizeLayoutDirection(e.target.value);
                        setDefaultLayoutDirection(next);
                        if (!supabase || !user?.id) return;
                        setSavingLayoutDirection(true);
                        try {
                          await updateProfileDefaultLayoutDirection(supabase, user.id, next);
                        } finally {
                          setSavingLayoutDirection(false);
                        }
                      }}
                      title="Default layout direction for new files"
                    >
                      <option value="horizontal">Left → Right</option>
                      <option value="vertical">Top → Down</option>
                    </select>
                  </div>
                  <div className="text-[11px] opacity-70">
                    Per-file layout can be changed in the editor; this sets the default for new files (and for existing files
                    that don’t have an override yet).
                  </div>
                </div>

                <div id="mcp-ssh-setup" className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold">MCP SSH Setup (Claude / Cursor / Codex)</div>
                  <div className="text-[11px] opacity-70">
                    Select the client first, then generate only that client’s setup.
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px]">Target AI client</div>
                    <select
                      className="mac-field h-7 w-full"
                      value={mcpTargetClient}
                      onChange={(e) => {
                        setMcpTargetClient(normalizeTargetClient(e.target.value));
                        setSshBundle(null);
                        setSshError(null);
                      }}
                    >
                      {MCP_TARGET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px]">Default project (recommended)</div>
                    <select
                      className="mac-field h-7 w-full"
                      value={mcpProjectPublicId}
                      disabled={mcpProjectsLoading}
                      onChange={(e) => setMcpProjectPublicId(String(e.target.value || ''))}
                    >
                      <option value="">No fixed project (account token)</option>
                      {mcpProjects.map((p) => (
                        <option key={p.publicId} value={p.publicId}>
                          {p.name ? `${p.name} (${p.publicId})` : p.publicId}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] opacity-70">
                      If selected, generated token is project-scoped so project choice is retained across reconnects.
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px]">OpenAI key for generated MCP config</div>
                    <input
                      className="mac-field w-full"
                      type="password"
                      value={mcpOpenAiKey}
                      placeholder="sk-..."
                      onChange={(e) => setMcpOpenAiKey(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="text-[11px] opacity-70">
                      {mcpTargetClient === 'claude_web'
                        ? 'Claude Web URL mode does not include SSH args; this key is not embedded in the connector URL.'
                        : 'This key will be embedded in generated SSH arguments for this config.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="mac-btn mac-btn--primary" onClick={createSshOnboarding} disabled={sshLoading}>
                      {sshLoading ? 'Generating…' : `1) Generate ${MCP_TARGET_OPTIONS.find((x) => x.value === mcpTargetClient)?.label || 'MCP'} Config`}
                    </button>
                  </div>
                  {sshError ? <div className="text-[11px] text-red-700">{sshError}</div> : null}
                  {sshBundle ? (
                    <div className="space-y-2 pt-1">
                      {sshBundle.targetClient === 'claude_web' ? (
                        <div className="mac-double-outline p-2 space-y-1">
                          <div className="font-semibold text-[11px]">2) Claude Web connector</div>
                          <div className="text-[11px]">Name: <span className="font-mono">diregram</span></div>
                          <div className="text-[11px]">Remote MCP server URL: <span className="font-mono break-all">{sshBundle.claudeConnectorUrl || '(missing)'}</span></div>
                          <div className="text-[11px] opacity-70">Leave OAuth fields blank.</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="mac-btn"
                              onClick={() => copyText(sshBundle.claudeConnectorUrl, 'Claude connector URL')}
                              disabled={!sshBundle.claudeConnectorUrl}
                            >
                              Copy Claude URL
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mac-double-outline p-2 space-y-1">
                          <div className="font-semibold text-[11px]">2) STDIO setup</div>
                          <div className="text-[11px]">Name: <span className="font-mono">diregram</span></div>
                          <div className="text-[11px]">Command: <span className="font-mono">{sshBundle.command}</span></div>
                          <div className="text-[11px]">Args JSON: <span className="font-mono break-all">{sshBundle.argsJson}</span></div>
                          {sshBundle.targetClient === 'cursor' ? null : (
                            <>
                              <div className="text-[11px] opacity-70">If your client asks for one argument per row, use this order:</div>
                              <div className="mac-double-outline p-2 space-y-0.5">
                                {sshBundle.args.map((arg, idx) => (
                                  <div key={`${idx}-${arg}`} className="text-[11px]">
                                    {idx + 1}. <span className="font-mono break-all">{arg}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.command, 'Command')}>
                              Copy Command
                            </button>
                            <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.argsJson, 'Args JSON')}>
                              Copy Args JSON
                            </button>
                            {sshBundle.targetClient === 'cursor' ? null : (
                              <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.args.join('\n'), 'Args (line by line)')}>
                                Copy Args (line by line)
                              </button>
                            )}
                            {sshBundle.targetClient === 'codex' ? (
                              <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.codexToml, 'Codex TOML')}>
                                Copy Codex TOML
                              </button>
                            ) : null}
                            {sshBundle.targetClient === 'cursor' ? (
                              <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.cursorSnippet, 'Cursor JSON')}>
                                Copy Cursor JSON
                              </button>
                            ) : null}
                            {sshBundle.targetClient === 'claude_desktop' ? (
                              <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.claudeDesktopSnippet, 'Claude Desktop JSON')}>
                                Copy Claude Desktop JSON
                              </button>
                            ) : null}
                          </div>
                          <div className="text-[11px] opacity-70">
                            Host: <span className="font-mono">{sshBundle.sshUser}@{sshBundle.sshHost}:{sshBundle.sshPort}</span> · Token: <span className="font-mono">{sshBundle.tokenHint}</span>
                          </div>
                          <div className="text-[11px] opacity-70">
                            Scope: <span className="font-mono">{sshBundle.tokenScope}</span>
                            {sshBundle.projectPublicId ? (
                              <> · Project: <span className="font-mono">{sshBundle.projectPublicId}</span></>
                            ) : null}
                          </div>
                        </div>
                      )}
                      <div className="text-[11px] opacity-70">{sshBundle.note}</div>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="mac-btn"
                    onClick={async () => {
                      await signOut();
                      router.push('/');
                    }}
                  >
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
