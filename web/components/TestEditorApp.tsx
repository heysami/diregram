'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { useAuth } from '@/hooks/use-auth';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { EditorMenubar } from '@/components/EditorMenubar';
import { useYjsNexusTextPersistence } from '@/hooks/use-yjs-nexus-text-persistence';
import { canEditFromAccess } from '@/lib/access-control';
import { loadTestDoc, saveTestDoc, type TestDoc } from '@/lib/testjson';
import { makeStarterTestMarkdown } from '@/lib/test-starter';
import { useRemoteNexusDoc } from '@/hooks/use-remote-nexus-doc';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { loadFlowTabProcessReferences } from '@/lib/flowtab-process-references';
import { buildTreeTestModel } from '@/lib/testing/tree-test-model';
import type { TestingTest } from '@/lib/testing-store';
import { TreeTestRunner } from '@/components/testing/TreeTestRunner';
import { useWorkspaceFiles } from '@/components/note/embed-config/useWorkspaceFiles';
import { WorkspaceFilePicker } from '@/components/note/embed-config/WorkspaceFilePicker';

type ActiveFileMeta = {
  id: string;
  name: string;
  folderId: string | null;
  roomName: string;
  canEdit: boolean;
  initialContent?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function updateDocMarkdown(yDoc: Y.Doc, next: string) {
  const yText = yDoc.getText('nexus');
  const cur = yText.toString();
  if (cur === next) return;
  yDoc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

export function TestEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  const activeRoomName = activeFile?.roomName || 'test-demo';

  const { doc: yDoc, provider, status, connectedRoomName, synced } = useYjs(activeRoomName);

  const [markdown, setMarkdown] = useState('');
  useEffect(() => {
    if (!yDoc) return;
    const yText = yDoc.getText('nexus');
    const sync = () => setMarkdown(yText.toString());
    sync();
    yText.observe(sync);
    return () => {
      try {
        yText.unobserve(sync);
      } catch {
        // ignore
      }
    };
  }, [yDoc]);

  // Load file metadata based on ?file=...
  useEffect(() => {
    const fileIdFromUrl = searchParams?.get('file');
    if (!fileIdFromUrl) {
      router.replace('/workspace');
      return;
    }
    let cancelled = false;

    // Local mode
    if (!supabaseMode) {
      const store = ensureLocalFileStore();
      const file = store.files.find((f) => f.id === fileIdFromUrl) || null;
      if (!file) {
        router.replace('/workspace');
        return;
      }
      const initialContent = loadFileSnapshot(file.id) || '';
      setActiveFile({
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        roomName: file.roomName,
        canEdit: true,
        initialContent,
      });
      return;
    }

    // Supabase mode
    (async () => {
      if (!ready) return;
      if (!supabase) return;
      try {
        const { data: fileRow, error: fileErr } = await supabase
          .from('files')
          .select('id,name,folder_id,room_name,content,access,owner_id')
          .eq('id', fileIdFromUrl)
          .single();
        if (fileErr || !fileRow) throw fileErr || new Error('File not found');

        const folderId = fileRow.folder_id as string | null;
        const { data: folderRow } = folderId
          ? await supabase.from('folders').select('id,owner_id,access').eq('id', folderId).maybeSingle()
          : { data: null as { access?: unknown } | null };

        const isOwner = user?.id && fileRow.owner_id === user.id;
        const canEdit =
          !!isOwner ||
          canEditFromAccess(fileRow.access, user?.email || null) ||
          canEditFromAccess(folderRow?.access, user?.email || null);
        if (!canEdit) {
          router.replace('/workspace');
          return;
        }

        const roomName = (fileRow.room_name as string | null) || `file-${fileRow.id}`;
        if (!fileRow.room_name) supabase.from('files').update({ room_name: roomName }).eq('id', fileRow.id).then(() => {});
        supabase.from('files').update({ last_opened_at: nowIso() }).eq('id', fileRow.id).then(() => {});

        const initialContent = (fileRow.content as string) || '';
        if (!cancelled) {
          setActiveFile({
            id: String(fileRow.id),
            name: String(fileRow.name || 'Untitled'),
            folderId,
            roomName,
            canEdit: true,
            initialContent,
          });
        }
      } catch {
        if (!cancelled) router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, router, searchParams, supabase, supabaseMode, user?.email, user?.id]);

  useYjsNexusTextPersistence({
    doc: yDoc,
    provider,
    activeRoomName,
    connectedRoomName,
    synced,
    fileId: activeFile?.id || null,
    initialContent: activeFile?.initialContent,
    makeStarterMarkdown: makeStarterTestMarkdown,
    loadSnapshot: (fileId) => loadFileSnapshot(fileId),
    saveSnapshot: (fileId, md) => saveFileSnapshot(fileId, md),
    persistRemote:
      supabaseMode && activeFile?.id && supabase && activeFile.canEdit
        ? (md) => {
            supabase
              .from('files')
              .update({ content: md, updated_at: nowIso() })
              .eq('id', activeFile.id)
              .then(() => {});
          }
        : undefined,
  });

  const parsed = useMemo(() => loadTestDoc(markdown || ''), [markdown]);
  const testDoc = parsed.doc;

  const updateTest = useCallback(
    (patch: Partial<TestDoc>) => {
      if (!yDoc) return;
      const cur = loadTestDoc(yDoc.getText('nexus').toString()).doc;
      if (!cur) return;
      const next: TestDoc = { ...cur, ...patch, updatedAt: nowIso() };
      const nextMd = saveTestDoc(yDoc.getText('nexus').toString(), next);
      updateDocMarkdown(yDoc, nextMd);
    },
    [yDoc],
  );

  const sourceFileIdRaw = testDoc ? String(testDoc.sourceFileId || '').trim() : '';
  const sourceFileId = sourceFileIdRaw.startsWith('<') ? '' : sourceFileIdRaw;
  const remote = useRemoteNexusDoc({ fileId: sourceFileId ? sourceFileId : null, supabaseMode, ready, supabase: supabase || null });
  const sourceDoc = remote.doc;
  const [sourceDocRev, setSourceDocRev] = useState(0);

  useEffect(() => {
    if (!sourceDoc) return;
    const yText = sourceDoc.getText('nexus');
    const onUpdate = () => {
      setSourceDocRev((n) => n + 1);
    };
    onUpdate();
    yText.observe(onUpdate);
    return () => yText.unobserve(onUpdate);
  }, [sourceDoc, sourceFileId]);

  const { files: workspaceFiles, loading: loadingWorkspaceFiles } = useWorkspaceFiles({ kinds: ['diagram'] });
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const sourceDiagramLabel = useMemo(() => {
    if (!sourceFileId) return 'Select a diagram…';
    const f = workspaceFiles.find((x) => x.id === sourceFileId) || null;
    return f ? f.name : sourceFileIdRaw;
  }, [sourceFileId, sourceFileIdRaw, workspaceFiles]);

  const { flowRoots, mainRoots, flowRefs } = useMemo(() => {
    void sourceDocRev;
    if (!sourceDoc) return { flowRoots: [] as any[], mainRoots: [] as any[], flowRefs: {} as any };
    const roots = parseNexusMarkdown(sourceDoc.getText('nexus').toString());
    const flowRoots = roots.filter((r) => (r.metadata as any)?.flowTab);
    const mainRoots = roots.filter((r) => !(r.metadata as any)?.flowTab);
    const flowRefs = loadFlowTabProcessReferences(sourceDoc);
    return { flowRoots, mainRoots, flowRefs };
  }, [sourceDoc, sourceDocRev]);

  const flowNodeOptions = useMemo(() => {
    if (!testDoc) return [] as Array<{ id: string; label: string; depth: number; hasRef: boolean }>;
    const root = flowRoots.find((r: any) => r.id === testDoc.flowRootId) || flowRoots[0] || null;
    if (!root) return [] as Array<{ id: string; label: string; depth: number; hasRef: boolean }>;
    const out: Array<{ id: string; label: string; depth: number; hasRef: boolean }> = [];
    const visited = new Set<string>();
    const walk = (n: any, depth: number) => {
      if (!n || visited.has(n.id)) return;
      visited.add(n.id);
      out.push({ id: n.id, label: n.content, depth, hasRef: Boolean((flowRefs as any)[n.id]) });
      (n.children || []).forEach((c: any) => walk(c, depth + 1));
      if (n.isHub && n.variants) (n.variants || []).forEach((v: any) => walk(v, depth + 1));
    };
    walk(root, 0);
    return out;
  }, [flowRoots, flowRefs, testDoc]);

  // If the user changes source diagram, ensure Flow selections are still valid.
  useEffect(() => {
    if (!testDoc) return;
    if (!sourceDoc) return;
    if (flowRoots.length === 0) return;
    const hasRoot = flowRoots.some((r: any) => r.id === testDoc.flowRootId);
    const nextFlowRootId = hasRoot ? testDoc.flowRootId : String(flowRoots[0]?.id || '');
    if (nextFlowRootId && nextFlowRootId !== testDoc.flowRootId) {
      updateTest({ flowRootId: nextFlowRootId });
      return;
    }
    const hasRef = Boolean((flowRefs as any)[testDoc.flowNodeId]);
    if (hasRef) return;
    const firstWithRef = flowNodeOptions.find((o) => o.hasRef);
    if (firstWithRef?.id && firstWithRef.id !== testDoc.flowNodeId) {
      updateTest({ flowNodeId: firstWithRef.id });
    }
  }, [flowNodeOptions, flowRefs, flowRoots, sourceDoc, testDoc, updateTest]);

  const model = useMemo(() => {
    void sourceDocRev;
    if (!testDoc) return null;
    if (!sourceDoc) return null;
    const selectedTest: TestingTest = {
      id: 'test-file',
      name: testDoc.name,
      flowRootId: testDoc.flowRootId,
      flowNodeId: testDoc.flowNodeId,
      createdAt: typeof testDoc.createdAt === 'number' ? testDoc.createdAt : Date.now(),
    };
    return buildTreeTestModel({ doc: sourceDoc, selectedTest, mainRoots, flowRoots, flowRefs });
  }, [flowRoots, flowRefs, mainRoots, sourceDoc, sourceDocRev, testDoc]);

  const statusLabel = useMemo(() => {
    if (status === 'connected') return 'Online';
    if (status === 'connecting') return 'Connecting…';
    return 'Offline';
  }, [status]);

  if (!yDoc || !activeFile) return <div className="flex h-screen items-center justify-center text-xs opacity-80">Loading…</div>;

  if (!testDoc) {
    return (
      <main className="mac-desktop flex h-screen flex-col">
        <EditorMenubar status={statusLabel} activeFileName={activeFile.name || 'Test'} onWorkspace={() => router.push('/workspace')} />
        <div className="p-6 text-sm">
          <div className="mac-window mac-double-outline p-4 bg-white text-red-800">Missing or invalid `testjson` block in this file.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <EditorMenubar status={statusLabel} activeFileName={activeFile.name || 'Test'} onWorkspace={() => router.push('/workspace')} />

      <div className="flex-1 overflow-hidden flex">
        <aside className="w-[360px] shrink-0 border-r border-slate-200 bg-white/70 overflow-auto">
          <div className="p-3 space-y-3">
            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Test</div>
              <label className="block">
                <div className="text-[11px] opacity-70 mb-1">Name</div>
                <input className="mac-field w-full h-9" value={testDoc.name} onChange={(e) => updateTest({ name: e.target.value })} />
              </label>
              <div>
                <div className="text-[11px] opacity-70 mb-1">Source diagram</div>
                <div className="text-sm font-semibold truncate" title={sourceDiagramLabel}>
                  {sourceDiagramLabel}
                </div>
                {sourceFileId ? (
                  <div className="mt-1 text-[11px] font-mono opacity-60 truncate" title={sourceFileId}>
                    {sourceFileId}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] opacity-60">Choose a diagram file to configure Flow + run.</div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="mac-btn mac-btn--primary h-8" onClick={() => setShowSourcePicker(true)}>
                    Choose…
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Flow</div>
              <label className="block">
                <div className="text-[11px] opacity-70 mb-1">Flow root</div>
                <select
                  className="mac-field w-full h-9"
                  value={testDoc.flowRootId}
                  onChange={(e) => updateTest({ flowRootId: e.target.value })}
                  disabled={!sourceDoc || flowRoots.length === 0}
                >
                  {flowRoots.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {String(r.content || 'Flow')}
                    </option>
                  ))}
                </select>
              </label>

              <div className="text-[11px] opacity-70">Flow node (must have reference)</div>
              <div className="border border-slate-200 max-h-[48vh] overflow-auto bg-white">
                {flowNodeOptions.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500">{sourceDoc ? 'No flow nodes found.' : 'Load source file to choose nodes.'}</div>
                ) : (
                  flowNodeOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => updateTest({ flowNodeId: o.id })}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${testDoc.flowNodeId === o.id ? 'bg-blue-50' : ''} ${
                        o.hasRef ? 'text-slate-900' : 'text-slate-400'
                      }`}
                      style={{ paddingLeft: 12 + o.depth * 14 }}
                      title={o.hasRef ? 'Selectable' : 'No reference assigned'}
                    >
                      {o.label} {o.hasRef ? <span className="text-[11px] text-slate-500">(ref)</span> : null}
                    </button>
                  ))
                )}
              </div>
              {sourceDoc && !(flowRefs as any)[testDoc.flowNodeId] ? (
                <div className="text-[11px] text-red-600">Pick a node that has a Flow→Process reference.</div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-auto bg-white">
          <div className="p-4">
            {!sourceDoc ? (
              <div className="text-xs opacity-70">Loading source diagram…</div>
            ) : model?.kind === 'error' ? (
              <div className="text-sm text-red-700">{model.message}</div>
            ) : model?.kind === 'ready' ? (
              <TreeTestRunner doc={sourceDoc} model={model} />
            ) : (
              <div className="text-xs opacity-70">Loading…</div>
            )}
          </div>
        </div>
      </div>

      <WorkspaceFilePicker
        open={showSourcePicker}
        title="Select source diagram"
        files={workspaceFiles}
        loading={loadingWorkspaceFiles}
        onPick={(f) => {
          updateTest({ sourceFileId: f.id });
          setShowSourcePicker(false);
        }}
        onClose={() => setShowSourcePicker(false)}
      />
    </main>
  );
}

