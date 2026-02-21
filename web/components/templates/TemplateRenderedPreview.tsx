'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { ToolType } from '@/components/Toolbar';
import { NexusCanvas } from '@/components/NexusCanvas';
import { SpreadsheetView } from '@/components/grid/SpreadsheetView';
import { SystemFlowEditor } from '@/components/SystemFlowEditor';
import { NoteMarkdownRenderer } from '@/components/note/NoteMarkdownRenderer';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { loadGridDoc, type GridDoc, type GridSheetV1 } from '@/lib/gridjson';
import { loadSystemFlowStateFromDoc, saveSystemFlowStateToDoc, type SystemFlowState } from '@/lib/system-flow-storage';
import { loadFlowTabSwimlane, saveFlowTabSwimlane, type FlowTabSwimlaneData } from '@/lib/flowtab-swimlane-storage';
import { TldrawTileEditor } from '@/components/vision/tldraw/TldrawTileEditor';
import type { TLEditorSnapshot } from 'tldraw';
import type { NexusTemplateHeader } from '@/lib/nexus-template';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';
import { renderTemplateFlowMetaMarkdown } from '@/lib/template-flow-meta-markdown';
import { buildPreviewDocFromGridTableTemplate, parseGridSheetTemplatePayload, parseGridTableTemplatePayload } from '@/lib/template-grid';

function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
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

function DiagramPreview({
  markdown,
  heightPx,
  flowMeta,
}: {
  markdown: string;
  heightPx: number;
  flowMeta?: NexusTemplateHeader['flowMeta'];
}) {
  const docText = useMemo(() => {
    const base = String(markdown || '').trimEnd() + '\n';
    const meta = renderTemplateFlowMetaMarkdown(flowMeta);
    if (!meta.trim()) return base;
    return base + '\n---\n' + meta + '\n';
  }, [flowMeta, markdown]);

  const doc = usePreviewYDoc(docText);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const [processFlowModeNodes, setProcessFlowModeNodes] = useState<Set<string>>(() => new Set());
  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>(() => ({}));
  const processRunningNumberMapRef = useRef<Map<string, number>>(new Map());
  const getProcessRunningNumber = useCallback((nodeId: string) => processRunningNumberMapRef.current.get(nodeId), []);

  useEffect(() => {
    // Build running-number map and default-enable process-flow mode if metadata exists.
    try {
      const yText = doc.getText('nexus');
      const roots = parseNexusMarkdown(yText.toString());
      const map = buildProcessRunningNumberMap({ doc, roots });
      processRunningNumberMapRef.current = map;

      // Auto-enable root process nodes so preview matches editor defaults.
      const nodeMap = new Map<string, any>();
      const stack: any[] = [...roots];
      while (stack.length) {
        const n = stack.pop()!;
        if (!n?.id) continue;
        if (nodeMap.has(n.id)) continue;
        nodeMap.set(n.id, n);
        (n.children || []).forEach((c: any) => stack.push(c));
        if (n.isHub && n.variants) (n.variants || []).forEach((v: any) => stack.push(v));
      }
      const next = new Set<string>();
      for (const n of nodeMap.values()) {
        if (!n?.isFlowNode) continue;
        const parentId = n.parentId || null;
        const parent = parentId ? nodeMap.get(parentId) : null;
        const isRootProcessNode = !parent || !parent.isFlowNode;
        if (!isRootProcessNode) continue;
        if (map.has(n.id)) next.add(n.id);
      }
      if (next.size) setProcessFlowModeNodes(next);
    } catch {
      // ignore
    }
    // Only recompute when the base docText changes.
  }, [doc, docText]);

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white overflow-hidden"
      style={{ height: heightPx }}
    >
      <div className="h-full">
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
          getProcessRunningNumber={getProcessRunningNumber}
        />
      </div>
    </div>
  );
}

