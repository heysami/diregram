import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Pencil, Plus, X } from 'lucide-react';
import type { ToolType } from '@/components/Toolbar';
import { NexusCanvas } from '@/components/NexusCanvas';
import type { PresenceController } from '@/lib/presence';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';
import {
  buildDefaultFlowTabSwimlane,
  loadFlowTabSwimlane,
  saveFlowTabSwimlane,
  type FlowTabSwimlaneData,
} from '@/lib/flowtab-swimlane-storage';
import { loadConnectorLabels, saveConnectorLabels } from '@/lib/process-connector-labels';
import { parseDimensionDescriptions } from '@/lib/dimension-descriptions';
import { parseDataObjectAttributeDescriptions } from '@/lib/data-object-attribute-descriptions';
import { NodeTagsEditor } from '@/components/tagging/NodeTagsEditor';
import { useTagStore } from '@/hooks/use-tag-store';
import {
  loadFlowTabProcessReferences,
  saveFlowTabProcessReferences,
  type FlowTabProcessReference,
} from '@/lib/flowtab-process-references';
import { loadExpandedGridNodesFromDoc, saveExpandedGridNodesToDoc, type ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import {
  loadExpandedStates,
  saveExpandedStates,
  buildExpandedNodeParentPath,
  extractExpandedIdsFromMarkdown,
} from '@/lib/expanded-state-storage';
import { extractRunningNumbersFromMarkdown } from '@/lib/expanded-state-matcher';
import type { LayoutDirection } from '@/lib/layout-direction';

type Props = {
  doc: Y.Doc;
  // Pass-through state from Home so Flow tab uses the exact same process-node engine.
  activeTool: ToolType;
  onToolUse: () => void;
  layoutDirection?: LayoutDirection;
  mainLevel: number;
  tagView: { activeGroupId: string; visibleTagIds: string[]; highlightedTagIds: string[] };
  pinnedTagIds: string[];
  onSelectedFlowChange?: (fid: string | null) => void;
  onSelectedFlowPinnedTagIdsChange?: (tagIds: string[]) => void;
  showComments?: boolean;
  showAnnotations?: boolean;
  activeVariantState: Record<string, Record<string, string>>;
  onActiveVariantChange: (state: Record<string, Record<string, string>> | ((prev: Record<string, Record<string, string>>) => Record<string, Record<string, string>>)) => void;
  /** When incremented, the underlying canvas should re-center/fit to content (useful after full markdown import). */
  viewportResetTick?: number;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  selectedNodeIds: string[];
  onSelectNodeIds: (ids: string[]) => void;
  expandedNodes: Set<string>;
  onExpandedNodesChange: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  processFlowModeNodes: Set<string>;
  onProcessFlowModeNodesChange: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  getRunningNumber: (nodeId: string) => number | undefined;
  getProcessRunningNumber: (nodeId: string) => number | undefined;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  presence?: PresenceController | null;
};

export function FlowsCanvas({
  doc,
  activeTool,
  onToolUse,
  layoutDirection = 'horizontal',
  mainLevel,
  tagView,
  pinnedTagIds,
  onSelectedFlowChange,
  onSelectedFlowPinnedTagIdsChange,
  showComments,
  showAnnotations,
  activeVariantState,
  onActiveVariantChange,
  viewportResetTick,
  selectedNodeId,
  onSelectNode,
  selectedNodeIds,
  onSelectNodeIds,
  expandedNodes,
  onExpandedNodesChange,
  processFlowModeNodes,
  onProcessFlowModeNodesChange,
  getRunningNumber,
  getProcessRunningNumber,
  onOpenComments,
  presence,
}: Props) {
  const viewBarSpacer = <div className="h-12" aria-hidden />;

  const [flowRoots, setFlowRoots] = useState<NexusNode[]>([]);
  const [selectedFid, setSelectedFid] = useState<string | null>(null);
  const [swimlane, setSwimlane] = useState<FlowTabSwimlaneData | null>(null);
  const [nextLaneId, setNextLaneId] = useState<string>('branch-1');
  const [nextStage, setNextStage] = useState<number>(0);
  const [showInsertTargetUI, setShowInsertTargetUI] = useState<boolean>(false);
  const [canvasFocusTick, setCanvasFocusTick] = useState(0);

  const [flowRefs, setFlowRefs] = useState<Record<string, FlowTabProcessReference>>({});
  const [isRefOpen, setIsRefOpen] = useState(false);
  const [refPickRootId, setRefPickRootId] = useState<string | null>(null);
  const [refPickNodeId, setRefPickNodeId] = useState<string | null>(null);
  const [refKind, setRefKind] = useState<'whole' | 'inner'>('whole');
  const [pendingInnerAssign, setPendingInnerAssign] = useState<{
    flowNodeId: string;
    targetNodeId: string;
    rootProcessNodeId: string;
  } | null>(null);

  const [isRenamingFlow, setIsRenamingFlow] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const [rightPreview, setRightPreview] = useState<
    | { kind: 'swimlane'; fid: string }
    | { kind: 'process'; rootNodeId: string }
    | { kind: 'descFlow'; key: string; title: string; bodyLines: string[] }
  >({ kind: 'swimlane', fid: '' });
  const [descFlowDoc, setDescFlowDoc] = useState<Y.Doc | null>(null);
  const [descFlowRootId, setDescFlowRootId] = useState<string | null>(null);
  const [descFlowSelectedNodeId, setDescFlowSelectedNodeId] = useState<string | null>(null);
  const [descFlowExpandedNodes, setDescFlowExpandedNodes] = useState<Set<string>>(() => new Set());
  const [descFlowProcessFlowModeNodes, setDescFlowProcessFlowModeNodes] = useState<Set<string>>(
    () => new Set(),
  );
  const [descFlowFocusTick, setDescFlowFocusTick] = useState(0);

  const tagStore = useTagStore(doc);
  const tagNameById = useMemo(() => new Map(tagStore.tags.map((t) => [t.id, t.name])), [tagStore.tags]);

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const parsed = parseNexusMarkdown(yText.toString());
      const flows: NexusNode[] = [];
      const visited = new Set<string>();
      const visit = (n: NexusNode) => {
        if (!n || !n.id) return;
        if (visited.has(n.id)) return;
        visited.add(n.id);

        if ((n.metadata as any)?.flowTab) flows.push(n);

        // Traverse standard children
        n.children.forEach(visit);

        // Traverse variants (some parsers keep variants outside children)
        if (n.isHub && n.variants) {
          n.variants.forEach((v) => {
            visit(v);
            // Defensive: variants often store their subtree in children.
            v.children?.forEach?.(visit);
          });
        }
      };
      parsed.forEach(visit);
      setFlowRoots(flows);
      setFlowRefs(loadFlowTabProcessReferences(doc));
      if (!selectedFid && flows.length) {
        const fid = (flows[0].metadata as any)?.fid || flows[0].id;
        setSelectedFid(fid);
        setRightPreview({ kind: 'swimlane', fid });
      }
      if (selectedFid) {
        const loaded = loadFlowTabSwimlane(doc, selectedFid);
        const base = loaded || buildDefaultFlowTabSwimlane(selectedFid);
        const normalized: FlowTabSwimlaneData = {
          ...base,
          lanes: base.lanes?.length ? base.lanes : [{ id: 'branch-1', label: 'Lane 1' }],
          stages: base.stages?.length ? base.stages : [{ id: 'stage-1', label: 'Stage 1' }],
          placement: base.placement || {},
          pinnedTagIds: Array.isArray(base.pinnedTagIds) ? base.pinnedTagIds : [],
        };
        setSwimlane(normalized);
      }
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, selectedFid]);

  useEffect(() => {
    onSelectedFlowChange?.(selectedFid);
  }, [selectedFid, onSelectedFlowChange]);

  useEffect(() => {
    if (!selectedFid) {
      onSelectedFlowPinnedTagIdsChange?.([]);
      return;
    }
    onSelectedFlowPinnedTagIdsChange?.(Array.isArray(swimlane?.pinnedTagIds) ? (swimlane!.pinnedTagIds as string[]) : []);
  }, [selectedFid, swimlane, onSelectedFlowPinnedTagIdsChange]);

  const selectedRoot = useMemo(() => {
    if (!selectedFid) return null;
    return (
      flowRoots.find((r) => ((r.metadata as any)?.fid || r.id) === selectedFid) || null
    );
  }, [flowRoots, selectedFid]);

  // Keep right-side preview aligned with swimlane selection unless user explicitly picked a different preview.
  useEffect(() => {
    if (!selectedFid) return;
    setRightPreview((prev) => {
      if (prev.kind === 'swimlane' && prev.fid !== selectedFid) return { kind: 'swimlane', fid: selectedFid };
      if (prev.kind === 'swimlane' && !prev.fid) return { kind: 'swimlane', fid: selectedFid };
      return prev;
    });
  }, [selectedFid]);

  const commitRenameSelectedFlow = useCallback(
    (nextNameRaw: string) => {
      if (!selectedFid) return;
      const nextName = nextNameRaw.trim();
      if (!nextName) return;
      const yText = doc.getText('nexus');
      const current = yText.toString();
      const lines = current.split('\n');
      const fidToken = `<!-- fid:${selectedFid} -->`;
      let idx = lines.findIndex((l) => l.includes(fidToken));
      if (idx === -1 && selectedRoot) idx = selectedRoot.lineIndex;
      if (idx < 0 || idx >= lines.length) return;

      const line = lines[idx];
      const indent = (line.match(/^(\s*)/)?.[1] || '');
      const afterIndent = line.slice(indent.length);
      const a = afterIndent.indexOf(' #');
      const b = afterIndent.indexOf(' <!--');
      const cut = Math.min(...[a, b].filter((n) => n >= 0).concat([afterIndent.length]));
      const suffix = afterIndent.slice(cut);
      const nextLine = `${indent}${nextName}${suffix}`;
      if (nextLine === line) return;

      doc.transact(() => {
        lines[idx] = nextLine;
        yText.delete(0, yText.length);
        yText.insert(0, lines.join('\n'));
      });
    },
    [doc, selectedFid, selectedRoot],
  );

  // Ensure process-flow mode is ON for the selected flow root (so it matches main canvas process node flow).
  useEffect(() => {
    if (!selectedRoot) return;
    onProcessFlowModeNodesChange((prev) => {
      const next = new Set(prev);
      next.add(selectedRoot.id);
      return next;
    });
  }, [selectedRoot, onProcessFlowModeNodesChange]);

  const rootFocusId = selectedRoot?.id || undefined;

  const nextFlowFid = () => {
    let max = 0;
    flowRoots.forEach((r) => {
      const fid = (r.metadata as any)?.fid;
      const m = typeof fid === 'string' ? fid.match(/^flowtab-(\d+)$/) : null;
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `flowtab-${max + 1}`;
  };

  const createNewFlow = () => {
    const fid = nextFlowFid();
    const name = `Flow ${fid.split('-')[1]}`;
    const yText = doc.getText('nexus');
    const text = yText.toString();
    const sep = text.indexOf('\n---\n');
    const insertAt = sep !== -1 ? sep : text.length;
    const prefix = insertAt > 0 && !text.slice(0, insertAt).endsWith('\n') ? '\n' : '';
    const block =
      `${name} #flow# #flowtab# <!-- fid:${fid} -->\n` +
      `  Step 1 #flow#\n`;
    doc.transact(() => {
      yText.insert(insertAt, prefix + block);
    });
    setSelectedFid(fid);
    setRightPreview({ kind: 'swimlane', fid });
    const defaultSwimlane = buildDefaultFlowTabSwimlane(fid);
    saveFlowTabSwimlane(doc, defaultSwimlane);
    setSwimlane(defaultSwimlane);
  };

  const nodeMap = useMemo(() => {
    const map = new Map<string, NexusNode>();
    const visited = new Set<string>();
    const walk = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      map.set(n.id, n);
      n.children.forEach(walk);
      if (n.isHub && n.variants) n.variants.forEach(walk);
    };
    if (selectedRoot) walk(selectedRoot);
    return map;
  }, [selectedRoot]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;
  const selectedNodeRef = selectedNode ? flowRefs[selectedNode.id] : null;
  const referencedNodeIds = useMemo(() => new Set(Object.keys(flowRefs)), [flowRefs]);
  const defaultLaneId = swimlane?.lanes?.[0]?.id || 'branch-1';

  const effectiveLaneId = useCallback(
    (node: NexusNode): string => {
      const laneId = swimlane?.placement?.[node.id]?.laneId;
      return laneId && swimlane?.lanes?.some((l) => l.id === laneId) ? laneId : defaultLaneId;
    },
    [swimlane, defaultLaneId],
  );
  const effectiveStageIdx = useCallback(
    (node: NexusNode): number => {
      const raw = swimlane?.placement?.[node.id]?.stage;
      // Important: stage is an explicit column selection, not derived from tree depth.
      // If not explicitly assigned, default to Stage 0.
      if (Number.isFinite(raw)) return Math.max(0, raw as number);
      return 0;
    },
    [swimlane],
  );

  const nodeToLaneId = useMemo(() => {
    const out: Record<string, string> = {};
    if (!selectedRoot || !swimlane) return out;
    const visited = new Set<string>();
    const walk = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      out[n.id] = effectiveLaneId(n);
      n.children.forEach(walk);
      if (n.isHub && n.variants) n.variants.forEach(walk);
    };
    walk(selectedRoot);
    return out;
  }, [selectedRoot, swimlane, effectiveLaneId]);

  const nodeToStage = useMemo(() => {
    const out: Record<string, number> = {};
    if (!selectedRoot || !swimlane) return out;
    const visited = new Set<string>();
    const walk = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      out[n.id] = effectiveStageIdx(n);
      n.children.forEach(walk);
      if (n.isHub && n.variants) n.variants.forEach(walk);
    };
    walk(selectedRoot);
    return out;
  }, [selectedRoot, swimlane, effectiveStageIdx]);

  const swimlaneLayoutSpec = useMemo(() => {
    if (!swimlane) return undefined;
    return {
      lanes: swimlane.lanes,
      stages: swimlane.stages,
      nodeToLaneId,
      nodeToStage,
      insertTarget: { laneId: nextLaneId, stage: nextStage },
      showInsertTargetUI,
    };
  }, [swimlane, nodeToLaneId, nodeToStage, nextLaneId, nextStage, showInsertTargetUI]);

  const allFlowNodes = useMemo(() => {
    if (!selectedRoot) return [] as NexusNode[];
    const out: NexusNode[] = [];
    const visited = new Set<string>();
    const walk = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      out.push(n);
      n.children.forEach(walk);
      if (n.isHub && n.variants) n.variants.forEach(walk);
    };
    walk(selectedRoot);
    return out;
  }, [selectedRoot]);

  const usedLaneIds = useMemo(() => {
    if (!swimlane) return new Set<string>();
    const set = new Set<string>();
    allFlowNodes.forEach((n) => set.add(effectiveLaneId(n)));
    return set;
  }, [allFlowNodes, swimlane, effectiveLaneId]);

  const usedStageIdxs = useMemo(() => {
    if (!swimlane) return new Set<number>();
    const set = new Set<number>();
    allFlowNodes.forEach((n) => set.add(effectiveStageIdx(n)));
    return set;
  }, [allFlowNodes, swimlane, effectiveStageIdx]);

  const canDeleteLaneIds = useMemo(() => {
    if (!swimlane) return new Set<string>();
    const set = new Set<string>();
    swimlane.lanes.forEach((l) => {
      if (swimlane.lanes.length <= 1) return;
      if (usedLaneIds.has(l.id)) return;
      set.add(l.id);
    });
    return set;
  }, [swimlane, usedLaneIds]);

  const canDeleteStageIdxs = useMemo(() => {
    if (!swimlane) return new Set<number>();
    const set = new Set<number>();
    swimlane.stages.forEach((_, idx) => {
      if (swimlane.stages.length <= 1) return;
      if (usedStageIdxs.has(idx)) return;
      set.add(idx);
    });
    return set;
  }, [swimlane, usedStageIdxs]);

  // Keep "next insertion target" aligned to selection by default (user can change explicitly).
  useEffect(() => {
    if (!swimlane) return;
    if (!selectedNode) return;
    setNextLaneId(effectiveLaneId(selectedNode));
    setNextStage(effectiveStageIdx(selectedNode));
  }, [selectedNodeId]); // intentional: on selection change only

  const updatePlacement = (nodeId: string, patch: Partial<{ laneId: string; stage: number }>) => {
    if (!swimlane) return;
    const prev = swimlane.placement[nodeId] || {
      laneId: defaultLaneId,
      // Important: stage is an explicit column selection. Default to Stage 0 unless explicitly set.
      stage: 0,
    };
    const nextPlacement = {
      ...swimlane.placement,
      [nodeId]: { ...prev, ...patch },
    };
    const next: FlowTabSwimlaneData = { ...swimlane, placement: nextPlacement };
    setSwimlane(next);
    saveFlowTabSwimlane(doc, next);
  };

  const getNodeContentById = useCallback(
    (id: string): string => {
      const found = nodeMap.get(id);
      if (found?.content) return found.content;
      // Fallback: parse latest doc text (nodeMap may lag immediately after creation).
      const yText = doc.getText('nexus');
      const roots = parseNexusMarkdown(yText.toString());
      const root = selectedRoot ? roots.find((r) => r.id === selectedRoot.id) : null;
      const walk = (n: NexusNode): string | null => {
        if (n.id === id) return n.content;
        for (const c of n.children) {
          const got = walk(c);
          if (got) return got;
        }
        if (n.isHub && n.variants) {
          for (const v of n.variants) {
            const got = walk(v);
            if (got) return got;
          }
        }
        return null;
      };
      const got = root ? walk(root) : null;
      return got || 'Next step';
    },
    [doc, nodeMap, selectedRoot],
  );

  const mainMarkdown = doc.getText('nexus').toString();

  const allNonFlowTabRoots = useMemo(() => {
    const roots = parseNexusMarkdown(mainMarkdown);
    return roots.filter((r) => !(r.metadata as any)?.flowTab);
  }, [mainMarkdown]);

  const mainNodeById = useMemo(() => {
    const byId = new Map<string, NexusNode>();
    const visited = new Set<string>();
    const index = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      byId.set(n.id, n);
      n.children.forEach(index);
      if (n.isHub && n.variants) n.variants.forEach(index);
    };
    allNonFlowTabRoots.forEach(index);
    return byId;
  }, [allNonFlowTabRoots]);

  const selectedNodeRefSummary = useMemo(() => {
    if (!selectedNodeRef) return null;
    const rootLabel =
      mainNodeById.get(selectedNodeRef.rootProcessNodeId)?.content ||
      selectedNodeRef.rootProcessNodeId;
    const targetLabel =
      mainNodeById.get(selectedNodeRef.targetNodeId)?.content ||
      selectedNodeRef.targetNodeId;
    if (selectedNodeRef.kind === 'whole') {
      return `Ref: whole → ${rootLabel}`;
    }
    return `Ref: inner → ${targetLabel} (in ${rootLabel})`;
  }, [selectedNodeRef, mainNodeById]);

  const processFlowRoots = useMemo(() => {
    const out: NexusNode[] = [];
    const visitedWalk = new Set<string>();
    const walk = (n: NexusNode) => {
      if (visitedWalk.has(n.id)) return;
      visitedWalk.add(n.id);
      if (n.isFlowNode && (!n.parentId || !(nodeById.get(n.parentId)?.isFlowNode))) {
        out.push(n);
      }
      n.children.forEach(walk);
      if (n.isHub && n.variants) n.variants.forEach(walk);
    };
    const nodeById = new Map<string, NexusNode>();
    const visitedIndex = new Set<string>();
    const index = (n: NexusNode) => {
      if (visitedIndex.has(n.id)) return;
      visitedIndex.add(n.id);
      nodeById.set(n.id, n);
      n.children.forEach(index);
      if (n.isHub && n.variants) n.variants.forEach(index);
    };
    allNonFlowTabRoots.forEach(index);
    allNonFlowTabRoots.forEach(walk);
    // Deduplicate while preserving order
    const seen = new Set<string>();
    return out.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  }, [allNonFlowTabRoots]);

  // Left panel read-only indexes (main-canvas only; these sections are view-only)
  const allConditionalFlowDescriptions = useMemo(() => {
    return parseDimensionDescriptions(mainMarkdown).blocks.filter((b) => b.mode === 'flow');
  }, [mainMarkdown]);
  const allStatusFlowDescriptions = useMemo(() => {
    return parseDataObjectAttributeDescriptions(mainMarkdown).blocks.filter((b) => b.mode === 'flow');
  }, [mainMarkdown]);

  // Right-panel description-flow doc creation (descriptions live after markdown separator, so we render them in a local doc).
  useEffect(() => {
    if (rightPreview.kind !== 'descFlow') {
      setDescFlowDoc(null);
      setDescFlowRootId(null);
      setDescFlowSelectedNodeId(null);
      setDescFlowExpandedNodes(new Set());
      setDescFlowProcessFlowModeNodes(new Set());
      return;
    }
    const bodyLines = rightPreview.bodyLines || [];
    const normalized = bodyLines.join('\n').trimEnd() + '\n';
    const nextDoc = new Y.Doc();
    nextDoc.getText('nexus').insert(0, normalized);
    const roots = parseNexusMarkdown(normalized);
    const rid = roots[0]?.id || null;
    setDescFlowDoc(nextDoc);
    setDescFlowRootId(rid);
    setDescFlowSelectedNodeId(null);
    setDescFlowExpandedNodes(new Set());
    setDescFlowProcessFlowModeNodes(rid ? new Set([rid]) : new Set());
    setDescFlowFocusTick((t) => t + 1);
  }, [rightPreview]);

  const refPickerRoot = useMemo(() => {
    if (!refPickRootId) return null;
    const byId = new Map<string, NexusNode>();
    const visited = new Set<string>();
    const index = (n: NexusNode) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      byId.set(n.id, n);
      n.children.forEach(index);
      if (n.isHub && n.variants) n.variants.forEach(index);
    };
    allNonFlowTabRoots.forEach(index);
    return byId.get(refPickRootId) || null;
  }, [refPickRootId, allNonFlowTabRoots]);

  const openReferenceModal = () => {
    if (!selectedNode) return;
    const existing = flowRefs[selectedNode.id];
    if (existing) {
      setRefKind(existing.kind);
      setRefPickRootId(existing.rootProcessNodeId);
      setRefPickNodeId(existing.targetNodeId);
    } else {
      const firstRoot = processFlowRoots[0] || allNonFlowTabRoots[0] || null;
      setRefKind('whole');
      setRefPickRootId(firstRoot?.id || null);
      setRefPickNodeId(firstRoot?.id || null);
    }
    setIsRefOpen(true);
  };

  const unassignReference = () => {
    if (!selectedNode) return;
    const existing = flowRefs[selectedNode.id];
    if (!existing) return;

    const next = { ...flowRefs };
    delete next[selectedNode.id];
    setFlowRefs(next);
    saveFlowTabProcessReferences(doc, next);

    if (existing.kind === 'inner' && existing.expandedRunningNumber) {
      const loaded = loadExpandedGridNodesFromDoc(doc, existing.expandedRunningNumber);
      const filtered = loaded.nodes.filter(
        (n) => (n as unknown as Record<string, unknown>).sourceFlowNodeId !== selectedNode.id,
      );
      saveExpandedGridNodesToDoc(doc, existing.expandedRunningNumber, filtered);
    }
  };

  const confirmReference = () => {
    if (!selectedNode) return;
    if (!refPickRootId) return;
    const targetNodeId = refKind === 'whole' ? refPickRootId : refPickNodeId || refPickRootId;

    const next = { ...flowRefs };
    next[selectedNode.id] =
      refKind === 'whole'
        ? { kind: 'whole', rootProcessNodeId: refPickRootId, targetNodeId: refPickRootId }
        : { kind: 'inner', rootProcessNodeId: refPickRootId, targetNodeId };
    setFlowRefs(next);
    saveFlowTabProcessReferences(doc, next);
    setIsRefOpen(false);

    if (refKind === 'inner') {
      // Ensure target process node is expanded; we will insert grid node once runningNumber exists.
      onExpandedNodesChange((prev) => {
        const s = new Set(prev);
        s.add(targetNodeId);
        return s;
      });
      setPendingInnerAssign({ flowNodeId: selectedNode.id, targetNodeId, rootProcessNodeId: refPickRootId });
    }
  };

  const findFirstEmptyCell = (
    nodes: ExpandedGridNodeRuntime[],
    gridWidth: number,
    gridHeight: number,
  ): { x: number; y: number } | null => {
    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        const occupied = nodes.some(
          (n) =>
            x >= n.gridX &&
            x < n.gridX + n.gridWidth &&
            y >= n.gridY &&
            y < n.gridY + n.gridHeight,
        );
        if (!occupied) return { x, y };
      }
    }
    return null;
  };

  const ensureExpandedRunningNumberForNodeId = useCallback(
    (nodeId: string): number | null => {
      const yText = doc.getText('nexus');
      const markdown = yText.toString();
      const roots = parseNexusMarkdown(markdown);

      const nodeMap = new Map<string, NexusNode>();
      const visited = new Set<string>();
      const index = (n: NexusNode) => {
        if (visited.has(n.id)) return;
        visited.add(n.id);
        nodeMap.set(n.id, n);
        n.children.forEach(index);
        if (n.isHub && n.variants) n.variants.forEach(index);
      };
      roots.forEach(index);

      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const expidByLine = extractExpandedIdsFromMarkdown(markdown);
      const existingExpId = expidByLine.get(node.lineIndex);

      const stateData = loadExpandedStates(doc);
      const runningNumber = existingExpId ?? stateData.nextRunningNumber;
      const nextRunningNumber = existingExpId ? stateData.nextRunningNumber : stateData.nextRunningNumber + 1;

      const parentPath = buildExpandedNodeParentPath(node, nodeMap, roots);
      const entries = [...stateData.entries];
      const idx = entries.findIndex((e) => e.runningNumber === runningNumber);
      const updatedEntry = {
        runningNumber,
        content: node.content.trim(),
        parentPath,
        lineIndex: node.lineIndex,
      };
      if (idx >= 0) entries[idx] = updatedEntry;
      else entries.push(updatedEntry);

      // Preserve existing expansions + expand this node.
      const expandedMap = extractRunningNumbersFromMarkdown(markdown);
      const expandedRunningNumbers = new Set<number>(Array.from(expandedMap.values()));
      expandedRunningNumbers.add(runningNumber);

      saveExpandedStates(
        doc,
        {
          nextRunningNumber,
          entries,
        },
        expandedRunningNumbers,
      );

      return runningNumber;
    },
    [doc],
  );

  useEffect(() => {
    if (!pendingInnerAssign) return;
    // If this node has never been expanded before, `getRunningNumber` won't update reactively
    // (it's backed by a ref in Home). Force-create an expanded running number in markdown.
    const rnFromHome = getRunningNumber(pendingInnerAssign.targetNodeId);
    const runningNumberMaybe =
      (Number.isFinite(rnFromHome) ? (rnFromHome as number) : ensureExpandedRunningNumberForNodeId(pendingInnerAssign.targetNodeId)) ?? null;
    if (runningNumberMaybe === null) return;
    const runningNumber: number = runningNumberMaybe;

    const meta = loadExpandedNodeMetadata(doc, runningNumber);
    let gridWidth = meta.gridWidth || meta.gridSize || 4;
    let gridHeight = meta.gridHeight || meta.gridSize || 4;

    const loaded = loadExpandedGridNodesFromDoc(doc, runningNumber, pendingInnerAssign.targetNodeId);
    let nodes = loaded.nodes;

    // If already exists, just record it.
    const existing = nodes.find(
      (n) => (n as unknown as Record<string, unknown>).sourceFlowNodeId === pendingInnerAssign.flowNodeId,
    );
    let key: string | undefined = existing ? (existing.key || existing.id) : undefined;

    if (!existing) {
      let empty = findFirstEmptyCell(nodes, gridWidth, gridHeight);
      // If grid is full, grow (best-effort up to 10x10).
      let safety = 0;
      while (!empty && safety < 20) {
        if (gridWidth < 10) gridWidth += 1;
        else if (gridHeight < 10) gridHeight += 1;
        else break;
        empty = findFirstEmptyCell(nodes, gridWidth, gridHeight);
        safety += 1;
      }
      if ((gridWidth !== meta.gridWidth || gridHeight !== meta.gridHeight) && (gridWidth !== (meta.gridSize || 4) || gridHeight !== (meta.gridSize || 4))) {
        saveExpandedNodeMetadata(doc, runningNumber, {
          ...meta,
          gridWidth,
          gridHeight,
          gridSize: meta.gridSize || 4,
        });
      }
      if (empty) {
        const safeFlow = pendingInnerAssign.flowNodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        key = `flowref-${runningNumber}-${safeFlow}`;
        const newNode: ExpandedGridNodeRuntime = {
          id: key,
          key,
          content: getNodeContentById(pendingInnerAssign.flowNodeId),
          uiType: 'content',
          gridX: empty.x,
          gridY: empty.y,
          gridWidth: 1,
          gridHeight: 1,
        } as ExpandedGridNodeRuntime;
        (newNode as unknown as Record<string, unknown>).sourceFlowNodeId = pendingInnerAssign.flowNodeId;
        nodes = [...nodes, newNode];
        saveExpandedGridNodesToDoc(doc, runningNumber, nodes, pendingInnerAssign.targetNodeId);
      }
    }

    // Persist reference record with the created running number + key.
    const current = loadFlowTabProcessReferences(doc);
    const entry = current[pendingInnerAssign.flowNodeId];
    if (entry && entry.kind === 'inner') {
      current[pendingInnerAssign.flowNodeId] = {
        ...entry,
        expandedRunningNumber: runningNumber,
        gridNodeKey: key,
      };
      saveFlowTabProcessReferences(doc, current);
      setFlowRefs(current);
    }
    setPendingInnerAssign(null);
  }, [pendingInnerAssign, doc, getRunningNumber, getNodeContentById, ensureExpandedRunningNumberForNodeId]);

  return (
    <div className="absolute inset-0 flex mac-canvas-bg">
      <div className="w-[280px] max-w-[35vw] min-w-[200px] m-4 mac-window overflow-hidden shrink flex flex-col max-h-[calc(100%-80px)]">
        {viewBarSpacer}
        <div className="mac-titlebar">
          <div className="mac-title">Flows</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={createNewFlow} className="mac-btn" title="Create new flow">
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="p-2 overflow-auto flex-1">
          {flowRoots.length === 0 ? (
            <div className="p-2 text-xs text-slate-500">
              No flows yet. Click <span className="font-semibold">New</span> to create one.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {flowRoots.map((r) => {
                const fid = (r.metadata as any)?.fid || r.id;
                const pinned = loadFlowTabSwimlane(doc, fid)?.pinnedTagIds || [];
                const pinnedNames = pinned.map((id) => tagNameById.get(id) || id);
                return (
                <button
                  key={fid}
                  type="button"
                  onClick={() => {
                    setSelectedFid(fid);
                    setRightPreview({ kind: 'swimlane', fid });
                    onSelectNode(null);
                    onSelectNodeIds([]);
                  }}
                  className={`w-full px-2 py-2 text-left text-xs border mac-double-outline ${
                    selectedFid === fid ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                  }`}
                >
                  <div className="font-medium truncate">{r.content}</div>
                  <div className="text-[10px] text-slate-400 truncate">{fid}</div>
                  {pinnedNames.length ? (
                    <div className="mt-1 relative flex items-center gap-1 flex-wrap group">
                      {pinned.slice(0, 3).map((id) => {
                        const name = tagNameById.get(id) || id;
                        return (
                          <span
                            key={`${fid}-pinchip-${id}`}
                            className="px-1.5 py-0.5 rounded border border-slate-200 bg-white/95 text-[9px] leading-none text-slate-700 shadow-sm max-w-[96px] truncate"
                          >
                            {name}
                          </span>
                        );
                      })}
                      {pinned.length > 3 ? (
                        <span
                          className="px-1.5 py-0.5 rounded border border-slate-200 bg-white/95 text-[9px] leading-none text-slate-700 shadow-sm"
                        >
                          +{pinned.length - 3}
                        </span>
                      ) : null}

                      <div className="pointer-events-none absolute left-0 top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <div className="max-w-[260px] whitespace-pre-wrap text-[10px] leading-snug mac-double-outline bg-white px-2 py-1 mac-shadow-hard text-slate-800">
                          {pinnedNames.join('\n')}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </button>
              )})}
            </div>
          )}

          {/* Read-only: list main-canvas process node flows */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            <details open={true}>
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-800">
                Navigations (main canvas process flows) <span className="opacity-60 font-normal">· view only</span>
              </summary>
              <div className="mt-2 flex flex-col gap-1">
                {processFlowRoots.length === 0 ? (
                  <div className="px-2 py-1 text-[11px] text-slate-500">No process roots found.</div>
                ) : (
                  processFlowRoots.map((n) => {
                    const isActive = rightPreview.kind === 'process' && rightPreview.rootNodeId === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setRightPreview({ kind: 'process', rootNodeId: n.id });
                          onProcessFlowModeNodesChange((prev) => {
                            const next = new Set(prev);
                            next.add(n.id);
                            return next;
                          });
                          onSelectNode(n.id);
                          onSelectNodeIds([]);
                        }}
                        className={`w-full px-2 py-2 text-left text-xs border mac-double-outline ${
                          isActive ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                        }`}
                        title="Show this process flow on the right"
                      >
                        <div className="font-medium truncate">{n.content}</div>
                        <div className="text-[10px] text-slate-400 truncate">{n.id}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </details>
          </div>

          {/* Read-only: list flow descriptions from conditionals + data-object status */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            <details open={false}>
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-800">
                Flow descriptions <span className="opacity-60 font-normal">· view only</span>
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-700">
                    Conditional nodes ({allConditionalFlowDescriptions.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {allConditionalFlowDescriptions.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-slate-500">No conditional flow descriptions.</div>
                    ) : (
                      allConditionalFlowDescriptions.map((b) => {
                        const key = `cond:${String(b.runningNumber ?? b.id)}`;
                        const isActive = rightPreview.kind === 'descFlow' && rightPreview.key === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setRightPreview({
                                kind: 'descFlow',
                                key,
                                title: b.hubLabel || String(b.id),
                                bodyLines: b.bodyLines || [],
                              });
                              onSelectNode(null);
                              onSelectNodeIds([]);
                            }}
                            className={`w-full px-2 py-2 text-left text-xs border mac-double-outline ${
                              isActive ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                            }`}
                            title="Show this description flow on the right"
                          >
                            <div className="font-medium truncate">{b.hubLabel || String(b.id)}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {b.runningNumber ? `desc:${b.runningNumber}` : String(b.id)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <div className="px-2 py-1 text-[11px] font-medium text-slate-700">
                    Data-object status ({allStatusFlowDescriptions.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {allStatusFlowDescriptions.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-slate-500">No status flow descriptions.</div>
                    ) : (
                      allStatusFlowDescriptions.map((b) => {
                        const key = `status:${b.id}`;
                        const isActive = rightPreview.kind === 'descFlow' && rightPreview.key === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setRightPreview({
                                kind: 'descFlow',
                                key,
                                title: b.label || b.id,
                                bodyLines: b.bodyLines || [],
                              });
                              onSelectNode(null);
                              onSelectNodeIds([]);
                            }}
                            className={`w-full px-2 py-2 text-left text-xs border mac-double-outline ${
                              isActive ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                            }`}
                            title="Show this status flow on the right"
                          >
                            <div className="font-medium truncate">{b.label || b.id}</div>
                            <div className="text-[10px] text-slate-400 truncate">{b.id}</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div className="flex-1 relative m-4 ml-0">
        {rightPreview.kind === 'swimlane' && selectedRoot ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">{selectedRoot.content}</div>
              </div>
              <div className="mac-toolstrip justify-between">
              <div className="min-w-0">
                {isRenamingFlow ? (
                  <input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    className="mac-field w-[360px] max-w-full"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRenameSelectedFlow(renameDraft);
                        setIsRenamingFlow(false);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsRenamingFlow(false);
                        setRenameDraft('');
                      }
                    }}
                    onBlur={() => {
                      // Commit on blur if non-empty; otherwise cancel.
                      if (renameDraft.trim()) {
                        commitRenameSelectedFlow(renameDraft);
                      }
                      setIsRenamingFlow(false);
                    }}
                  />
                ) : (
                  <div className="text-xs font-semibold text-slate-800 truncate">{selectedRoot.content}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="mac-btn"
                  title="Rename flow"
                  onClick={() => {
                    setIsRenamingFlow((s) => {
                      const next = !s;
                      if (!s) setRenameDraft(selectedRoot.content || '');
                      return next;
                    });
                  }}
                >
                  <Pencil size={12} />
                  Rename
                </button>
              </div>
              </div>
            </div>

            <div className="flex-1 relative">
              {swimlane ? (
                <NexusCanvas
                  doc={doc}
                  activeTool={activeTool}
                  onToolUse={onToolUse}
                  layoutDirection={layoutDirection}
                  mainLevel={mainLevel}
                  tagView={tagView}
                  pinnedTagIds={swimlane?.pinnedTagIds || []}
                  showComments={showComments}
                  showAnnotations={showAnnotations}
                  initialFitToContent
                  activeVariantState={activeVariantState}
                  onActiveVariantChange={onActiveVariantChange}
                  viewportResetTick={viewportResetTick}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={(id) => {
                    // Clicking a node or empty space should deselect the lane/stage UI selection.
                    setShowInsertTargetUI(false);
                    onSelectNode(id);
                  }}
                  selectedNodeIds={selectedNodeIds}
                  onSelectNodeIds={onSelectNodeIds}
                  expandedNodes={expandedNodes}
                  onExpandedNodesChange={onExpandedNodesChange}
                  processFlowModeNodes={processFlowModeNodes}
                  onProcessFlowModeNodesChange={onProcessFlowModeNodesChange}
                  getRunningNumber={getRunningNumber}
                  getProcessRunningNumber={getProcessRunningNumber}
                  presence={presence}
                  presenceView="flows"
                  rootFocusId={rootFocusId}
                  hideShowFlowToggle
                  referencedNodeIds={referencedNodeIds}
                  focusTick={canvasFocusTick}
                  onOpenComments={onOpenComments}
                  swimlaneLayout={swimlaneLayoutSpec}
                  swimlaneActions={{
                    onSetInsertTarget: (t) => {
                      setNextLaneId(t.laneId);
                      setNextStage(t.stage);
                      setShowInsertTargetUI(true);
                    },
                    onRenameLane: (laneId, label) => {
                      const next: FlowTabSwimlaneData = {
                        ...swimlane,
                        lanes: swimlane.lanes.map((l) => (l.id === laneId ? { ...l, label } : l)),
                      };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                      setShowInsertTargetUI(true);
                    },
                    onRenameStage: (stageIndex, label) => {
                      const next: FlowTabSwimlaneData = {
                        ...swimlane,
                        stages: swimlane.stages.map((s, i) => (i === stageIndex ? { ...s, label } : s)),
                      };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                      setShowInsertTargetUI(true);
                    },
                    onInsertLane: (atIndex) => {
                      const maxNum = swimlane.lanes
                        .map((l) => {
                          const m = l.id.match(/branch-(\d+)$/);
                          return m ? Number(m[1]) : 0;
                        })
                        .reduce((m, n) => Math.max(m, n), 0);
                      const newLane = { id: `branch-${maxNum + 1}`, label: `Lane ${swimlane.lanes.length + 1}` };
                      const nextLanes = [...swimlane.lanes];
                      nextLanes.splice(Math.max(0, Math.min(atIndex, nextLanes.length)), 0, newLane);
                      const next: FlowTabSwimlaneData = { ...swimlane, lanes: nextLanes };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                    },
                    onDeleteLane: (laneId) => {
                      if (!canDeleteLaneIds.has(laneId)) return;
                      const nextLanes = swimlane.lanes.filter((l) => l.id !== laneId);
                      const nextPlacement: FlowTabSwimlaneData['placement'] = {};
                      Object.entries(swimlane.placement || {}).forEach(([nodeId, p]) => {
                        if (p.laneId === laneId) return;
                        nextPlacement[nodeId] = p;
                      });
                      const next: FlowTabSwimlaneData = { ...swimlane, lanes: nextLanes, placement: nextPlacement };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                      if (nextLaneId === laneId) setNextLaneId(nextLanes[0]?.id || 'branch-1');
                    },
                    onInsertStage: (atIndex) => {
                      const nextStages = [...swimlane.stages];
                      const idx = Math.max(0, Math.min(atIndex, nextStages.length));
                      nextStages.splice(idx, 0, { id: `stage-${Date.now()}`, label: `Stage ${idx + 1}` });
                      const nextPlacement: FlowTabSwimlaneData['placement'] = {};
                      Object.entries(swimlane.placement || {}).forEach(([nodeId, p]) => {
                        if (!Number.isFinite(p.stage)) return;
                        nextPlacement[nodeId] = { ...p, stage: p.stage >= idx ? p.stage + 1 : p.stage };
                      });
                      const next: FlowTabSwimlaneData = { ...swimlane, stages: nextStages, placement: nextPlacement };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                      if (nextStage >= idx) setNextStage((s) => s + 1);
                    },
                    onDeleteStage: (stageIndex) => {
                      if (!canDeleteStageIdxs.has(stageIndex)) return;
                      const nextStages = swimlane.stages.filter((_, i) => i !== stageIndex);
                      const nextPlacement: FlowTabSwimlaneData['placement'] = {};
                      Object.entries(swimlane.placement || {}).forEach(([nodeId, p]) => {
                        if (!Number.isFinite(p.stage)) return;
                        if (p.stage === stageIndex) return;
                        nextPlacement[nodeId] = { ...p, stage: p.stage > stageIndex ? p.stage - 1 : p.stage };
                      });
                      const next: FlowTabSwimlaneData = { ...swimlane, stages: nextStages, placement: nextPlacement };
                      setSwimlane(next);
                      saveFlowTabSwimlane(doc, next);
                      if (nextStage === stageIndex) setNextStage(Math.max(0, stageIndex - 1));
                      if (nextStage > stageIndex) setNextStage((s) => Math.max(0, s - 1));
                    },
                    canDeleteLaneIds,
                    canDeleteStageIdxs,
                  }}
                  onNodeCreated={({ nodeId, fromNodeId }) => {
                    // Place the newly created node at the user-selected insertion target.
                    updatePlacement(nodeId, { laneId: nextLaneId, stage: nextStage });
                    // If lane/stage differs from the originating node, auto-create a black "detail step" label.
                    const from = nodeMap.get(fromNodeId) || null;
                    if (from) {
                      const fromLane = effectiveLaneId(from);
                      const fromStage = effectiveStageIdx(from);
                      if (fromLane !== nextLaneId || fromStage !== nextStage) {
                        const labels = loadConnectorLabels(doc);
                        const key = `${fromNodeId}__${nodeId}`;
                        const existing = labels[key]?.label?.trim() || '';
                        if (!existing) {
                          const fromText = getNodeContentById(fromNodeId);
                          const toText = getNodeContentById(nodeId);
                          labels[key] = {
                            label: `do ${fromText} to continue with ${toText}`,
                            color: '#0f172a',
                          };
                          saveConnectorLabels(doc, labels);
                        }
                      }
                    }
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                  Loading lanes/stages…
                </div>
              )}
            </div>

            {/* Compact top-right inspector for lane/stage assignment */}
            {swimlane && selectedNode ? (
              <div className="absolute right-4 top-4 z-50 pointer-events-none">
                <div
                  className="mac-window w-[260px] overflow-hidden pointer-events-auto flex flex-col max-h-[calc(100%-80px)]"
                  data-safe-panel="right"
                  data-safe-panel-view="flows"
                >
                  <div className="mac-titlebar">
                    <div className="mac-title">Node</div>
                  </div>
                  <div className="p-3 space-y-2 overflow-auto flex-1">
                    <>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{selectedNode.content}</div>
                          {selectedNodeRefSummary ? (
                            <div className="text-[11px] opacity-70 truncate">{selectedNodeRefSummary}</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={openReferenceModal}
                            className="mac-btn"
                            title="Reference a process node from the main canvas"
                          >
                            Reference…
                          </button>
                          {selectedNodeRef ? (
                            <button type="button" onClick={unassignReference} className="mac-btn" title="Unassign reference">
                              Unassign
                            </button>
                          ) : null}
                        </div>

                        <div className="pt-2 border-t border-slate-200">
                          <NodeTagsEditor doc={doc} node={selectedNode} compact />
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] opacity-70">Lane</div>
                          <select
                            className="mac-field h-7 w-full"
                            value={effectiveLaneId(selectedNode)}
                            onChange={(e) => {
                              updatePlacement(selectedNode.id, { laneId: e.target.value });
                              setCanvasFocusTick((n) => n + 1);
                            }}
                            title="Lane"
                          >
                            {swimlane.lanes.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <div className="text-[11px] opacity-70">Stage</div>
                          <select
                            className="mac-field h-7 w-full"
                            value={String(safeStageIndex(swimlane, selectedNode.id, effectiveStageIdx(selectedNode)))}
                            onChange={(e) => {
                              updatePlacement(selectedNode.id, { stage: Number(e.target.value) });
                              setCanvasFocusTick((n) => n + 1);
                            }}
                            title="Stage"
                          >
                            {swimlane.stages.map((s, idx) => (
                              <option key={s.id} value={idx}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                    </>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Reference modal */}
            {isRefOpen && selectedNode ? (
              <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center">
                <div className="mac-window w-[92vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="mac-titlebar">
                    <div className="mac-title">Reference process node</div>
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <button type="button" onClick={() => setIsRefOpen(false)} className="mac-btn" title="Close">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="px-4 py-2 border-b">
                    <div className="text-xs font-semibold truncate">From flow node: {selectedNode.content}</div>
                  </div>

                  <div className="p-4 overflow-auto grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold mb-2">1) Pick a process flow root</div>
                      <div className="space-y-1">
                        {(processFlowRoots.length ? processFlowRoots : allNonFlowTabRoots).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => {
                              setRefPickRootId(r.id);
                              setRefPickNodeId(r.id);
                            }}
                            className={`w-full text-left text-xs px-2 py-2 mac-double-outline ${
                              refPickRootId === r.id ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                            }`}
                          >
                            <div className="font-medium truncate">{r.content}</div>
                            <div className="text-[10px] opacity-70 truncate">{r.id}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold mb-2">2) Pick a node within that flow</div>
                      <div className="mac-double-outline bg-white p-2 max-h-[50vh] overflow-auto">
                        {refPickerRoot ? (
                          <div className="space-y-1">
                            {(() => {
                              const items: { id: string; content: string; depth: number }[] = [];
                              const visited = new Set<string>();
                              const walk = (n: NexusNode, depth: number) => {
                                if (visited.has(n.id)) return;
                                visited.add(n.id);
                                items.push({ id: n.id, content: n.content, depth });
                                n.children.forEach((c) => walk(c, depth + 1));
                                if (n.isHub && n.variants) n.variants.forEach((v) => walk(v, depth + 1));
                              };
                              walk(refPickerRoot, 0);
                              return items;
                            })().map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                onClick={() => setRefPickNodeId(it.id)}
                                className={`w-full text-left px-2 py-1 text-xs ${
                                  refPickNodeId === it.id ? 'mac-fill--hatch mac-shadow-hard' : 'hover:bg-gray-50'
                                }`}
                                style={{ paddingLeft: 8 + it.depth * 14 }}
                              >
                                {it.content}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs opacity-70">Select a root on the left…</div>
                        )}
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold mb-2">3) Reference type</div>
                        <div className="flex items-center gap-3 text-xs">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="refkind"
                              checked={refKind === 'whole'}
                              onChange={() => setRefKind('whole')}
                            />
                            Whole (root)
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="refkind"
                              checked={refKind === 'inner'}
                              onChange={() => setRefKind('inner')}
                            />
                            Inner node (auto-add locked grid node)
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setIsRefOpen(false)} className="mac-btn">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmReference}
                      disabled={!refPickRootId}
                      className="mac-btn mac-btn--primary disabled:opacity-50"
                    >
                      Assign reference
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        ) : rightPreview.kind === 'process' ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">
                  {mainNodeById.get(rightPreview.rootNodeId)?.content || rightPreview.rootNodeId}
                </div>
              </div>
              <div className="mac-toolstrip">
                <div className="text-xs font-semibold text-slate-800 truncate">
                  Process flow (main canvas)
                </div>
              </div>
            </div>
            <div className="flex-1 relative">
              <NexusCanvas
                doc={doc}
                activeTool={activeTool}
                onToolUse={onToolUse}
                layoutDirection={layoutDirection}
                mainLevel={mainLevel}
                tagView={tagView}
                pinnedTagIds={pinnedTagIds}
                showComments={showComments}
                showAnnotations={showAnnotations}
                initialFitToContent
                activeVariantState={activeVariantState}
                onActiveVariantChange={onActiveVariantChange}
                viewportResetTick={viewportResetTick}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                selectedNodeIds={selectedNodeIds}
                onSelectNodeIds={onSelectNodeIds}
                expandedNodes={expandedNodes}
                onExpandedNodesChange={onExpandedNodesChange}
                processFlowModeNodes={processFlowModeNodes}
                onProcessFlowModeNodesChange={onProcessFlowModeNodesChange}
                getRunningNumber={getRunningNumber}
                getProcessRunningNumber={getProcessRunningNumber}
                presence={presence}
                presenceView="flows"
                rootFocusId={rightPreview.rootNodeId}
                hideShowFlowToggle
                focusTick={canvasFocusTick}
                onOpenComments={onOpenComments}
              />
            </div>
          </div>
        ) : rightPreview.kind === 'descFlow' ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">{rightPreview.title}</div>
              </div>
              <div className="mac-toolstrip">
                <div className="text-xs font-semibold text-slate-800 truncate">Description flow (view only)</div>
              </div>
            </div>
            <div className="flex-1 relative">
              {descFlowDoc && descFlowRootId ? (
                <NexusCanvas
                  doc={descFlowDoc}
                  activeTool="select"
                  onToolUse={() => {}}
                  layoutDirection={layoutDirection}
                  mainLevel={1}
                  tagView={tagView}
                  pinnedTagIds={[]}
                  showComments={false}
                  showAnnotations={false}
                  initialFitToContent
                  activeVariantState={{}}
                  onActiveVariantChange={() => {}}
                  selectedNodeId={descFlowSelectedNodeId}
                  onSelectNode={setDescFlowSelectedNodeId}
                  selectedNodeIds={[]}
                  onSelectNodeIds={() => {}}
                  expandedNodes={descFlowExpandedNodes}
                  onExpandedNodesChange={setDescFlowExpandedNodes}
                  processFlowModeNodes={descFlowProcessFlowModeNodes}
                  onProcessFlowModeNodesChange={setDescFlowProcessFlowModeNodes}
                  getRunningNumber={() => undefined}
                  getProcessRunningNumber={() => undefined}
                  hideShowFlowToggle
                  rootFocusId={descFlowRootId}
                  focusTick={descFlowFocusTick}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                  Flow description is empty (nothing to render).
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Select a flow (or create a new one).
          </div>
        )}
      </div>
    </div>
  );
}

function safeStageIndex(
  swimlane: FlowTabSwimlaneData,
  nodeId: string,
  effective?: number,
): number {
  const raw = Number.isFinite(effective) ? effective : swimlane.placement[nodeId]?.stage;
  const idx = Number.isFinite(raw) ? (raw as number) : 0;
  return Math.max(0, Math.min(idx, Math.max(0, swimlane.stages.length - 1)));
}

