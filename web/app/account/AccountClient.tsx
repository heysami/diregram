'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { normalizeLayoutDirection, type LayoutDirection } from '@/lib/layout-direction';
import { fetchProfileDefaultLayoutDirection, updateProfileDefaultLayoutDirection } from '@/lib/layout-direction-supabase';
import { DiregramMark } from '@/components/DiregramMark';

const OPENAI_KEY_STORAGE = 'diregram.openaiApiKey.v1';

function loadOpenAiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(OPENAI_KEY_STORAGE) || '');
  } catch {
    return '';
  }
}

function saveOpenAiKey(next: string) {
  if (typeof window === 'undefined') return;
  try {
    if (!next) window.localStorage.removeItem(OPENAI_KEY_STORAGE);
    else window.localStorage.setItem(OPENAI_KEY_STORAGE, next);
  } catch {
    // ignore
  }
}

type SshOnboardingBundle = {
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
};

export default function AccountClient() {
  const router = useRouter();
  const { configured, supabase, ready, user, signOut } = useAuth();
  const [defaultLayoutDirection, setDefaultLayoutDirection] = useState<LayoutDirection>('horizontal');
  const [savingLayoutDirection, setSavingLayoutDirection] = useState(false);
  const [openAiKey, setOpenAiKey] = useState('');
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [sshBundle, setSshBundle] = useState<SshOnboardingBundle | null>(null);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshError, setSshError] = useState<string | null>(null);

  useEffect(() => {
    setOpenAiKey(loadOpenAiKey());
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
    setSshLoading(true);
    try {
      const res = await fetch('/api/rag/mcp-ssh/onboarding', { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as Partial<SshOnboardingBundle> & { error?: string };
      if (!res.ok) {
        const msg = json?.error ? String(json.error) : `Failed (HTTP ${res.status})`;
        setSshError(msg);
        return;
      }
      const rawArgs = (json as Record<string, unknown>).args;
      const next: SshOnboardingBundle = {
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

                <div className="mac-double-outline p-3 space-y-2">
                  <div className="font-semibold">MCP SSH Setup (Claude / Cursor / Codex)</div>
                  <div className="text-[11px] opacity-70">
                    Generates one-time MCP config for each client type.
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="mac-btn mac-btn--primary" onClick={createSshOnboarding} disabled={sshLoading}>
                      {sshLoading ? 'Generating…' : '1) Generate MCP Config'}
                    </button>
                  </div>
                  {sshError ? <div className="text-[11px] text-red-700">{sshError}</div> : null}
                  {sshBundle ? (
                    <div className="space-y-2 pt-1">
                      <div className="mac-double-outline p-2 space-y-1">
                        <div className="font-semibold text-[11px]">2) STDIO clients (Cursor, Codex app, Claude Desktop)</div>
                        <div className="text-[11px] opacity-70">Use STDIO mode, then paste these:</div>
                        <div className="text-[11px]">
                          Name: <span className="font-mono">diregram</span>
                        </div>
                        <div className="text-[11px]">
                          Command: <span className="font-mono">{sshBundle.command}</span>
                        </div>
                        <div className="text-[11px]">
                          Args JSON: <span className="font-mono break-all">{sshBundle.argsJson}</span>
                        </div>
                        <div className="text-[11px]">
                          Args JSON (+ OpenAI key arg): <span className="font-mono break-all">{sshBundle.argsWithOpenAiKeyJson || '(not generated)'}</span>
                        </div>
                        <div className="text-[11px] opacity-70">If your client asks for one argument per row, use this order:</div>
                        <div className="mac-double-outline p-2 space-y-0.5">
                          {sshBundle.args.map((arg, idx) => (
                            <div key={`${idx}-${arg}`} className="text-[11px]">
                              {idx + 1}. <span className="font-mono break-all">{arg}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.command, 'Command')}>
                            Copy Command
                          </button>
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.argsJson, 'Args JSON')}>
                            Copy Args JSON
                          </button>
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.args.join('\n'), 'Args (one per row)')}>
                            Copy Args (line by line)
                          </button>
                          <button
                            type="button"
                            className="mac-btn"
                            onClick={() => copyText(sshBundle.argsWithOpenAiKeyJson || sshBundle.argsJson, 'Args JSON (+ OpenAI key)')}
                          >
                            Copy Args JSON (+ OpenAI key)
                          </button>
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.codexToml, 'Codex TOML')}>
                            Copy Codex TOML
                          </button>
                          <button
                            type="button"
                            className="mac-btn"
                            onClick={() => copyText(sshBundle.codexTomlWithOpenAiKey || sshBundle.codexToml, 'Codex TOML (+ OpenAI key)')}
                          >
                            Copy Codex TOML (+ OpenAI key)
                          </button>
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.cursorSnippet, 'Cursor snippet')}>
                            Copy Cursor JSON
                          </button>
                          <button
                            type="button"
                            className="mac-btn"
                            onClick={() =>
                              copyText(
                                sshBundle.cursorSnippetWithOpenAiEnv || sshBundle.cursorSnippet,
                                'Cursor JSON (+ OPENAI_API_KEY env)',
                              )
                            }
                          >
                            Copy Cursor JSON (+ env key)
                          </button>
                          <button type="button" className="mac-btn" onClick={() => copyText(sshBundle.claudeDesktopSnippet, 'Claude Desktop snippet')}>
                            Copy Claude Desktop JSON
                          </button>
                          <button
                            type="button"
                            className="mac-btn"
                            onClick={() =>
                              copyText(
                                sshBundle.claudeDesktopSnippetWithOpenAiEnv || sshBundle.claudeDesktopSnippet,
                                'Claude Desktop JSON (+ OPENAI_API_KEY env)',
                              )
                            }
                          >
                            Copy Claude Desktop JSON (+ env key)
                          </button>
                        </div>
                        <div className="text-[11px] opacity-70">
                          Host: <span className="font-mono">{sshBundle.sshUser}@{sshBundle.sshHost}:{sshBundle.sshPort}</span> · Token: <span className="font-mono">{sshBundle.tokenHint}</span>
                        </div>
                      </div>

                      <div className="mac-double-outline p-2 space-y-1">
                        <div className="font-semibold text-[11px]">3) Claude Web connector screen (URL mode only)</div>
                        {sshBundle.claudeConnectorUrl ? (
                          <>
                            <div className="text-[11px]">Name: <span className="font-mono">diregram</span></div>
                            <div className="text-[11px]">Remote MCP server URL: <span className="font-mono break-all">{sshBundle.claudeConnectorUrl}</span></div>
                            <div className="text-[11px] opacity-70">Leave OAuth Client ID / Secret empty.</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="mac-btn"
                                onClick={() => copyText(sshBundle.claudeConnectorUrl, 'Claude connector URL')}
                              >
                                Copy Claude URL
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="text-[11px] text-red-700">
                            Claude Web URL is not configured. Set NEXT_PUBLIC_MCP_SERVER_URL on your web app env first.
                          </div>
                        )}
                      </div>
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