function GridPreview({
  rendered,
  mode,
  fragmentKind,
  heightPx,
}: {
  rendered: string;
  mode: NexusTemplateHeader['mode'];
  fragmentKind?: string;
  heightPx: number;
}) {
  const parsed = useMemo(() => {
    try {
      if (mode === 'appendFragment' && fragmentKind === 'gridSheet') {
        const tpl = parseGridSheetTemplatePayload(rendered);
        const sheetId = String((tpl.sheet as any)?.id || 'sheet-1');
        const sheet: GridSheetV1 = { ...(tpl.sheet as any), id: sheetId };
        const doc: GridDoc = { version: 1, activeSheetId: sheetId, sheets: [sheet] } as any;
        return { doc, source: 'template:gridSheet' as const };
      }
      if (mode === 'appendFragment' && fragmentKind === 'gridTable') {
        const tpl = parseGridTableTemplatePayload(rendered);
        const doc = buildPreviewDocFromGridTableTemplate(tpl);
        return { doc, source: 'template:gridTable' as const };
      }
      const res = loadGridDoc(rendered);
      return { doc: res.doc, source: `loadGridDoc:${res.source}` as const };
    } catch (e) {
      const doc = loadGridDoc('').doc;
      return { doc, source: `error:${e instanceof Error ? e.message : 'unknown'}` as const };
    }
  }, [fragmentKind, mode, rendered]);

  const [doc, setDoc] = useState<GridDoc>(parsed.doc);
  useEffect(() => setDoc(parsed.doc), [parsed.doc]);

  const activeSheet = useMemo<GridSheetV1 | null>(() => {
    const sheets = doc.sheets || [];
    return sheets.find((s) => s.id === doc.activeSheetId) || sheets[0] || null;
  }, [doc]);

  if (!activeSheet) return <div className="text-xs opacity-70">No sheets to preview.</div>;

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ height: heightPx }}>
      <div className="relative h-full">
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
          showStickyBars={false}
        />
      </div>
    </div>
  );
}

function parseVisionCardTemplate(rendered: string): { version: 1; props: { w?: number; h?: number; thumb?: string; tileSnapshot?: string } } {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-vision-card[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid vision card template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported vision card template version.');
  if (!parsed.props || typeof parsed.props !== 'object') throw new Error('Invalid vision card template payload.');
  return parsed as any;
}

function VisionCardPreview({ rendered, heightPx }: { rendered: string; heightPx: number }) {
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

  const maxH = Math.max(220, heightPx);
  const scale = Math.min(1, maxH / h);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ height: heightPx }}>
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div style={{ width: w * scale, height: h * scale }} className="rounded-lg overflow-hidden border border-black/10 bg-white">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="Vision card thumbnail" className="w-full h-full object-cover" />
          ) : tileSnapshot ? (
            <div className="w-full h-full pointer-events-none">
              <TldrawTileEditor
                initialSnapshot={tileSnapshot}
                sessionStorageKey={`template:visioncard:preview:${w}:${h}`}
                thumbOutPx={256}
                onChange={() => {}}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs opacity-70 bg-black/5">No thumbnail saved</div>
          )}
        </div>
      </div>
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

