'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useAuth } from '@/hooks/use-auth';
import { useYjs } from '@/hooks/use-yjs';
import { useYjsNexusTextPersistence } from '@/hooks/use-yjs-nexus-text-persistence';
import { canEditFromAccess } from '@/lib/access-control';
import { ensureLocalFileStore } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { EditorMenubar } from '@/components/EditorMenubar';
import { TemplateRenderedPreview } from '@/components/templates/TemplateRenderedPreview';
import type { ToolType } from '@/components/Toolbar';
import { NexusCanvas } from '@/components/NexusCanvas';
import { SpreadsheetView } from '@/components/grid/SpreadsheetView';
import { loadGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { SystemFlowEditor } from '@/components/SystemFlowEditor';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { loadSystemFlowStateFromDoc, saveSystemFlowStateToDoc, type SystemFlowState } from '@/lib/system-flow-storage';
import { loadFlowTabSwimlane, saveFlowTabSwimlane, type FlowTabSwimlaneData } from '@/lib/flowtab-swimlane-storage';
import { TldrawTileEditor } from '@/components/vision/tldraw/TldrawTileEditor';
import type { TLEditorSnapshot } from 'tldraw';
import { TemplateGlobalPublishControls } from '@/components/templates/TemplateGlobalPublishControls';
import { TemplateGlobalPublishPanel } from '@/components/templates/TemplateGlobalPublishPanel';
import { useGlobalTemplatePublisher } from '@/components/templates/useGlobalTemplatePublisher';
import {
  buildTemplateHeaderBlock,
  readTemplateHeader,
  renderTemplatePayload,
  type NexusTemplateHeader,
} from '@/lib/nexus-template';
import { buildTemplateVarDefaults, computeEffectiveTemplateVars } from '@/lib/template-vars';

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

function makeStarterTemplateMarkdown(): string {
  const header: NexusTemplateHeader = {
    version: 1,
    name: 'New Template',
    description: 'Describe what this template produces.',
    targetKind: 'note',
    mode: 'createFile',
    vars: [{ name: 'title', label: 'Title', default: 'My Title', required: true }],
    tags: ['template'],
  };
  const payload = ['# {{title}}', '', 'Write your template content here.', ''].join('\n');
  return buildTemplateHeaderBlock(header) + payload;
}

function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function usePreviewYDoc(text: string) {
  const doc = useMemo(() => new Y.Doc(), []);
  useEffect(() => {
    const yText = doc.getText('nexus');
    const next = String(text || '').replace(/\r\n?/g, '\n');
    if (yText.toString() === next) return;
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, next);
    });
  }, [doc, text]);
  return doc;
}

function DiagramPreview({ markdown }: { markdown: string }) {
  const doc = usePreviewYDoc(String(markdown || '').trimEnd() + '\n');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const [processFlowModeNodes, setProcessFlowModeNodes] = useState<Set<string>>(() => new Set());
  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>(() => ({}));

  return (
    <div className="mac-window mac-double-outline overflow-hidden" style={{ height: 640 }}>
      <NexusCanvas
        doc={doc}
        activeTool={'select' as ToolType}
        layoutDirection="horizontal"
        mainLevel={1}
        pinnedTagIds={[]}
        showComments={false}
        showAnnotations={false}
        initialFitToContent
        activeVariantState={activeVariantState}
        onActiveVariantChange={setActiveVariantState}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        expandedNodes={expandedNodes}
        onExpandedNodesChange={setExpandedNodes}
        processFlowModeNodes={processFlowModeNodes}
        onProcessFlowModeNodesChange={setProcessFlowModeNodes}
        getRunningNumber={() => undefined}
      />
    </div>
  );
}

