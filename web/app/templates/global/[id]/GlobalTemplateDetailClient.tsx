'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GlobalTemplateAdminPanel, GlobalTemplatesTopNav, ToastBanner, useGlobalTemplatesAdmin, useToast } from '@/components/global-templates';
import { useAuth } from '@/hooks/use-auth';
import { isUuid } from '@/lib/is-uuid';
import { deleteGlobalTemplate, loadGlobalTemplateRow } from '@/lib/global-templates';
import { installGlobalTemplateToLibrary } from '@/lib/install-global-template';
import { readTemplateHeader, renderTemplatePayload } from '@/lib/nexus-template';
import { buildTemplateVarDefaults, computeEffectiveTemplateVars } from '@/lib/template-vars';
import { TemplateRenderedPreview } from '@/components/templates/TemplateRenderedPreview';
import { canEditFromAccess } from '@/lib/access-control';
import { InstallDestinationControls } from '@/components/templates/InstallDestinationControls';
import type { NexusTemplateHeader } from '@/lib/nexus-template';

function toSingleParam(v: string | string[] | undefined): string {
  if (!v) return '';
  return Array.isArray(v) ? String(v[0] || '') : String(v);
}

function typeLabel(header: NexusTemplateHeader | null): string {
  if (!header) return 'Unknown';
  const base = String(header.targetKind || 'Unknown');
  if (header.mode === 'appendFragment') return `${base} · ${String(header.fragmentKind || 'fragment')}`;
  return base;
}

