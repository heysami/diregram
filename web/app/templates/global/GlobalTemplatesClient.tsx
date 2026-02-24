'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GlobalTemplateCard,
  GlobalTemplatesAdminPanel,
  GlobalTemplatesToolbar,
  GlobalTemplatesTopNav,
  PaginationBar,
  ToastBanner,
  computeRendered,
  computeTypeKey,
  computeTypeLabel,
  useDebouncedValue,
  useGlobalTemplatesAdmin,
  useOwnerEmails,
  useToast,
  type GlobalTemplateCardModel,
} from '@/components/global-templates';
import { useAuth } from '@/hooks/use-auth';
import { isUuid } from '@/lib/is-uuid';
import { clearGlobalTemplates, deleteGlobalTemplate, listGlobalTemplatesForBrowserPaged, type GlobalTemplateBrowserEntry } from '@/lib/global-templates';
import { installGlobalTemplateToLibrary } from '@/lib/install-global-template';

export default function GlobalTemplatesClient() {
  const router = useRouter();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [rows, setRows] = useState<GlobalTemplateBrowserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const [queryInput, setQueryInput] = useState('');
  const query = useDebouncedValue(queryInput, 240);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [reloadTick, setReloadTick] = useState(0);

  const canBrowse = supabaseMode && ready && !!supabase && isUuid(user?.id);
  const { toast, setToast } = useToast({ durationMs: 1600 });
  const { isAdmin, loading: adminLoading } = useGlobalTemplatesAdmin({ enabled: canBrowse, supabase, userId: user?.id });

  useEffect(() => {
    setPageIndex(0);
  }, [query]);

  useEffect(() => {
    if (!canBrowse) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await listGlobalTemplatesForBrowserPaged(supabase!, { pageIndex, pageSize, query });
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      } catch (e) {
        const msg = (e as any)?.message ? String((e as any).message) : 'Failed to load global templates.';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canBrowse, pageIndex, pageSize, query, reloadTick, supabase]);

  const { ownerEmailById: ownerEmailMap } = useOwnerEmails({
    enabled: canBrowse,
    supabase,
    ownerIds: rows.map((r) => r.ownerId),
  });

  const models = useMemo<GlobalTemplateCardModel[]>(() => {
    return (rows || []).map((r) => {
      const { header, rendered } = computeRendered(r.content);
      const name = header?.name || r.name || 'Untitled';
      const typeKey = computeTypeKey(header);
      const typeLabel = computeTypeLabel(header);
      const ownerLabel = ownerEmailMap[r.ownerId] || (r.ownerId ? r.ownerId.slice(0, 8) : 'Unknown');
      return {
        id: r.id,
        name,
        ownerId: r.ownerId,
        ownerLabel,
        typeKey,
        typeLabel,
        header,
        rendered,
      };
    });
  }, [rows, ownerEmailMap]);

  const contentById = useMemo(() => {
    const m = new Map<string, string>();
    (rows || []).forEach((r) => m.set(r.id, String(r.content || '')));
    return m;
  }, [rows]);

  const typeOptions = useMemo(() => {
    const map = new Map<string, string>();
    models.forEach((m) => {
      if (!m.typeKey || m.typeKey === 'unknown') return;
      if (!map.has(m.typeKey)) map.set(m.typeKey, m.typeLabel);
    });
    const sorted = Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    return [{ id: 'all', label: 'All types' }, ...sorted.map(([id, label]) => ({ id, label }))];
  }, [models]);

  const filtered = useMemo(() => {
    return models.filter((m) => {
      if (typeFilter !== 'all' && m.typeKey !== typeFilter) return false;
      return true;
    });
  }, [models, typeFilter]);

  const totalPages = useMemo(() => {
    if (typeof total !== 'number' || !Number.isFinite(total)) return null;
    return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  }, [pageSize, total]);

  const canPrev = pageIndex > 0;
  const canNext = totalPages ? pageIndex + 1 < totalPages : rows.length === pageSize;

  return (
    <main className="mac-desktop min-h-screen flex flex-col">
      <GlobalTemplatesTopNav titleSuffix="Global templates" />

      <div className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-6 py-8 space-y-4">
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
              <div className="text-xs opacity-80">Global templates are available to authenticated users.</div>
              <div>
                <button
                  type="button"
                  className="mac-btn mac-btn--primary mac-btn--lg"
                  onClick={() => router.push(`/login?next=${encodeURIComponent('/templates/global')}`)}
                >
                  Sign in
                </button>
              </div>
            </div>
          ) : (
            <>
              <GlobalTemplatesToolbar
                queryInput={queryInput}
                onQueryInputChange={setQueryInput}
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                typeOptions={typeOptions}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />

              {isAdmin ? (
                <GlobalTemplatesAdminPanel
                  loading={loading}
                  onRefresh={() => {
                    if (pageIndex !== 0) setPageIndex(0);
                    setReloadTick((n) => n + 1);
                    setToast('Refreshing…');
                  }}
                  onClearAll={async () => {
                    if (!supabase) return;
                    const ok = confirm('Clear ALL global templates? This cannot be undone.');
                    if (!ok) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const n = await clearGlobalTemplates(supabase);
                      setRows([]);
                      setTotal(0);
                      setPageIndex(0);
                      setReloadTick((v) => v + 1);
                      setToast(`Cleared ${n} templates`);
                    } catch (e) {
                      const msg = (e as any)?.message ? String((e as any).message) : 'Failed to clear global templates.';
                      setError(msg);
                    } finally {
                      setLoading(false);
                    }
                  }}
                />
              ) : adminLoading ? (
                <div className="text-[11px] opacity-70">Checking admin permissions…</div>
              ) : null}

              {error ? (
                <div className="mac-window mac-double-outline p-4 text-sm text-red-800 bg-white">{error}</div>
              ) : null}

              <PaginationBar
                loading={loading}
                pageIndex={pageIndex}
                totalPages={totalPages}
                canPrev={canPrev}
                canNext={canNext}
                onPrev={() => setPageIndex((p) => Math.max(0, p - 1))}
                onNext={() => setPageIndex((p) => p + 1)}
                leftLabel={typeof total === 'number' ? `${total.toLocaleString()} templates` : filtered.length ? `${filtered.length} templates` : ''}
              />

              {loading ? <div className="text-xs opacity-80">Loading templates…</div> : null}

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.length === 0 && !loading ? (
                  <div className="mac-window mac-double-outline p-5 text-sm opacity-80">No templates found.</div>
                ) : null}

                {filtered.map((m) => (
                  <GlobalTemplateCard
                    key={m.id}
                    model={m}
                    isAdmin={isAdmin}
                    onOpen={() => router.push(`/templates/global/${encodeURIComponent(m.id)}`)}
                    onInstall={
                      !canBrowse
                        ? undefined
                        : async () => {
                            if (!supabase) return;
                            const userId = user?.id || '';
                            if (!isUuid(userId)) return;
                            const content = contentById.get(m.id) || '';
                            try {
                              setToast('Installing…');
                              const installed = await installGlobalTemplateToLibrary(supabase, {
                                userId,
                                content,
                                fallbackName: m.name,
                                scope: 'account',
                              });
                              setToast(`Installed: ${installed.name}`);
                              router.push(`/editor?file=${encodeURIComponent(installed.fileId)}`);
                            } catch (e) {
                              const msg = (e as any)?.message ? String((e as any).message) : 'Install failed.';
                              setToast(msg);
                            }
                          }
                    }
                    onDelete={
                      !isAdmin
                        ? undefined
                        : async () => {
                            if (!supabase) return;
                            const ok = confirm(`Delete "${m.name}" from global templates?`);
                            if (!ok) return;
                            try {
                              const willEmptyPage = rows.length === 1;
                              await deleteGlobalTemplate(supabase, m.id);
                              setRows((prev) => prev.filter((r) => r.id !== m.id));
                              setTotal((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev));
                              setToast('Deleted');
                              if (willEmptyPage && pageIndex > 0) setPageIndex((p) => Math.max(0, p - 1));
                            } catch (e2) {
                              const msg = (e2 as any)?.message ? String((e2 as any).message) : 'Failed to delete template.';
                              setError(msg);
                            }
                          }
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
