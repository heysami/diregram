'use client';

import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { NexusCanvas } from '@/components/NexusCanvas';
import { useParsedNexusDoc } from '@/components/note/embeds/useParsedNexusDoc';

export function ProcessFlowEmbedPreview({
  doc,
  rootProcessNodeId,
  title = 'Process flow',
  heightPx = 420,
}: {
  doc: Y.Doc;
  rootProcessNodeId: string;
  title?: string;
  heightPx?: number;
}) {
  const { processFlowModeNodes, getProcessRunningNumber } = useParsedNexusDoc(doc);
  const rootId = String(rootProcessNodeId || '').trim();

  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  const forced = useMemo(() => {
    const next = new Set(processFlowModeNodes);
    if (rootId) next.add(rootId);
    return next;
  }, [processFlowModeNodes, rootId]);

  if (!rootId) {
    return (
      <div className="my-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Process flow embed is not configured (missing root process node id).
      </div>
    );
  }

  return (
    <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">
        {title} <span className="font-mono opacity-70">{rootId}</span>
      </div>
      <div className="relative" style={{ height: heightPx }}>
        <div className="absolute inset-0 pointer-events-none">
          <NexusCanvas
            doc={doc}
            activeTool="select"
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
            processFlowModeNodes={forced}
            getRunningNumber={() => undefined}
            getProcessRunningNumber={getProcessRunningNumber}
            rootFocusId={rootId}
            hideShowFlowToggle
          />
        </div>
      </div>
    </div>
  );
}