export default function GlobalTemplateDetailClient() {
  const router = useRouter();
  const params = useParams();
  const templateId = toSingleParam((params as any)?.id);

  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;
  const canBrowse = supabaseMode && ready && !!supabase && isUuid(user?.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, setToast } = useToast({ durationMs: 1600 });
  const [row, setRow] = useState<{
    id: string;
    name: string;
    ownerId: string;
    updatedAtIso: string | null;
    createdAtIso: string | null;
    content: string;
  } | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const { isAdmin, loading: adminLoading } = useGlobalTemplatesAdmin({ enabled: canBrowse, supabase, userId: user?.id });

  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');

  // Variable editing (for preview)
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const lastVarsKeyRef = useRef<string>('');

  const [installScope, setInstallScope] = useState<'account' | 'project'>('account');
  const [projects, setProjects] = useState<Array<{ id: string; name: string; canEdit: boolean }>>([]);
  const [installProjectId, setInstallProjectId] = useState<string>('');

  useEffect(() => {
    if (!canBrowse) return;
    if (!supabase) return;
    const userId = user?.id || '';
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('folders')
          .select('id,name,owner_id,access,parent_id')
          .is('parent_id', null)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const rows = (data as any[] | null | undefined) || [];
        const next = rows
          .map((r) => {
            const id = String(r?.id || '');
            const name = String(r?.name || 'Untitled');
            const ownerId = String(r?.owner_id || '');
            const access = (r as any)?.access ?? null;
            const isOwner = ownerId === userId;
            const canEdit = isOwner || canEditFromAccess(access, user?.email || null);
            return { id, name, canEdit };
          })
          .filter((r) => !!r.id)
          // Avoid offering the special account templates folder as a "project".
          .filter((r) => r.name !== 'Account Templates');
        if (cancelled) return;
        setProjects(next);
        if (!installProjectId) {
          const firstEditable = next.find((p) => p.canEdit) || next[0] || null;
          if (firstEditable?.id) setInstallProjectId(firstEditable.id);
        }
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBrowse, supabase, user?.id]);

  useEffect(() => {
    if (!canBrowse) return;
    if (!templateId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await loadGlobalTemplateRow(supabase!, templateId);
        if (cancelled) return;
        setRow(r);
      } catch (e) {
        const msg = (e as any)?.message ? String((e as any).message) : 'Failed to load template.';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canBrowse, supabase, templateId]);

  useEffect(() => {
    if (!canBrowse) return;
    const ownerId = row?.ownerId || '';
    if (!isUuid(ownerId)) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase!.from('profiles').select('email').eq('id', ownerId).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        const email = typeof (data as any)?.email === 'string' ? String((data as any).email) : null;
        setOwnerEmail(email);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canBrowse, row?.ownerId, supabase]);

  const parsed = useMemo(() => {
    const { header, rest } = readTemplateHeader(row?.content || '');
    return { header: header || null, payload: String(rest || '') };
  }, [row?.content]);

  const effectiveVars = useMemo(() => {
    return computeEffectiveTemplateVars(parsed.header, parsed.payload);
  }, [parsed.header, parsed.payload]);

  useEffect(() => {
    const key = JSON.stringify(effectiveVars);
    if (key === lastVarsKeyRef.current) return;
    lastVarsKeyRef.current = key;
    setVarValues(buildTemplateVarDefaults(effectiveVars));
  }, [effectiveVars]);

  const rendered = useMemo(() => renderTemplatePayload(parsed.payload, varValues), [parsed.payload, varValues]);

  const onChangeVar = useCallback((name: string, value: string) => {
    setVarValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  return (
    <main className="mac-desktop min-h-screen flex flex-col">
      <GlobalTemplatesTopNav titleSuffix="Template preview" backToGlobalList />

      <div className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
          <ToastBanner toast={toast} />

          {!supabaseMode ? (
            <div className="mac-window mac-double-outline p-5 text-sm">
              Global templates require Supabase mode (not local admin mode).
            </div>
          ) : !ready ? (
            <div className="mac-window mac-double-outline p-5 text-sm">Loading…</div>
          ) : !isUuid(user?.id) ? (
            <div className="mac-window mac-double-outline p-5 space-y-3">
              <div className="text-sm font-bold tracking-tight">Sign in required</div>
              <div>
                <button
                  type="button"
                  className="mac-btn mac-btn--primary mac-btn--lg"
                  onClick={() => router.push(`/login?next=${encodeURIComponent(`/templates/global/${templateId}`)}`)}
                >
                  Sign in
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="mac-window mac-double-outline p-5 text-sm text-red-800 bg-white">{error}</div>
          ) : loading || !row ? (
            <div className="text-xs opacity-80">Loading template…</div>
          ) : (
            <div className="flex gap-4 flex-col lg:flex-row">
              <aside className="w-full lg:w-[340px] shrink-0 space-y-3">
                <div className="mac-window mac-double-outline p-4 bg-white">
                  <div className="text-sm font-bold tracking-tight truncate" title={row.name}>
                    {parsed.header?.name || row.name || 'Untitled'}
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] opacity-80">
                    <div>
                      published by: <span className="font-mono">{ownerEmail || row.ownerId.slice(0, 8)}</span>
                    </div>
                    <div>
                      type: <span className="font-mono">{typeLabel(parsed.header)}</span>
                    </div>
                    {row.updatedAtIso ? (
                      <div>
                        updated:{' '}
                        <span className="font-mono">
                          {(() => {
                            try {
                              return new Date(row.updatedAtIso).toLocaleString();
                            } catch {
                              return row.updatedAtIso;
                            }
                          })()}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <InstallDestinationControls
                      scope={installScope}
                      onScopeChange={setInstallScope as any}
                      projectId={installProjectId}
                      onProjectIdChange={setInstallProjectId}
                      projects={projects}
                      onInstall={async () => {
                        if (!supabase) return;
                        const userId = user?.id || '';
                        if (!isUuid(userId)) return;
                        if (installScope === 'project') {
                          const pid = String(installProjectId || '').trim();
                          if (!pid) return setToast('Pick a project first.');
                          const proj = projects.find((p) => p.id === pid) || null;
                          if (proj && !proj.canEdit) return setToast('No edit access to that project.');
                        }
                        try {
                          setToast('Installing…');
                          const installed = await installGlobalTemplateToLibrary(supabase, {
                            userId,
                            content: row.content,
                            fallbackName: parsed.header?.name || row.name,
                            scope: installScope,
                            ...(installScope === 'project' ? { projectFolderId: installProjectId } : {}),
                          });
                          setToast(`Installed: ${installed.name}`);
                          router.push(`/editor?file=${encodeURIComponent(installed.fileId)}`);
                        } catch (e) {
                          const msg = (e as any)?.message ? String((e as any).message) : 'Install failed.';
                          setToast(msg);
                        }
                      }}
                    />
                  </div>
                </div>

                {isAdmin ? (
                  <GlobalTemplateAdminPanel
                    onDelete={async () => {
                      if (!supabase) return;
                      const name = parsed.header?.name || row?.name || 'Untitled';
                      const ok = confirm(`Delete "${name}" from global templates?`);
                      if (!ok) return;
                      try {
                        await deleteGlobalTemplate(supabase, templateId);
                        setToast('Deleted');
                        router.push('/templates/global');
                      } catch (e) {
                        const msg = (e as any)?.message ? String((e as any).message) : 'Failed to delete template.';
                        setError(msg);
                      }
                    }}
                  />
                ) : adminLoading ? (
                  <div className="text-[11px] opacity-70">Checking admin permissions…</div>
                ) : null}

                <div className="mac-window mac-double-outline p-4 bg-white space-y-2">
                  <div className="text-xs font-semibold">Variables (for preview)</div>
                  {effectiveVars.length === 0 ? (
                    <div className="text-xs opacity-70">No variables.</div>
                  ) : (
                    <div className="space-y-2">
                      {effectiveVars.map((v) => {
                        const val = String(varValues[v.name] ?? '');
                        const label = v.label || v.name;
                        return (
                          <label key={v.name} className="block">
                            <div className="text-[11px] opacity-70 mb-1">
                              {label} {v.required ? <span className="text-red-600">*</span> : null}
                            </div>
                            <input
                              className="mac-field w-full h-9"
                              value={val}
                              onChange={(e) => onChangeVar(v.name, e.target.value)}
                              placeholder={v.default ?? ''}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </aside>

              <div className="flex-1 min-w-0">
                <div className="mac-window mac-double-outline p-4 bg-white">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-[11px] font-semibold text-slate-700">
                      {tab === 'preview' ? 'Rendered output preview' : 'Template markdown (read-only)'}
                    </div>
                    <div className="flex items-center gap-1 rounded border bg-white p-0.5">
                      <button
                        type="button"
                        className={`mac-btn h-8 ${tab === 'preview' ? 'mac-btn--primary' : ''}`}
                        onClick={() => setTab('preview')}
                        title="Template preview"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className={`mac-btn h-8 ${tab === 'markdown' ? 'mac-btn--primary' : ''}`}
                        onClick={() => setTab('markdown')}
                        title="View template markdown"
                      >
                        Markdown
                      </button>
                    </div>
                  </div>

                  {tab === 'preview' ? (
                    <TemplateRenderedPreview header={parsed.header} rendered={rendered} heightPx={720} />
                  ) : (
                    <textarea
                      className="w-full h-[720px] resize-none outline-none font-mono text-[12px] leading-snug bg-white text-slate-900 p-3 border rounded"
                      value={row.content || ''}
                      readOnly
                      spellCheck={false}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
