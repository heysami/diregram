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

export default function AccountClient() {
  const router = useRouter();
  const { configured, supabase, ready, user, signOut } = useAuth();
  const [defaultLayoutDirection, setDefaultLayoutDirection] = useState<LayoutDirection>('horizontal');
  const [savingLayoutDirection, setSavingLayoutDirection] = useState(false);
  const [openAiKey, setOpenAiKey] = useState('');
  const [savedToast, setSavedToast] = useState<string | null>(null);

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