function FlowTabPreview({
  rendered,
  heightPx,
  flowMeta,
}: {
  rendered: string;
  heightPx: number;
  flowMeta?: NexusTemplateHeader['flowMeta'];
}) {
  const tpl = useMemo(() => parseFlowTabTemplate(rendered), [rendered]);
  const fid = 'flow-preview';
  const block = useMemo(() => injectFidIntoRootMarkdown(tpl.rootMarkdown, fid), [tpl.rootMarkdown]);
  const baseMarkdown = useMemo(() => {
    const base = block ? `${block}\n---\n` : `Flow preview <!-- fid:${fid} -->\n\n---\n`;
    const meta = renderTemplateFlowMetaMarkdown(flowMeta);
    if (!meta.trim()) return base;
    return base + meta + '\n';
  }, [block, flowMeta, fid]);

  const doc = usePreviewYDoc(baseMarkdown);
  const [docText, setDocText] = useState<string>('');
  useEffect(() => {
    const yText = doc.getText('nexus');
    const sync = () => setDocText(yText.toString());
    sync();
    yText.observe(sync);
    return () => {
      try {
        yText.unobserve(sync);
      } catch {
        // ignore
      }
    };
  }, [doc]);
  const yLen = docText.length;

  const parsedRoots = useMemo(() => parseNexusMarkdown(docText), [docText]);
  const parsedRoot = useMemo(() => parsedRoots.find((n) => (n.metadata as any)?.fid === fid) || null, [parsedRoots, fid]);
  const rootFocusId = parsedRoot?.id || null;

  const swimlane = useMemo(() => {
    const rootLineIndex = parsedRoot?.lineIndex ?? null;
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
  }, [fid, parsedRoot, tpl.swimlane.lanes, tpl.swimlane.pinnedTagIds, tpl.swimlane.placementByOffset, tpl.swimlane.stages]);

  useEffect(() => {
    if (!swimlane) return;
    try {
      saveFlowTabSwimlane(doc, swimlane);
    } catch {
      // ignore
    }
  }, [doc, swimlane]);

  const stableSwimlane = useMemo(() => (swimlane ? loadFlowTabSwimlane(doc, fid) || swimlane : null), [doc, fid, swimlane]);

  const nodeToLaneId = useMemo(() => {
    const out: Record<string, string> = {};
    if (!stableSwimlane) return out;
    if (!parsedRoot) return out;
    const defaultLaneId = stableSwimlane.lanes[0]?.id || 'branch-1';
    const walk = (n: any) => {
      const laneId = stableSwimlane.placement?.[n.id]?.laneId;
      out[n.id] = laneId && stableSwimlane.lanes.some((l) => l.id === laneId) ? laneId : defaultLaneId;
      (n.children || []).forEach(walk);
      if (n.isHub && n.variants) (n.variants || []).forEach(walk);
    };
    walk(parsedRoot);
    return out;
  }, [parsedRoot, stableSwimlane]);

  const nodeToStage = useMemo(() => {
    const out: Record<string, number> = {};
    if (!stableSwimlane) return out;
    if (!parsedRoot) return out;
    const walk = (n: any) => {
      const raw = stableSwimlane.placement?.[n.id]?.stage;
      out[n.id] = Number.isFinite(raw) ? Math.max(0, raw as number) : 0;
      (n.children || []).forEach(walk);
      if (n.isHub && n.variants) (n.variants || []).forEach(walk);
    };
    walk(parsedRoot);
    return out;
  }, [parsedRoot, stableSwimlane]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());
  const [processFlowModeNodes, setProcessFlowModeNodes] = useState<Set<string>>(() => new Set());
  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>(() => ({}));
  const processRunningNumberMapRef = useRef<Map<string, number>>(new Map());
  const getProcessRunningNumber = useCallback((nodeId: string) => processRunningNumberMapRef.current.get(nodeId), []);

  useEffect(() => {
    try {
      const roots = parseNexusMarkdown(docText);
      const map = buildProcessRunningNumberMap({ doc, roots });
      processRunningNumberMapRef.current = map;
      if (rootFocusId && map.has(rootFocusId)) {
        setProcessFlowModeNodes((prev) => {
          const next = new Set(prev || []);
          next.add(rootFocusId);
          return next;
        });
      }
    } catch {
      // ignore
    }
  }, [doc, docText, rootFocusId]);

  if (!stableSwimlane) return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white overflow-hidden"
      style={{ height: heightPx }}
    >
      <div className="h-full">
        <NexusCanvas
          doc={doc}
          activeTool={'select' as ToolType}
          layoutDirection="horizontal"
          mainLevel={1}
          pinnedTagIds={stableSwimlane.pinnedTagIds || []}
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
          getProcessRunningNumber={getProcessRunningNumber}
          rootFocusId={rootFocusId || undefined}
          swimlaneLayout={{
            lanes: stableSwimlane.lanes,
            stages: stableSwimlane.stages,
            nodeToLaneId,
            nodeToStage,
            showInsertTargetUI: false,
          }}
        />
      </div>
    </div>
  );
}

