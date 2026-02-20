'use client';

import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { NexusCanvas } from '@/components/NexusCanvas';
import { loadFlowTabSwimlane, buildDefaultFlowTabSwimlane } from '@/lib/flowtab-swimlane-storage';
import { useParsedNexusDoc } from '@/components/note/embeds/useParsedNexusDoc';

export function SwimlaneFlowEmbedPreview({
  doc,
  fid,
  rootId,
  title = 'Swimlane flow',
  heightPx = 420,
}: {
  doc: Y.Doc;
  fid: string;
  rootId: string;
  title?: string;
  heightPx?: number;
}) {
  const { nodeById, processFlowModeNodes, getProcessRunningNumber } = useParsedNexusDoc(doc);
  const swimlane = useMemo(() => {
    const f = String(fid || '').trim();
    if (!f) return null;
    return loadFlowTabSwimlane(doc, f) || buildDefaultFlowTabSwimlane(f);
  }, [doc, fid]);
  const root = useMemo(() => {
    const rid = String(rootId || '').trim();
    return rid ? nodeById.get(rid) : null;
  }, [nodeById, rootId]);

  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  const layout = useMemo(() => {
    if (!swimlane || !root) return null;
    const defaultLaneId = swimlane.lanes[0]?.id || 'branch-1';
    const effectiveLaneId = (nodeId: string) => swimlane.placement?.[nodeId]?.laneId || defaultLaneId;
    const effectiveStageIdx = (nodeId: string) => {
      const raw = swimlane.placement?.[nodeId]?.stage;
      const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
      return n;
    };

    const nodeToLaneId: Record<string, string> = {};
    const nodeToStage: Record<string, number> = {};
    const visited = new Set<string>();
    const walk = (n: any) => {
      if (!n?.id) return;
      if (visited.has(n.id)) return;
      visited.add(n.id);
      nodeToLaneId[n.id] = effectiveLaneId(n.id);
      nodeToStage[n.id] = effectiveStageIdx(n.id);
      (n.children || []).forEach((c: any) => walk(c));
      if (n.isHub && n.variants) (n.variants || []).forEach((v: any) => v?.id && v.id !== n.id && walk(v));
    };
    walk(root);
    return {
      lanes: swimlane.lanes,
      stages: swimlane.stages,
      nodeToLaneId,
      nodeToStage,
    };
  }, [root, swimlane]);

  if (!swimlane || !root || !layout) {
    return (
      <div className="my-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Swimlane flow embed is not configured (missing flow root or swimlane id).
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">
        {title} <span className="font-mono opacity-70">{fid}</span>
      </div>
      <div className="relative" style={{ height: heightPx }}>
        <div className="absolute inset-0 pointer-events-none">
          <NexusCanvas
            doc={doc}
            activeTool="select"
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
            getRunningNumber={() => undefined}
            getProcessRunningNumber={getProcessRunningNumber}
            rootFocusId={rootId}
            hideShowFlowToggle
            swimlaneLayout={{
              lanes: layout.lanes,
              stages: layout.stages,
              nodeToLaneId: layout.nodeToLaneId,
              nodeToStage: layout.nodeToStage,
              showInsertTargetUI: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}