function parseGridSheetTemplate(rendered: string): { version: 1; sheet: Omit<GridSheetV1, 'id'> & { id?: string } } {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-grid-sheet[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid grid sheet template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported grid sheet template version.');
  if (!parsed.sheet || typeof parsed.sheet !== 'object') throw new Error('Invalid sheet template payload.');
  return parsed as any;
}

function GridPreview({ rendered, mode, fragmentKind }: { rendered: string; mode: NexusTemplateHeader['mode']; fragmentKind?: string }) {
  const parsed = useMemo(() => {
    if (mode === 'appendFragment' && fragmentKind === 'gridSheet') {
      const tpl = parseGridSheetTemplate(rendered);
      const sheetId = String((tpl.sheet as any)?.id || 'sheet-1');
      const sheet: GridSheetV1 = { ...(tpl.sheet as any), id: sheetId };
      const doc: GridDoc = { version: 1, activeSheetId: sheetId, sheets: [sheet] } as any;
      return doc;
    }
    // createFile (or unknown fragment) => try full grid markdown
    return loadGridDoc(rendered).doc;
  }, [fragmentKind, mode, rendered]);

  const [doc, setDoc] = useState<GridDoc>(parsed);
  useEffect(() => setDoc(parsed), [parsed]);

  const activeSheet = useMemo<GridSheetV1 | null>(() => {
    const sheets = doc.sheets || [];
    return sheets.find((s) => s.id === doc.activeSheetId) || sheets[0] || null;
  }, [doc]);

  if (!activeSheet) return <div className="text-xs opacity-70">No sheets to preview.</div>;

  return (
    <div className="mac-window mac-double-outline overflow-hidden" style={{ height: 640 }}>
      <SpreadsheetView
        doc={doc}
        sheet={activeSheet}
        activeTool="select"
        onChangeSheet={(nextSheet) => {
          const nextSheets = (doc.sheets || []).map((s) => (s.id === nextSheet.id ? nextSheet : s));
          setDoc({ ...(doc as any), sheets: nextSheets } as any);
        }}
        onChangeDoc={(nextDoc) => setDoc(nextDoc)}
        diagramFiles={[]}
        linkedDiagramFileId={null}
        linkedDataObjectStore={null}
        canEditLinkedDiagramFile={false}
        templateFiles={[]}
        loadTemplateMarkdown={async () => ''}
        onSaveTemplateFile={undefined}
      />
    </div>
  );
}

function parseVisionCardTemplate(rendered: string): { version: 1; props: { w?: number; h?: number; title?: string; thumb?: string; tileSnapshot?: string } } {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-vision-card[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid vision card template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported vision card template version.');
  if (!parsed.props || typeof parsed.props !== 'object') throw new Error('Invalid vision card template payload.');
  return parsed as any;
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function VisionCardPreview({ rendered }: { rendered: string }) {
  const parsed = useMemo(() => parseVisionCardTemplate(rendered), [rendered]);
  const w = clamp(Number(parsed.props.w ?? 360), 180, 1200);
  const h = clamp(Number(parsed.props.h ?? 240), 120, 900);
  const thumb = typeof parsed.props.thumb === 'string' && parsed.props.thumb.trim() ? parsed.props.thumb.trim() : '';
  const tileSnapshotStr =
    typeof parsed.props.tileSnapshot === 'string' && parsed.props.tileSnapshot.trim() ? parsed.props.tileSnapshot.trim() : '';
  const tileSnapshot = useMemo(() => {
    if (!tileSnapshotStr) return null;
    const parsed = safeJsonParse<Partial<TLEditorSnapshot>>(tileSnapshotStr);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }, [tileSnapshotStr]);

  return (
    <div className="mac-window mac-double-outline overflow-hidden bg-white" style={{ width: w, height: h }}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="Vision card thumbnail" className="w-full h-full object-cover" />
      ) : tileSnapshot ? (
        <div className="w-full h-full">
          <TldrawTileEditor
            initialSnapshot={tileSnapshot}
            sessionStorageKey={`template:visioncard:preview:${parsed.version}:${w}:${h}`}
            thumbOutPx={256}
            onChange={() => {}}
          />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs opacity-70 bg-black/5">No thumbnail saved</div>
      )}
    </div>
  );
}

function parseFlowTabTemplate(rendered: string): {
  version: 1;
  flowName: string;
  rootMarkdown: string;
  swimlane: {
    lanes: FlowTabSwimlaneData['lanes'];
    stages: FlowTabSwimlaneData['stages'];
    pinnedTagIds?: string[];
    placementByOffset: Record<string, { laneId: string; stage: number }>;
  };
} {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-flowtab[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid flow template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported flow template version.');
  const swim = parsed.swimlane;
  if (!swim || typeof swim !== 'object') throw new Error('Missing swimlane data.');
  return {
    version: 1,
    flowName: typeof parsed.flowName === 'string' ? parsed.flowName : 'Flow',
    rootMarkdown: typeof parsed.rootMarkdown === 'string' ? parsed.rootMarkdown : '',
    swimlane: {
      lanes: Array.isArray(swim.lanes) ? swim.lanes : [],
      stages: Array.isArray(swim.stages) ? swim.stages : [],
      pinnedTagIds: Array.isArray(swim.pinnedTagIds) ? swim.pinnedTagIds : [],
      placementByOffset:
        swim.placementByOffset && typeof swim.placementByOffset === 'object' ? (swim.placementByOffset as any) : {},
    },
  };
}

function injectFidIntoRootMarkdown(rawBlock: string, fid: string): string {
  const src = String(rawBlock || '').replace(/\r\n?/g, '\n').trimEnd();
  if (!src.trim()) return '';
  const lines = src.split('\n');
  let firstIdx = 0;
  while (firstIdx < lines.length && !lines[firstIdx].trim()) firstIdx++;
  if (firstIdx >= lines.length) return '';
  const line0 = lines[firstIdx];
  const hasFid = /<!--\s*fid:[^>]+-->/.test(line0);
  lines[firstIdx] = hasFid ? line0.replace(/<!--\s*fid:[^>]+-->/, `<!-- fid:${fid} -->`) : `${line0} <!-- fid:${fid} -->`;
  return lines.join('\n') + '\n';
}

function FlowTabPreview({ rendered }: { rendered: string }) {
  const tpl = useMemo(() => parseFlowTabTemplate(rendered), [rendered]);
  const fid = 'flow-preview';
  const block = useMemo(() => injectFidIntoRootMarkdown(tpl.rootMarkdown, fid), [tpl.rootMarkdown]);
  const baseMarkdown = useMemo(() => (block ? `${block}\n---\n` : `Flow preview <!-- fid:${fid} -->\n\n---\n`), [block]);

  const doc = usePreviewYDoc(baseMarkdown);

  const rootFocusId = useMemo(() => {
    const parsed = parseNexusMarkdown(doc.getText('nexus').toString());
    const root = parsed.find((n) => (n.metadata as any)?.fid === fid) || null;
    return root?.id || null;
  }, [doc, fid, baseMarkdown]);

  const swimlane = useMemo(() => {
    const parsed = parseNexusMarkdown(doc.getText('nexus').toString());
    const root = parsed.find((n) => (n.metadata as any)?.fid === fid) || null;
    const rootLineIndex = root?.lineIndex ?? null;
    if (rootLineIndex === null) return null;
    const placement: Record<string, { laneId: string; stage: number }> = {};
    Object.entries(tpl.swimlane.placementByOffset || {}).forEach(([offStr, p]) => {
      const off = Number(offStr);
      if (!Number.isFinite(off) || off < 0) return;
      placement[`node-${rootLineIndex + off}`] = { laneId: String((p as any)?.laneId || ''), stage: Number((p as any)?.stage || 0) };
    });
    const data: FlowTabSwimlaneData = {
      fid,
      lanes: tpl.swimlane.lanes?.length ? tpl.swimlane.lanes : [{ id: 'branch-1', label: 'Lane 1' }],
      stages: tpl.swimlane.stages?.length ? tpl.swimlane.stages : [{ id: 'stage-1', label: 'Stage 1' }],
      placement,
      pinnedTagIds: Array.isArray(tpl.swimlane.pinnedTagIds) ? tpl.swimlane.pinnedTagIds : [],
    };
    return data;
  }, [doc, fid, tpl.swimlane.lanes, tpl.swimlane.pinnedTagIds, tpl.swimlane.placementByOffset, tpl.swimlane.stages]);

  useEffect(() => {
    if (!swimlane) return;
    try {
      saveFlowTabSwimlane(doc, swimlane);
    } catch {
      // ignore
    }
  }, [doc, swimlane]);

  const nodeToLaneId = useMemo(() => {
    const out: Record<string, string> = {};
    if (!swimlane) return out;
    const parsed = parseNexusMarkdown(doc.getText('nexus').toString());
    const root = parsed.find((n) => (n.metadata as any)?.fid === fid) || null;
    if (!root) return out;
    const defaultLaneId = swimlane.lanes[0]?.id || 'branch-1';
    const walk = (n: any) => {
      const laneId = swimlane.placement?.[n.id]?.laneId;
      out[n.id] = laneId && swimlane.lanes.some((l) => l.id === laneId) ? laneId : defaultLaneId;
      (n.children || []).forEach(walk);
      if (n.isHub && n.variants) (n.variants || []).forEach(walk);
    };
    walk(root);
    return out;
  }, [doc, fid, swimlane]);

  const nodeToStage = useMemo(() => {
    const out: Record<string, number> = {};
    if (!swimlane) return out;
    const parsed = parseNexusMarkdown(doc.getText('nexus').toString());
    const root = parsed.find((n) => (n.metadata as any)?.fid === fid) || null;
    if (!root) return out;
    const walk = (n: any) => {
      const raw = swimlane.placement?.[n.id]?.stage;
      out[n.id] = Number.isFinite(raw) ? Math.max(0, raw as number) : 0;
      (n.children || []).forEach(walk);
      if (n.isHub && n.variants) (n.variants || []).forEach(walk);
    };
    walk(root);
    return out;
  }, [doc, fid, swimlane]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const [processFlowModeNodes, setProcessFlowModeNodes] = useState<Set<string>>(() => new Set());
  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>(() => ({}));

  if (!swimlane) return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;

  return (
    <div className="mac-window mac-double-outline overflow-hidden" style={{ height: 640 }}>
      <NexusCanvas
        doc={doc}
        activeTool={'select' as ToolType}
        layoutDirection="horizontal"
        mainLevel={1}
        pinnedTagIds={swimlane.pinnedTagIds || []}
        showComments={false}
        showAnnotations={false}
        initialFitToContent
        activeVariantState={activeVariantState}
        onActiveVariantChange={setActiveVariantState}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        expandedNodes={expandedNodes}
        onExpandedNodesChange={setExpandedNodes}
        processFlowModeNodes={processFlowModeNodes}
        onProcessFlowModeNodesChange={setProcessFlowModeNodes}
        getRunningNumber={() => undefined}
        rootFocusId={rootFocusId || undefined}
        swimlaneLayout={{
          lanes: swimlane.lanes,
          stages: swimlane.stages,
          nodeToLaneId,
          nodeToStage,
          showInsertTargetUI: false,
        }}
      />
    </div>
  );
}

function parseSystemFlowTemplate(rendered: string): { version: 1; name: string; state: SystemFlowState } {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-systemflow[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid system flow template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported system flow template version.');
  const name = typeof parsed.name === 'string' ? parsed.name : 'System Flow';
  const state = parsed.state as SystemFlowState;
  if (!state || typeof state !== 'object') throw new Error('Invalid system flow state.');
  return { version: 1, name, state };
}

function SystemFlowPreview({ rendered }: { rendered: string }) {
  const tpl = useMemo(() => parseSystemFlowTemplate(rendered), [rendered]);
  const sfid = 'systemflow-preview';
  const doc = usePreviewYDoc(`${tpl.name} #systemflow# <!-- sfid:${sfid} -->\n\n---\n`);
  useEffect(() => {
    try {
      saveSystemFlowStateToDoc(doc, sfid, tpl.state);
    } catch {
      // ignore
    }
  }, [doc, sfid, tpl.state]);

  // Force state access so parsing errors surface as red text instead of blank UI.
  try {
    loadSystemFlowStateFromDoc(doc, sfid);
  } catch {
    return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;
  }

  return (
    <div className="mac-window mac-double-outline overflow-hidden bg-white" style={{ height: 640 }}>
      <div className="h-full">
        <SystemFlowEditor doc={doc} sfid={sfid} activeTool={'select' as any} showComments={false} showAnnotations={false} />
      </div>
    </div>
  );
}

function TemplatePreview({ header, rendered }: { header: NexusTemplateHeader; rendered: string }) {
  if (header.targetKind === 'note') {
    return (
      <div className="prose prose-sm max-w-none">
        {rendered.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{rendered}</ReactMarkdown>
        ) : (
          <div className="text-xs text-red-700">Rendered output is empty (template payload may not have been saved).</div>
        )}
      </div>
    );
  }

  if (header.targetKind === 'grid') {
    return <GridPreview rendered={rendered} mode={header.mode} fragmentKind={header.fragmentKind} />;
  }

  if (header.targetKind === 'diagram') {
    if (header.mode === 'appendFragment' && header.fragmentKind === 'systemFlow') return <SystemFlowPreview rendered={rendered} />;
    if (header.mode === 'appendFragment' && header.fragmentKind === 'flowTab') return <FlowTabPreview rendered={rendered} />;
    return <DiagramPreview markdown={rendered} />;
  }

  if (header.targetKind === 'vision' && header.mode === 'appendFragment' && header.fragmentKind === 'visionCard') {
    return <VisionCardPreview rendered={rendered} />;
  }

  return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;
}

export function TemplateEditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, supabase, user, session } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  const activeRoomName = activeFile?.roomName || 'template-demo';

  const { doc: yDoc, provider, status, connectedRoomName, synced } = useYjs(activeRoomName);

  // Local view state
  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');
  const [markdown, setMarkdown] = useState<string>('');
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  // Keep textarea in sync with the Yjs text (one source of truth).
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

  const updateMarkdown = useCallback(
    (next: string) => {
      if (!yDoc) return;
      const yText = yDoc.getText('nexus');
      if (yText.toString() === next) return;
      yDoc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    },
    [yDoc],
  );

  // Persist yText to local snapshot, and to Supabase `files.content` in remote mode.
  useYjsNexusTextPersistence({
    doc: yDoc,
    provider,
    activeRoomName,
    connectedRoomName,
    synced,
    fileId: activeFile?.id || null,
    initialContent: activeFile?.initialContent,
    makeStarterMarkdown: makeStarterTemplateMarkdown,
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
        if (!fileRow.room_name) {
          // best-effort
          supabase.from('files').update({ room_name: roomName }).eq('id', fileRow.id).then(() => {});
        }
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

  // Template parsing
  const { header, payload } = useMemo(() => {
    const { header, rest } = readTemplateHeader(markdown || '');
    return { header: header || null, payload: rest || '' };
  }, [markdown]);

  const effectiveVars = useMemo(() => {
    return computeEffectiveTemplateVars(header, payload);
  }, [header, payload]);

  // Initialize varValues from header.vars defaults when header changes.
  const lastHeaderKeyRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(effectiveVars);
    if (key === lastHeaderKeyRef.current) return;
    lastHeaderKeyRef.current = key;
    setVarValues(buildTemplateVarDefaults(effectiveVars));
  }, [effectiveVars]);

  const rendered = useMemo(() => renderTemplatePayload(payload, varValues), [payload, varValues]);

  const previewBranch = useMemo(() => {
    if (!header) return 'fallback:no-header';
    if (header.targetKind === 'note') return 'note:ReactMarkdown';
    if (header.targetKind === 'grid') return `grid:${header.mode}:${header.fragmentKind || ''}`;
    if (header.targetKind === 'diagram') {
      if (header.mode === 'appendFragment' && header.fragmentKind === 'systemFlow') return 'diagram:systemFlow:SystemFlowEditor';
      if (header.mode === 'appendFragment' && header.fragmentKind === 'flowTab') return 'diagram:flowTab:swimlane';
      return 'diagram:canvas:NexusCanvas';
    }
    if (header.targetKind === 'vision' && header.mode === 'appendFragment' && header.fragmentKind === 'visionCard') return 'vision:visionCard';
    return `fallback:unknown:${String((header as any).targetKind || '')}`;
  }, [header]);

  const publishName = useMemo(() => String(header?.name || activeFile?.name || 'Template'), [activeFile?.name, header?.name]);
  const hasHeader = !!header;

  const publisher = useGlobalTemplatePublisher({
    configured,
    ready,
    supabase,
    sessionUserId: session?.user?.id ?? null,
    activeFileId: activeFile?.id,
    hasHeader,
  });

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <EditorMenubar
        status={status}
        activeFileName={activeFile?.name || 'Template'}
        onWorkspace={() => router.push('/workspace')}
        rightContent={
          <div className="flex items-center gap-2">
            <TemplateGlobalPublishControls
              publisher={publisher}
              hasHeader={hasHeader}
              publishName={publishName}
              publishContent={String(markdown || '')}
            />
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
                title="Edit template markdown"
              >
                Markdown
              </button>
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden flex">
        <aside className="w-[320px] shrink-0 border-r border-slate-200 bg-white/70 overflow-auto">
          <div className="p-3 space-y-3">
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold">Template</div>
              {header ? (
                <div className="mt-2 text-[11px] opacity-80 space-y-1">
                  <div>
                    name: <span className="font-mono">{header.name}</span>
                  </div>
                  <div>
                    targetKind: <span className="font-mono">{header.targetKind}</span>
                  </div>
                  <div>
                    mode: <span className="font-mono">{header.mode}</span>
                    {header.mode === 'appendFragment' ? (
                      <>
                        {' '}
                        · fragmentKind: <span className="font-mono">{header.fragmentKind}</span>
                      </>
                    ) : null}
                  </div>
                  {header.description ? <div className="text-xs opacity-80 mt-2">{header.description}</div> : null}
                </div>
              ) : (
                <div className="mt-2 text-xs text-red-700">Missing or invalid `nexus-template` header block.</div>
              )}
            </div>

            <div className="rounded border border-slate-200 bg-white p-3 space-y-2">
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
                          onChange={(e) => setVarValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                          placeholder={v.default ?? ''}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="text-[11px] text-slate-500">
                Placeholders: <span className="font-mono">{'{{name}}'}</span> and <span className="font-mono">--var-[name]</span>.
              </div>
            </div>

            <TemplateGlobalPublishPanel lastPublish={publisher.lastPublish} />
          </div>
        </aside>

        <div className="flex-1 overflow-hidden bg-white">
          {tab === 'preview' ? (
            <div className="h-full overflow-auto p-4">
              <div className="text-[11px] font-semibold text-slate-700 mb-2">Rendered output preview</div>
              <TemplateRenderedPreview header={header} rendered={rendered} heightPx={640} />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="px-4 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">Template markdown</div>
              <textarea
                className="flex-1 w-full outline-none font-mono text-[12px] leading-snug bg-white text-slate-900 p-4"
                value={markdown}
                onChange={(e) => updateMarkdown(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