function parseSystemFlowTemplate(rendered: string): { version: 1; name: string; state: SystemFlowState } {
  const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
  const m = src.match(/```nexus-systemflow[ \t]*\n([\s\S]*?)\n```/);
  const body = (m ? m[1] : src).trim();
  const parsed = safeJsonParse<any>(body);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid tech flow template payload.');
  if (parsed.version !== 1) throw new Error('Unsupported tech flow template version.');
  const name = typeof parsed.name === 'string' ? parsed.name : 'Tech Flow';
  const state = parsed.state as SystemFlowState;
  if (!state || typeof state !== 'object') throw new Error('Invalid tech flow state.');
  return { version: 1, name, state };
}

function SystemFlowPreview({ rendered, heightPx }: { rendered: string; heightPx: number }) {
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

  try {
    loadSystemFlowStateFromDoc(doc, sfid);
  } catch {
    return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ height: heightPx }}>
      <div className="h-full">
        <SystemFlowEditor doc={doc} sfid={sfid} activeTool={'select' as any} showComments={false} showAnnotations={false} />
      </div>
    </div>
  );
}

export function TemplateRenderedPreview({
  header,
  rendered,
  heightPx = 420,
}: {
  header: NexusTemplateHeader | null;
  rendered: string;
  heightPx?: number;
}) {
  const emptyHostDoc = usePreviewYDoc(''); // used when embeds omit fileId

  const branch = useMemo(() => {
    if (!header) return 'fallback:no-header';
    if (header.targetKind === 'note') return 'note:NoteMarkdownRenderer';
    if (header.targetKind === 'grid') return `grid:${header.mode}:${header.fragmentKind || ''}`;
    if (header.targetKind === 'diagram') {
      if (header.mode === 'appendFragment' && header.fragmentKind === 'systemFlow') return 'diagram:systemFlow:SystemFlowEditor';
      if (header.mode === 'appendFragment' && header.fragmentKind === 'flowTab') return 'diagram:flowTab:swimlane';
      return 'diagram:canvas:NexusCanvas';
    }
    if (header.targetKind === 'vision' && header.mode === 'appendFragment' && header.fragmentKind === 'visionCard') return 'vision:visionCard';
    return `fallback:unknown:${String((header as any).targetKind || '')}`;
  }, [header]);

  if (!header) return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;

  if (header.targetKind === 'note') {
    if (!rendered.trim()) return <div className="text-xs text-red-700">Rendered output is empty.</div>;
    return <NoteMarkdownRenderer hostDoc={emptyHostDoc as any} markdown={rendered} headingIds={[]} />;
  }

  if (header.targetKind === 'grid') {
    return <GridPreview rendered={rendered} mode={header.mode} fragmentKind={header.fragmentKind} heightPx={heightPx} />;
  }

  if (header.targetKind === 'diagram') {
    if (header.mode === 'appendFragment' && header.fragmentKind === 'systemFlow') return <SystemFlowPreview rendered={rendered} heightPx={heightPx} />;
    if (header.mode === 'appendFragment' && header.fragmentKind === 'flowTab') return <FlowTabPreview rendered={rendered} heightPx={heightPx} flowMeta={header.flowMeta} />;
    return <DiagramPreview markdown={rendered} heightPx={heightPx} flowMeta={header.flowMeta} />;
  }

  if (header.targetKind === 'vision' && header.mode === 'appendFragment' && header.fragmentKind === 'visionCard') {
    return <VisionCardPreview rendered={rendered} heightPx={heightPx} />;
  }

  return <pre className="text-[12px] whitespace-pre-wrap leading-snug">{rendered}</pre>;
}

