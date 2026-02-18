import { useEffect, useLayoutEffect, useState, useMemo, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import * as Y from 'yjs';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { NexusNode } from '@/types/nexus';
import { calculateTreeLayout, NodeLayout, NODE_WIDTH, ANNOTATION_GAP_PX } from '@/lib/layout-engine';
import { DIAMOND_SIZE } from '@/lib/process-flow-diamond';
import { calculateTextHeight } from '@/lib/text-measurement';
import { encodeNewlines, decodeNewlines } from '@/lib/newline-encoding';
import { ToolType } from './Toolbar';
import { Move, Plus, Minus, Tag as TagIcon, Share2, Eye } from 'lucide-react';
import { getNodeStyle, getHubGroupStyle } from '@/lib/style-engine';
import { useNexusStructure } from '@/hooks/use-nexus-structure';
import { useLayoutAnimation } from '@/hooks/use-layout-animation';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { useCustomLines } from '@/hooks/use-custom-lines';
import { useNodeMarqueeSelection } from '@/hooks/use-node-marquee-selection';
import { useFollowSelectionViewport } from '@/hooks/use-follow-selection-viewport';
import { buildConditionMatrixScenarios } from '@/lib/condition-matrix';
import { ConditionMatrixOverlay } from '@/components/ConditionMatrixOverlay';
import { ExpandedNodeView } from '@/components/ExpandedNodeView';
import { getBlockedCmdUnindentReason } from '@/lib/structure-move-guard';
import { useTopToast } from '@/hooks/use-top-toast';
import { FlowNodeType } from '@/components/DimensionFlowEditor';
import { ArrowLeftRight, Clock, GitBranch, X, Link2, Repeat } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata, ExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { useExpandedNodeResize } from '@/hooks/use-expanded-node-resize';
import { useExpandedGridSize } from '@/hooks/use-expanded-grid-size';
import { loadFlowNodeStates, saveFlowNodeStates, buildFlowNodeParentPath } from '@/lib/flow-node-storage';
import { buildParentPath } from '@/lib/expanded-state-storage';
import { upsertFlowNodeRegistryEntryByRunningNumber } from '@/lib/flow-node-registry';
import { loadProcessNodeTypes, saveProcessNodeType as saveProcessNodeTypeToStorage } from '@/lib/process-node-type-storage';
import { buildCollapsedGotoPaths } from '@/lib/collapsed-goto-paths';
import { loadConnectorLabels, saveConnectorLabels, ConnectorLabel } from '@/lib/process-connector-labels';
import { loadGotoTargets, saveGotoTarget } from '@/lib/process-goto-storage';
import { loadLoopTargets, saveLoopTarget } from '@/lib/process-loop-storage';
import { getRenderedRectForMainCanvasNode } from '@/lib/process-node-render-rect';
import { computePaddedSpanBounds, getLoopTargetOptions, isDescendantOf } from '@/lib/process-loop-logic';
import { NodeInlineControls } from '@/components/NodeInlineControls';
import { buildPreservedNodeLineCommentSuffix } from '@/lib/node-line-comments';
import { clientToWorldPoint } from '@/lib/canvas-coordinates';
import { getIncomingConnectionPoint, getOutgoingConnectionPoint } from '@/lib/connector-points';
import { saveNodeAnnotation } from '@/lib/node-annotations';
import { buildNexusNodeCommentTargetKey, getAllThreads, getThread, observeComments } from '@/lib/node-comments';
import { ensureRunningNumberTagsForNodes, extractRunningNumbersFromMarkdown } from '@/lib/node-running-numbers';
import {
  buildJumpBezierBetweenBoxes,
  buildJumpBezierToPoint,
  buildStandardConnectorBezier,
  buildValidationConnectorBezier,
} from '@/lib/canvas-link-routing';
import {
  computeSwimlaneLayoutOverride,
  type SwimlaneBandMetrics,
} from '@/lib/flowtab-swimlane-layout';
import {
  buildExpandedInnerAnchorLookup,
  computeExpandedConnectorStubs,
  reattachStartToExpandedBorder,
} from '@/lib/expanded-connector-anchors';
import { ExpandedConnectorStubOverlay } from '@/components/ExpandedConnectorStubOverlay';
import type { ConditionalHubNoteEntry } from '@/lib/conditional-hub-notes';
import {
  extractHubNoteRunningNumbersFromMarkdown,
  loadConditionalHubNotesFromMarkdown,
  upsertConditionalHubNote,
} from '@/lib/conditional-hub-notes';
import { useCanvasKeyboardFocus } from '@/hooks/use-canvas-keyboard-focus';
import { useFlowlikeGlobalEnterTab } from '@/hooks/use-flowlike-global-enter-tab';
import type { PresenceController, PresenceView } from '@/lib/presence';
import { computeSafeViewport } from '@/lib/safe-viewport';
import { useTagStore } from '@/hooks/use-tag-store';
import type { LayoutDirection } from '@/lib/layout-direction';

interface Props {
  doc: Y.Doc;
  activeTool?: ToolType;
  onToolUse?: () => void;
  /** Layout direction for this file (children grow right vs down). */
  layoutDirection?: LayoutDirection;
  mainLevel?: number;
  tagView?: { activeGroupId: string; visibleTagIds: string[]; highlightedTagIds: string[] };
  /** Ordered list of pinned tag ids (controls which tags show above nodes, and in what order). */
  pinnedTagIds?: string[];
  showComments?: boolean;
  showAnnotations?: boolean;
  /**
   * When true, the canvas will fit-to-content + center once on mount.
   * Useful for "first open" of a view so users immediately see the graph.
   */
  initialFitToContent?: boolean;
  activeVariantState: Record<string, Record<string, string>>;
  onActiveVariantChange: (state: Record<string, Record<string, string>> | ((prev: Record<string, Record<string, string>>) => Record<string, Record<string, string>>)) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  expandedNodes: Set<string>;
  onExpandedNodesChange: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  processFlowModeNodes?: Set<string>;
  onProcessFlowModeNodesChange?: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  /**
   * Optional: prune nodes (and their entire subtree) from rendering/layout.
   * This is used by the main IA canvas to hide nested `#flowtab#` swimlane roots, without affecting the Flow tab.
   */
  pruneSubtree?: (node: NexusNode) => boolean;
  /** Optional multiplayer presence controller (awareness). */
  presence?: PresenceController | null;
  /** Which view this canvas represents (so we can filter remote cursors). */
  presenceView?: PresenceView;
  /** When true, hides the show-flow toggle UI (Flow tab wants flow always ON). */
  hideShowFlowToggle?: boolean;
  /**
   * Optional swimlane/stage overlay + layout override (Flow tab wants process engine + swimlane).
   * When present, process nodes are positioned into a lane/stage grid using these mappings.
   */
  swimlaneLayout?: {
    lanes: { id: string; label: string }[];
    stages: { id: string; label: string }[];
    nodeToLaneId: Record<string, string>;
    nodeToStage: Record<string, number>;
    insertTarget?: { laneId: string; stage: number };
    /** When false, the insertion target is still remembered but the UI highlight/controls are hidden. */
    showInsertTargetUI?: boolean;
  };
  swimlaneActions?: {
    onSetInsertTarget?: (t: { laneId: string; stage: number }) => void;
    onRenameLane?: (laneId: string, label: string) => void;
    onRenameStage?: (stageIndex: number, label: string) => void;
    onInsertLane?: (atIndex: number) => void;
    onDeleteLane?: (laneId: string) => void;
    onInsertStage?: (atIndex: number) => void;
    onDeleteStage?: (stageIndex: number) => void;
    canDeleteLaneIds?: Set<string>;
    canDeleteStageIdxs?: Set<number>;
  };
  /** Callback invoked after a new node is created via Enter/Tab (sibling/child). */
  onNodeCreated?: (info: {
    nodeId: string;
    parentId: string | null;
    kind: 'child' | 'sibling';
    fromNodeId: string;
  }) => void;
  /** External request to open the connector label editor for a specific edge. */
  connectorEditRequest?: { fromId: string; toId: string; initialValue?: string } | null;
  onConnectorEditRequestHandled?: () => void;
  // Optional: restrict which top-level roots are rendered (used by Flow tab)
  rootFilter?: (root: NexusNode) => boolean;
  /**
   * Optional: focus rendering on a specific node id (even if nested).
   * When provided, NexusCanvas will render ONLY that node as the effective root.
   * This is used to support nested `#flowtab#` nodes without forcing them to be top-level roots.
   */
  rootFocusId?: string;
  // Running number getters:
  // - getRunningNumber: for expanded nodes (grid)
  // - getProcessRunningNumber: for process/flow nodes (types, goto, etc.)
  getRunningNumber: (nodeId: string) => number | undefined;
  getProcessRunningNumber?: (nodeId: string) => number | undefined;

  // Expanded grid node selection (inner nodes inside expanded views)
  selectedExpandedGridNode?: { runningNumber: number; gridNodeKeys: string[] } | null;
  onSelectExpandedGridNode?: (sel: { runningNumber: number; gridNodeKeys: string[]; parentNodeLabel?: string; parentNodeId?: string } | null) => void;

  // Main node multi-select
  selectedNodeIds?: string[];
  onSelectNodeIds?: (ids: string[]) => void;
  /** Optional: show a reference indicator on nodes in this set (used by Flow tab). */
  referencedNodeIds?: Set<string>;

  /**
   * Optional focus request tick.
   * When this number changes, the canvas container will be focused so keyboard shortcuts (Enter/Tab) work.
   * Flow tab uses this after interacting with lane/stage dropdowns (which steal focus).
   */
  focusTick?: number;

  /**
   * Optional viewport reset request tick.
   * When this number changes, the canvas will re-center ("fit to content") based on the latest computed layout.
   * Useful after full markdown replacement/import where the current viewport might be far from the new content.
   */
  viewportResetTick?: number;

  // Comments panel integration (Figma-style)
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;

  /**
   * Optional text autocomplete for node content while editing.
   * Used by conditional "Flow Description" to suggest dimension values.
   */
  textAutocompleteOptions?: string[];
  /**
   * Optional: show a link icon on nodes whose content matches one of these values.
   * Used by conditional "Flow/Table Description" to indicate linked dimension values.
   */
  linkedTextOptions?: string[];
}

interface PendingAction {
    lineIndex: number;
    type: 'edit' | 'select';
    selectAll?: boolean;
}

export function NexusCanvas({ 
    doc, activeTool, onToolUse, mainLevel = 1,
    layoutDirection = 'horizontal',
    tagView,
    pinnedTagIds = [],
    showComments = true,
    showAnnotations = true,
    initialFitToContent = false,
    activeVariantState, onActiveVariantChange, selectedNodeId, onSelectNode,
    expandedNodes, onExpandedNodesChange, processFlowModeNodes, onProcessFlowModeNodesChange,
    getRunningNumber, getProcessRunningNumber,
    pruneSubtree,
    presence,
    presenceView = 'main',
    hideShowFlowToggle,
    swimlaneLayout,
    swimlaneActions,
    onNodeCreated,
    connectorEditRequest,
    onConnectorEditRequestHandled,
    rootFilter,
    rootFocusId,
    selectedExpandedGridNode,
    onSelectExpandedGridNode,
    selectedNodeIds = [],
    onSelectNodeIds,
    referencedNodeIds,
    focusTick,
    viewportResetTick,
    onOpenComments,
    textAutocompleteOptions,
    linkedTextOptions,
}: Props) {
  const effectivePresenceView = presenceView;
  const [roots, setRoots] = useState<NexusNode[]>([]);
  // Keep the latest markdown snapshot in a ref so expensive metadata lookups
  // (e.g. conditional hub notes) don't repeatedly call yText.toString() inside loops.
  const latestMarkdownRef = useRef<string>('');
  const selectedNodeIdsSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const pinnedTagIdsStable = pinnedTagIds;
  const pinnedTagIdsSet = useMemo(() => new Set(pinnedTagIdsStable), [pinnedTagIdsStable]);
  const tagStore = useTagStore(doc);
  const tagNameById = useMemo(() => new Map(tagStore.tags.map((t) => [t.id, t.name])), [tagStore.tags]);
  const suppressNextClickRef = useRef(false);
  const [layout, setLayout] = useState<Record<string, NodeLayout>>({});
  
  // Viewport State
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const lastViewportResetTickRef = useRef<number | undefined>(viewportResetTick);
  const pendingViewportFitRef = useRef(false);
  const fitToContentRef = useRef<(opts?: { resetZoom?: boolean; fitZoom?: boolean }) => void>(() => {});

  const [expandedNodeGhostResize, setExpandedNodeGhostResize] = useState<null | {
    nodeId: string;
    startClientX: number;
    startClientY: number;
    baseHeightPx: number;
    extraHeightPx: number;
    startWidthMult: number;
    startHeightMult: number;
    ghostWidthMult: number;
    ghostHeightMult: number;
  }>(null);
  const expandedNodeGhostResizeRef = useRef<typeof expandedNodeGhostResize>(null);

  const getSafeViewport = useCallback(
    () => computeSafeViewport({ containerEl: containerRef.current, view: effectivePresenceView }),
    [effectivePresenceView],
  );

  // Broadcast current transform so the bottom toolbar can show x/y tooltip.
  useEffect(() => {
    // Avoid crashing server-side (this file is client, but be safe).
    if (typeof window === 'undefined') return;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    window.dispatchEvent(
      new CustomEvent('diregram:viewTransform', {
        detail: {
          view: effectivePresenceView,
          x: Math.round(offset.x),
          y: Math.round(offset.y),
          z: round2(scale),
        },
      }),
    );
  }, [effectivePresenceView, offset.x, offset.y, scale]);

  // One-time fit+center on mount if requested by the view.
  useEffect(() => {
    if (!initialFitToContent) return;
    pendingViewportFitRef.current = true;
    initializedRef.current = false;
  }, [initialFitToContent]);

  useEffect(() => {
    if (viewportResetTick === undefined) return;
    if (lastViewportResetTickRef.current === undefined) {
      lastViewportResetTickRef.current = viewportResetTick;
      return;
    }
    if (viewportResetTick !== lastViewportResetTickRef.current) {
      lastViewportResetTickRef.current = viewportResetTick;
      pendingViewportFitRef.current = true;
      initializedRef.current = false;
    }
  }, [viewportResetTick]);

  // Explicit "center" tool from the bottom toolbar (no zoom change).
  useEffect(() => {
    const onTool = (evt: Event) => {
      const e = evt as CustomEvent<{ tool?: string; view?: string }>;
      const tool = e.detail?.tool;
      const view = e.detail?.view;
      if (tool !== 'center') return;
      if (typeof view === 'string' && view !== effectivePresenceView) return;
      // Classic behavior: fit + zoom to cover everything.
      fitToContentRef.current({ fitZoom: true });
    };
    window.addEventListener('diregram:canvasTool', onTool as EventListener);
    return () => window.removeEventListener('diregram:canvasTool', onTool as EventListener);
  }, [effectivePresenceView]);
  
  // Drag State
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  
  
  const [isCmdHeld, setIsCmdHeld] = useState(false);
  const [shakeNodeId, setShakeNodeId] = useState<string | null>(null);

  // Simple top toast (canvas-level feedback for blocked keyboard actions)
  const topToast = useTopToast({ durationMs: 2500 });

  
  // ⚠️ ANIMATION SYSTEM: Use the modularized hook - do not modify animation logic here
  // All animation synchronization is handled by useLayoutAnimation hook
  // See: web/hooks/use-layout-animation.ts
  const { animatedLayout, suppressAnimation, transitionClasses } = useLayoutAnimation({
    layout,
    duration: 300,
  });
  
  // Editing State
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(''); 
  const [editSuggestionIndex, setEditSuggestionIndex] = useState<number | null>(null);
  const [selectAllOnFocus, setSelectAllOnFocus] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const lastCreateRef = useRef<{
    lineIndex: number;
    kind: 'child' | 'sibling';
    fromNodeId: string;
  } | null>(null);
  const pointerCreateLineIndexRef = useRef<number | null>(null);
  const pendingCenterNodeIdRef = useRef<string | null>(null);
  // Pending action resolution can race with Yjs -> parse -> roots -> rawNodeMap updates.
  // We retry briefly so Enter-from-edit reliably enters edit mode on the new node.
  const [pendingActionRetryTick, setPendingActionRetryTick] = useState(0);
  const pendingActionRetryRef = useRef(0);
  const [swimlaneRename, setSwimlaneRename] = useState<
    | { kind: 'lane'; laneId: string; value: string; left: number; top: number; width: number }
    | { kind: 'stage'; stageIndex: number; value: string; left: number; top: number; width: number }
    | null
  >(null);

  // Condition Matrix Overlay State
  const [matrixHubId, setMatrixHubId] = useState<string | null>(null);
  const [hubNotesOpenForId, setHubNotesOpenForId] = useState<string | null>(null);
  const [hubNotesDraft, setHubNotesDraft] = useState<{ dependencies: string; impact: string }>({ dependencies: '', impact: '' });
  const [hubNotesExpandedIds, setHubNotesExpandedIds] = useState<Set<string>>(() => new Set());
  const [hubNoteExtraTopByHubId, setHubNoteExtraTopByHubId] = useState<Record<string, number>>({});
  const [swimlaneBands, setSwimlaneBands] = useState<SwimlaneBandMetrics | null>(null);
  const [commentsTick, setCommentsTick] = useState(0);

  const linkedTextSet = useMemo(() => {
    const vals = Array.isArray(linkedTextOptions) ? linkedTextOptions : [];
    return new Set(vals.map((v) => (v ?? '').trim()).filter(Boolean));
  }, [linkedTextOptions]);

  const editSuggestions = useMemo(() => {
    if (!editingNodeId) return [];
    const opts = Array.isArray(textAutocompleteOptions) ? textAutocompleteOptions : [];
    const normalizedOpts = opts.map((v) => (v ?? '').trim()).filter(Boolean);
    if (!normalizedOpts.length) return [];
    const q = (editValue || '').trim().toLowerCase();
    if (!q) return normalizedOpts.slice(0, 10);
    return normalizedOpts.filter((v) => v.toLowerCase().includes(q)).slice(0, 10);
  }, [editingNodeId, editValue, textAutocompleteOptions]);

  const [annotationEditorForId, setAnnotationEditorForId] = useState<string | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<string>('');

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingEditSelectionRef = useRef<{ start: number; end: number } | null>(null);

  // Preserve caret position in the controlled textarea while typing.
  // Without this, any incidental focus/style/layout work can reset selection,
  // causing new characters to insert at the beginning.
  useLayoutEffect(() => {
    if (!editingNodeId) {
      pendingEditSelectionRef.current = null;
      return;
    }
    const sel = pendingEditSelectionRef.current;
    if (!sel) return;
    const textarea = inputRef.current;
    if (!textarea) return;
    try {
      textarea.setSelectionRange(sel.start, sel.end);
    } catch {
      // ignore
    }
    pendingEditSelectionRef.current = null;
  }, [editValue, editingNodeId]);

  useEffect(() => {
    return observeComments(doc, () => setCommentsTick((t) => t + 1));
  }, [doc]);

  // If user deselects annotation tool, close any open annotation editor.
  useEffect(() => {
    if (activeTool === 'annotation') return;
    if (annotationEditorForId) {
      setAnnotationEditorForId(null);
      setAnnotationDraft('');
    }
  }, [activeTool, annotationEditorForId]);
  
  // --- Derived Trees & Maps ---
  
  const visualTree = useMemo(() => {
      const transformNode = (node: NexusNode, forcedParentId?: string): NexusNode | null => {
          if (pruneSubtree?.(node)) return null;
          let childrenToUse = node.children;
          let activeId = node.id;

          if (node.isHub && node.variants && node.variants.length > 0) {
              const selectedConditions = activeVariantState[node.id];
              
              // Find variant matching selected conditions
              let activeVariant = node.variants[0];
              if (selectedConditions && Object.keys(selectedConditions).length > 0) {
                  const matching = node.variants.find(v => {
                      if (!v.conditions) return false;
                      return Object.entries(selectedConditions).every(([key, value]) => 
                          v.conditions?.[key] === value
                      );
                  });
                  if (matching) activeVariant = matching;
              }
              
              // For the visual tree, use the active variant's children,
              // but attach them directly under the hub so connectors are drawn from the hub.
              childrenToUse = activeVariant.children;
              activeId = activeVariant.id; 
          }

          const transformedChildren = childrenToUse
            .map((child) => transformNode(child, node.id))
            .filter(Boolean) as NexusNode[];

          return {
              ...node,
              parentId: forcedParentId !== undefined ? forcedParentId : node.parentId,
              activeVariantId: activeId,
              children: transformedChildren
          };
      };
      return roots.map((root) => transformNode(root)).filter(Boolean) as NexusNode[];
  }, [roots, activeVariantState, pruneSubtree]);

  const flattenedNodes = useMemo(() => {
    const flat: NexusNode[] = [];
    const traverse = (nodes: NexusNode[]) => {
      nodes.forEach(node => {
        flat.push(node);
        traverse(node.children);
      });
    };
    traverse(visualTree);
    return flat;
  }, [visualTree]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, NexusNode>();
    flattenedNodes.forEach(n => map.set(n.id, n));
    return map;
  }, [flattenedNodes]);

  // Running-number anchors from markdown (<!-- rn:N -->). Used for comment targets.
  const lineIndexToRn = useMemo(() => {
    const markdown = latestMarkdownRef.current || doc.getText('nexus').toString();
    return extractRunningNumbersFromMarkdown(markdown);
  }, [doc, roots]);

  const allCommentThreads = useMemo(() => getAllThreads(doc), [doc, commentsTick]);

  // --- Tag view filtering/highlighting (eye-tag tool) ---
  const visibleTagIdSet = useMemo(() => new Set(tagView?.visibleTagIds || []), [tagView?.visibleTagIds]);
  const highlightedTagIdSet = useMemo(() => new Set(tagView?.highlightedTagIds || []), [tagView?.highlightedTagIds]);

  const nodeHasAnyTag = useCallback(
    (n: NexusNode, tagIds: Set<string>): boolean => {
      if (tagIds.size === 0) return true;
      const hasDirect = (n.tags || []).some((t) => tagIds.has(t));
      if (hasDirect) return true;
      if (n.isHub && n.variants && n.variants.length > 0) {
        return n.variants.some((v) => (v.tags || []).some((t) => tagIds.has(t)));
      }
      return false;
    },
    [],
  );

  const visibleNodeIds = useMemo(() => {
    if (!tagView || visibleTagIdSet.size === 0) return null as Set<string> | null;
    const explicit = new Set<string>();
    flattenedNodes.forEach((n) => {
      if (nodeHasAnyTag(n, visibleTagIdSet)) explicit.add(n.id);
    });
    // Keep ancestors visible for context.
    const withAncestors = new Set<string>(explicit);
    explicit.forEach((id) => {
      let cur = nodeMap.get(id);
      while (cur?.parentId) {
        const p = nodeMap.get(cur.parentId);
        if (!p) break;
        withAncestors.add(p.id);
        cur = p;
      }
    });
    return withAncestors;
  }, [tagView, visibleTagIdSet, flattenedNodes, nodeHasAnyTag, nodeMap]);

  const isNodeVisible = useCallback(
    (nodeId: string): boolean => {
      if (!visibleNodeIds) return true;
      return visibleNodeIds.has(nodeId);
    },
    [visibleNodeIds],
  );

  const isNodeDimmed = useCallback(
    (n: NexusNode): boolean => {
      if (!tagView || highlightedTagIdSet.size === 0) return false;
      return !nodeHasAnyTag(n, highlightedTagIdSet);
    },
    [tagView, highlightedTagIdSet, nodeHasAnyTag],
  );

  // --- Process-flow mode helpers (used to hide flow-only lines when "show flow" is OFF) ---
  const getRootProcessNodeId = useCallback(
    (nodeId: string): string | null => {
      const start = nodeMap.get(nodeId);
      if (!start?.isFlowNode) return null;

      let root: NexusNode = start;
      let current: NexusNode | undefined = start;
      while (current?.isFlowNode) {
        root = current;
        const parentId = current.parentId;
        if (!parentId) break;
        const parent = nodeMap.get(parentId);
        if (!parent?.isFlowNode) break;
        current = parent;
      }
      return root.id;
    },
    [nodeMap],
  );

  const isShowFlowOnForNode = useCallback(
    (nodeId: string): boolean => {
      const rootId = getRootProcessNodeId(nodeId);
      // Non-process nodes are unaffected.
      if (!rootId) return true;
      return !!processFlowModeNodes?.has(rootId);
    },
    [getRootProcessNodeId, processFlowModeNodes],
  );

  // A node is hidden when it is a descendant of a process flow whose root is NOT in process-flow mode.
  // (This matches the render-time behavior where collapsed flows hide their child nodes/connectors.)
  const isChildOfCollapsedProcess = useCallback(
    (n: NexusNode): boolean => {
      let cur: NexusNode | undefined = n;
      while (cur?.parentId) {
        const parent = nodeMap.get(cur.parentId);
        if (!parent) return false;
        if (parent.isFlowNode) {
          const rootId = getRootProcessNodeId(parent.id);
          if (rootId && !processFlowModeNodes?.has(rootId)) return true;
        }
        cur = parent;
      }
      return false;
    },
    [getRootProcessNodeId, nodeMap, processFlowModeNodes],
  );

  const isNodeRendered = useCallback(
    (n: NexusNode): boolean => {
      if (!isNodeVisible(n.id)) return false;
      if (isChildOfCollapsedProcess(n)) return false;
      return true;
    },
    [isChildOfCollapsedProcess, isNodeVisible],
  );

  const isDescendantOfLocal = useCallback(
    (ancestorId: string, nodeId: string): boolean =>
      isDescendantOf({ nodeMap, ancestorId, nodeId }),
    [nodeMap],
  );

  // ⚠️ CUSTOM LINES SYSTEM: Use the modularized hook - do not modify line logic here
  // All custom line functionality is handled by useCustomLines hook
  // See: web/hooks/use-custom-lines.ts
  const {
    customLines,
    selectedLineId,
    setSelectedLineId,
    draggingLineFrom,
    setDraggingLineFrom,
    mousePos,
    setMousePos,
    createLine,
    deleteLine,
    isLineConnectedToNode,
  } = useCustomLines({ doc, nodeMap });

  // Safety: cancel line-drag preview if mouse is released outside the canvas.
  useEffect(() => {
    if (activeTool !== 'line' || !draggingLineFrom) return;
    const handleWindowMouseUp = () => {
      setDraggingLineFrom(null);
      setMousePos(null);
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [activeTool, draggingLineFrom, setDraggingLineFrom, setMousePos]);


  const rawNodeMap = useMemo(() => {
      const map = new Map<string, NexusNode>();
      const traverse = (nodes: NexusNode[]) => {
          nodes.forEach(n => {
              map.set(n.id, n);
              if (n.variants) n.variants.forEach(v => {
                  map.set(v.id, v);
                  traverse(v.children);
              }); 
              else traverse(n.children);
          })
      }
      traverse(roots);
      return map;
  }, [roots]);

  // --- Conditional hub notes index (cached per markdown snapshot) ---
  const conditionalHubNoteIndex = useMemo(() => {
    const markdown = latestMarkdownRef.current || doc.getText('nexus').toString();
    const rnByLine = extractHubNoteRunningNumbersFromMarkdown(markdown);
    const data = loadConditionalHubNotesFromMarkdown(markdown);
    const entryByRn = new Map<number, ConditionalHubNoteEntry>();
    data.entries.forEach((e) => entryByRn.set(e.runningNumber, e));

    const getNoteForHub = (hub: NexusNode): { dependencies: string; impact: string } | null => {
      const rn = rnByLine.get(hub.lineIndex);
      if (!rn) return null;
      const entry = entryByRn.get(rn);
      if (!entry) return null;
      return { dependencies: entry.dependencies || '', impact: entry.impact || '' };
    };

    return { getNoteForHub };
  }, [doc, roots]);

  const styleMap = useMemo(() => {
    const map = new Map<string, { styleClass: string; hueIndex: number; shadeIndex: number }>();

    const traverse = (
      node: NexusNode,
      indexInLevel: number,
      parentHue: number,
      parentShade: number,
    ) => {
      const style = getNodeStyle(node, mainLevel, indexInLevel, parentHue, parentShade);
      map.set(node.id, style);

      // Traverse children, passing down hue and shade
      node.children.forEach((child, idx) => {
        traverse(child, idx, style.hueIndex !== -1 ? style.hueIndex : parentHue, style.shadeIndex);
      });

      // Also traverse variants if it is a hub!
      if (node.isHub && node.variants) {
        node.variants.forEach(variant => {
          if (variant.id === node.id) return; // Skip self
          // Variants inherit the Hub's style, then traverse their own children
          map.set(variant.id, style);
          variant.children.forEach((child, idx) => {
            traverse(
              child,
              idx,
              style.hueIndex !== -1 ? style.hueIndex : parentHue,
              style.shadeIndex,
            );
          });
        });
      }
    };

    roots.forEach((root, idx) => traverse(root, idx, -1, 0));
    return map;
  }, [roots, mainLevel]);

  const expandedInnerAnchorByParentAndDoId = useMemo(() => {
    return buildExpandedInnerAnchorLookup({
      doc,
      expandedNodes,
      animatedLayout,
      getRunningNumber,
      nodePaddingPx: { x: 12, y: 8 }, // px-3 py-2
      gridGapPx: 2,
    });
  }, [animatedLayout, doc, expandedNodes, getRunningNumber]);

  // --- Conditional Hub Groups (visual enclosure around hub + descendants) ---

  const hubGroups = useMemo(() => {
    // Perf note: this used to be O(n^2) (for each hub, scan all nodes).
    // When a conditional hub exists on screen, every layout change (e.g. add node)
    // would re-run the nested loop and feel laggy.
    //
    // Also: avoid recursion (can blow the call stack on deep trees) and avoid
    // per-node array allocations (e.g. [...hubStack, node]) which can freeze the UI.
    // We do an iterative DFS and update bounds for hubs in the current ancestor stack.

    type BoundsAcc = {
      hub: NexusNode;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    };

    // If there are no hubs, there are no hub groups to compute.
    // This keeps the common case cheap and matches the old behavior.
    const hasAnyHub = flattenedNodes.some((n) => n.isHub);
    if (!hasAnyHub) return [];

    const boundsByHubId = new Map<string, BoundsAcc>();

    const updateHubBounds = (hub: NexusNode, x1: number, y1: number, x2: number, y2: number) => {
      const existing = boundsByHubId.get(hub.id);
      if (!existing) {
        boundsByHubId.set(hub.id, { hub, minX: x1, minY: y1, maxX: x2, maxY: y2 });
        return;
      }
      existing.minX = Math.min(existing.minX, x1);
      existing.minY = Math.min(existing.minY, y1);
      existing.maxX = Math.max(existing.maxX, x2);
      existing.maxY = Math.max(existing.maxY, y2);
    };

    const hubStack: NexusNode[] = [];
    type Frame = { node: NexusNode; childIndex: number; entered: boolean };
    const stack: Frame[] = [];

    const pushNode = (n: NexusNode) => {
      stack.push({ node: n, childIndex: 0, entered: false });
    };

    visualTree.forEach((root) => pushNode(root));

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const n = frame.node;

      if (!frame.entered) {
        frame.entered = true;
        if (n.isHub) hubStack.push(n);

        const nodeLayout = layout[n.id];
        if (
          nodeLayout &&
          // Guard against invalid layout (NaN/Infinity) which can break viewport centering/rendering.
          Number.isFinite(nodeLayout.x) &&
          Number.isFinite(nodeLayout.y) &&
          Number.isFinite(nodeLayout.width) &&
          Number.isFinite(nodeLayout.height) &&
          // Bounds should only consider nodes that actually render (collapsed flows + tag view hide nodes).
          isNodeRendered(n) &&
          hubStack.length > 0
        ) {
          const x1 = nodeLayout.x;
          const y1 = nodeLayout.y;
          const x2 = nodeLayout.x + nodeLayout.width;
          const y2 = nodeLayout.y + nodeLayout.height;
          for (let i = 0; i < hubStack.length; i += 1) {
            updateHubBounds(hubStack[i], x1, y1, x2, y2);
          }
        }
      }

      if (frame.childIndex < n.children.length) {
        const child = n.children[frame.childIndex];
        frame.childIndex += 1;
        pushNode(child);
        continue;
      }

      // Exit node
      if (n.isHub) hubStack.pop();
      stack.pop();
    }

    // Extra padding so the background section doesn't visually collide with nearby nodes
    const PADDING_X = 40;
    const BASE_PADDING_Y_TOP = 48; // header + dropdowns
    const PADDING_Y_BOTTOM = 32;

    const groups: {
      hub: NexusNode;
      bounds: { x: number; y: number; width: number; height: number };
    }[] = [];

    boundsByHubId.forEach((acc, hubId) => {
      if (acc.minX === Infinity || acc.minY === Infinity) return;

      const extraTop = hubNoteExtraTopByHubId[hubId] || 0;
      const padTop = BASE_PADDING_Y_TOP + extraTop;

      const x = acc.minX - PADDING_X;
      const y = acc.minY - padTop;
      const width = acc.maxX - acc.minX + PADDING_X * 2;
      const height = acc.maxY - acc.minY + padTop + PADDING_Y_BOTTOM;

      groups.push({
        hub: acc.hub,
        bounds: { x, y, width, height },
      });
    });

    return groups;
  }, [flattenedNodes, hubNoteExtraTopByHubId, isNodeRendered, layout, visualTree]);

  // Calculate process flow groups (background sections for expanded process flows)
  const processFlowGroups = useMemo(() => {
    const groups: {
      rootProcessNode: NexusNode;
      bounds: { x: number; y: number; width: number; height: number };
    }[] = [];

    if (!processFlowModeNodes || processFlowModeNodes.size === 0) return groups;

    // Extra padding so the background section doesn't visually collide with nearby nodes
    const PADDING_X = 40;
    const PADDING_Y_TOP = 32;
    const PADDING_Y_BOTTOM = 32;

    // Helper to check if a node is a descendant of a root process node
    const isDescendantOfProcessFlow = (node: NexusNode, rootProcessNodeId: string) => {
      if (node.id === rootProcessNodeId) return true;
      let current: NexusNode | undefined = node;
      while (current && current.parentId) {
        if (current.parentId === rootProcessNodeId) return true;
        // Check if parent is also a process node (part of the same flow)
        const parent = nodeMap.get(current.parentId);
        if (!parent || !parent.isFlowNode) break;
        if (parent.id === rootProcessNodeId) return true;
        current = parent;
      }
      return false;
    };

    // Find all root process nodes that are in process flow mode
    flattenedNodes.forEach((node) => {
      if (!node.isFlowNode) return;
      if (!processFlowModeNodes.has(node.id)) return;

      // Check if this is a root process node (parent is NOT a process node)
      const isRootProcessNode = !node.parentId || !nodeMap.get(node.parentId)?.isFlowNode;
      if (!isRootProcessNode) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Include the root node and all its process node descendants
      flattenedNodes.forEach((childNode) => {
        const nodeLayout = layout[childNode.id];
        if (!nodeLayout) return;
        if (
          !Number.isFinite(nodeLayout.x) ||
          !Number.isFinite(nodeLayout.y) ||
          !Number.isFinite(nodeLayout.width) ||
          !Number.isFinite(nodeLayout.height)
        ) {
          return;
        }
        if (!isNodeRendered(childNode)) return;

        const isInFlow = isDescendantOfProcessFlow(childNode, node.id);
        if (!isInFlow) return;

        const x1 = nodeLayout.x;
        const y1 = nodeLayout.y;
        const x2 = nodeLayout.x + nodeLayout.width;
        const y2 = nodeLayout.y + nodeLayout.height;

        minX = Math.min(minX, x1);
        minY = Math.min(minY, y1);
        maxX = Math.max(maxX, x2);
        maxY = Math.max(maxY, y2);
      });

      if (minX === Infinity || minY === Infinity) return;

      const x = minX - PADDING_X;
      const y = minY - PADDING_Y_TOP;
      const width = maxX - minX + PADDING_X * 2;
      const height = maxY - minY + PADDING_Y_TOP + PADDING_Y_BOTTOM;

      groups.push({
        rootProcessNode: node,
        bounds: { x, y, width, height },
      });
    });

    return groups;
  }, [flattenedNodes, layout, nodeMap, processFlowModeNodes]);

  // Extract unique condition keys and possible values for a hub node
  const getHubConditionDimensions = (node: NexusNode) => {
    const keyValueMap = new Map<string, Set<string>>();
    if (!node.variants) return keyValueMap;

    node.variants.forEach((v) => {
      if (v.conditions) {
        Object.entries(v.conditions).forEach(([key, value]) => {
          if (!keyValueMap.has(key)) {
            keyValueMap.set(key, new Set());
          }
          keyValueMap.get(key)!.add(value);
        });
      }
    });
    return keyValueMap;
  };

  // Process node type and connector labels state (renamed from "flow node" to avoid conflicts)
  const [processNodeTypes, setProcessNodeTypes] = useState<Record<string, FlowNodeType>>({});
  const expandedConnectorStubs = useMemo(() => {
    return computeExpandedConnectorStubs({
      flattenedNodes,
      expandedNodes,
      animatedLayout,
      processNodeTypes,
      anchorsByParentAndDoId: expandedInnerAnchorByParentAndDoId,
      selectedNodeId,
      dropTargetId,
    });
  }, [
    animatedLayout,
    dropTargetId,
    expandedInnerAnchorByParentAndDoId,
    expandedNodes,
    flattenedNodes,
    processNodeTypes,
    selectedNodeId,
  ]);

  const [connectorLabels, setConnectorLabels] = useState<Record<string, { label: string; color: string }>>({});
  const [gotoTargets, setGotoTargets] = useState<Record<string, string>>({}); // Map from nodeId to targetNodeId
  const [loopTargets, setLoopTargets] = useState<Record<string, string>>({}); // Map from nodeId to targetNodeId
  const [processTypeMenuForId, setProcessTypeMenuForId] = useState<string | null>(null);
  const [processTypeMenuPosition, setProcessTypeMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [editingConnector, setEditingConnector] = useState<{ fromId: string; toId: string } | null>(null);
  const [editingConnectorValue, setEditingConnectorValue] = useState('');
  const typeMenuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingConnectorLabelsRef = useRef<Record<string, { label: string; color: string }> | null>(null);

  // Close process type menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (processTypeMenuForId && !(e.target as Element).closest('[data-process-type-menu]')) {
        setProcessTypeMenuForId(null);
        setProcessTypeMenuPosition(null);
      }
    };
    if (processTypeMenuForId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [processTypeMenuForId]);

  
  // Helper: get running number for process nodes (fall back to general getter if specific one not provided)
  const getProcessNumber = useCallback(
    (nodeId: string) => {
      if (getProcessRunningNumber) return getProcessRunningNumber(nodeId);
      return getRunningNumber(nodeId);
    },
    [getProcessRunningNumber, getRunningNumber],
  );

  // Load flow node types and connector labels from storage
  useEffect(() => {
    if (!doc) return;
    
    // Load process node types
    const types = loadProcessNodeTypes(doc, flattenedNodes, getProcessNumber);
    setProcessNodeTypes(types);
    
    // Load connector labels
    const labels = loadConnectorLabels(doc);
    setConnectorLabels(labels);
    
    // Load goto targets
    const gotoMap = loadGotoTargets(doc, flattenedNodes, getProcessNumber);
    setGotoTargets(gotoMap);

    // Load loop targets
    const loopMap = loadLoopTargets(doc, flattenedNodes, getProcessNumber);
    setLoopTargets(loopMap);
  }, [doc, flattenedNodes, getProcessNumber]);

  // Save connector labels
  const handleSaveConnectorLabels = useCallback(
    (labels: Record<string, ConnectorLabel>) => {
      if (!doc) return;
      saveConnectorLabels(doc, labels);
      setConnectorLabels(labels);
    },
    [doc],
  );
  
  // Save pending connector labels after render
  useEffect(() => {
    if (pendingConnectorLabelsRef.current) {
      const labels = pendingConnectorLabelsRef.current;
      pendingConnectorLabelsRef.current = null;
      handleSaveConnectorLabels(labels);
    }
  });
  
  // Save process node type
  const saveProcessNodeType = (nodeId: string, type: FlowNodeType) => {
    if (!doc) {
      console.error('saveProcessNodeType: doc is null');
      return;
    }
    
    const node = nodeMap.get(nodeId);
    if (!node || !node.isFlowNode) {
      console.error('saveProcessNodeType: node not found or not a process node:', nodeId);
      // Still update the state even if we can't save to markdown yet
      setProcessNodeTypes(prev => ({ ...prev, [nodeId]: type }));
      return;
    }
    
    const prevType = processNodeTypes[nodeId];
    const runningNumber = saveProcessNodeTypeToStorage(doc, nodeId, type, node, nodeMap, roots, getProcessNumber);
    
    if (runningNumber !== undefined) {
      // Update state immediately so UI reflects the change
      setProcessNodeTypes(prev => ({ ...prev, [nodeId]: type }));
      
      // If changing to end, clear goto target if it exists
      if (type === 'end') {
        const currentGotoTarget = gotoTargets[nodeId];
        if (currentGotoTarget) {
          // Clear goto target by removing it from state and markdown
          setGotoTargets(prev => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
          // Remove from markdown
          handleSaveGotoTarget(nodeId, '');
        }
        const currentLoopTarget = loopTargets[nodeId];
        if (currentLoopTarget) {
          setLoopTargets((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
          handleSaveLoopTarget(nodeId, '');
        }
      }

      // If changing away from loop, clear loop target (keeps metadata clean)
      if (prevType === 'loop' && type !== 'loop') {
        const currentLoopTarget = loopTargets[nodeId];
        if (currentLoopTarget) {
          setLoopTargets((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
          handleSaveLoopTarget(nodeId, '');
        }
      }
    }
  };
  
  // Save goto target
  const handleSaveGotoTarget = (nodeId: string, targetId: string) => {
    if (!doc) return;
    const runningNumber = getProcessNumber(nodeId);
    if (runningNumber === undefined) return;
    
    saveGotoTarget(doc, nodeId, targetId, runningNumber);
    
    setGotoTargets(prev => {
      if (targetId) {
        return { ...prev, [nodeId]: targetId };
      } else {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      }
    });
  };

  // Save loop target
  const handleSaveLoopTarget = (nodeId: string, targetId: string) => {
    if (!doc) return;
    const runningNumber = getProcessNumber(nodeId);
    if (runningNumber === undefined) return;

    saveLoopTarget(doc, nodeId, targetId, runningNumber);

    setLoopTargets((prev) => {
      if (targetId) {
        return { ...prev, [nodeId]: targetId };
      } else {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      }
    });
  };
  
  // Close connector label editor when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editingConnector) {
        const target = e.target as Element;
        // Don't close if clicking on the editor itself or its children
        if (!target.closest('.connector-label-editor')) {
          // Save current value before closing
          const connectorKey = `${editingConnector.fromId}__${editingConnector.toId}`;
          setConnectorLabels(prev => {
            const newLabels = { ...prev };
            if (editingConnectorValue.trim()) {
              newLabels[connectorKey] = {
                label: editingConnectorValue.trim(),
                  color: '#000000',
              };
            } else {
              delete newLabels[connectorKey];
            }
            handleSaveConnectorLabels(newLabels);
            return newLabels;
          });
          setEditingConnector(null);
          setEditingConnectorValue('');
        }
      }
    };
    if (editingConnector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingConnector, editingConnectorValue, handleSaveConnectorLabels]);

  // Compute scenarios for condition matrix overlay (shared logic)
  const matrixScenarios = useMemo(() => {
    if (!matrixHubId) return [];
    const hub = rawNodeMap.get(matrixHubId);
    if (!hub) return [];
    return buildConditionMatrixScenarios(hub);
  }, [matrixHubId, rawNodeMap]);

  // --- Hooks ---
  const structure = useNexusStructure(doc, roots);
  const navigation = useKeyboardNavigation(selectedNodeId, nodeMap, roots, visualTree);
  const dragDrop = useDragDrop(doc, rawNodeMap);

  // --- Effects ---

  const findNodeById = useCallback((nodes: NexusNode[], id: string): NexusNode | null => {
    // Use an inner recursive function so we don't self-reference the hook variable (eslint can misinterpret that).
    const walk = (xs: NexusNode[]): NexusNode | null => {
      for (const n of xs) {
        if (n.id === id) return n;
        // Walk variants too (variants are not in children)
        if (n.isHub && n.variants) {
          for (const v of n.variants) {
            if (v.id === id) return v;
            const got = walk(v.children || []);
            if (got) return got;
          }
        }
        const got = walk(n.children || []);
        if (got) return got;
      }
      return null;
    };
    return walk(nodes);
  }, []);

  const detachAsRoot = useCallback((n: NexusNode): NexusNode => {
    // Clone only the root node; its subtree retains structure.
    // Clearing parentId prevents connector logic from trying to draw a parent->root edge.
    return { ...n, parentId: null };
  }, []);

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const markdown = yText.toString();
      latestMarkdownRef.current = markdown;
      const parsedRoots = parseNexusMarkdown(markdown);
      if (rootFocusId) {
        const found = findNodeById(parsedRoots, rootFocusId);
        setRoots(found ? [detachAsRoot(found)] : []);
        return;
      }
      const filtered = rootFilter ? parsedRoots.filter(rootFilter) : parsedRoots;
      // If a view intentionally filters out some roots (e.g. main Canvas hides Flow-tab roots),
      // it's valid for the result to be empty. Do NOT fall back to rendering hidden roots,
      // otherwise Flow-tab roots leak into the Canvas view when they are the only roots.
      setRoots(filtered);
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, rootFilter, rootFocusId, findNodeById, detachAsRoot]);

  // Convert Set to array for dependency tracking
  const expandedNodesArray = useMemo(() => Array.from(expandedNodes).sort(), [expandedNodes]);

  // ⚠️ EXPANDED NODE RESIZE: Use the modularized hook - do not modify resize logic here
  // All expanded node resize functionality is handled by useExpandedNodeResize hook
  // See: web/hooks/use-expanded-node-resize.ts
  const expandedNodeResizeConfig = useMemo(
    () => ({
      step: 0.5,
      minWidth: 1,
      maxWidth: 10,
      minHeight: 1,
      maxHeight: 10,
    }),
    []
  );
  const { setSize: setExpandedNodeSize } = useExpandedNodeResize(
    { doc, getRunningNumber },
    expandedNodeResizeConfig
  );

  // ⚠️ EXPANDED GRID SIZE: Use the modularized hook - do not modify grid size logic here
  // All expanded node grid size functionality is handled by useExpandedGridSize hook
  // See: web/hooks/use-expanded-grid-size.ts
  const { handleGridSizeChange: handleExpandedGridSizeChange } = useExpandedGridSize(
    { doc, getRunningNumber },
    {
      minSize: 1,
      maxSize: 10,
      visualStep: 0.5,
      visualMin: 1,
      visualMax: 10,
    }
  );

  useEffect(() => {
    expandedNodeGhostResizeRef.current = expandedNodeGhostResize;
  }, [expandedNodeGhostResize]);

  // Ghost resize interaction for expanded nodes:
  // while dragging we show a preview outline only; commit the size on release.
  useEffect(() => {
    if (!expandedNodeGhostResize) return;

    const cfg = expandedNodeResizeConfig;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const snap = (value: number) => {
      const step = cfg.step;
      if (!Number.isFinite(step) || step <= 0) return value;
      return Math.round(value / step) * step;
    };

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    const onMove = (e: PointerEvent) => {
      const current = expandedNodeGhostResizeRef.current;
      if (!current) return;
      if (e.cancelable) e.preventDefault();

      const dxWorld = (e.clientX - current.startClientX) / (scale || 1);
      const dyWorld = (e.clientY - current.startClientY) / (scale || 1);

      const startWidthPx = NODE_WIDTH * current.startWidthMult;
      const requestedWidthMult = (startWidthPx + dxWorld) / NODE_WIDTH;
      const nextWidthMult = clamp(snap(requestedWidthMult), cfg.minWidth, cfg.maxWidth);

      const baseH = current.baseHeightPx;
      const requestedHeightMult =
        baseH > 0 ? (baseH * current.startHeightMult + dyWorld) / baseH : current.startHeightMult;
      const nextHeightMult = clamp(snap(requestedHeightMult), cfg.minHeight, cfg.maxHeight);

      setExpandedNodeGhostResize((prev) => {
        if (!prev) return prev;
        if (prev.ghostWidthMult === nextWidthMult && prev.ghostHeightMult === nextHeightMult) return prev;
        return { ...prev, ghostWidthMult: nextWidthMult, ghostHeightMult: nextHeightMult };
      });
    };

    const onUp = () => {
      const final = expandedNodeGhostResizeRef.current;
      expandedNodeGhostResizeRef.current = null;
      setExpandedNodeGhostResize(null);
      if (!final) return;
      setExpandedNodeSize(final.nodeId, { width: final.ghostWidthMult, height: final.ghostHeightMult });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [expandedNodeGhostResize?.nodeId, expandedNodeResizeConfig, scale, setExpandedNodeSize]);

  useEffect(() => {
      let newLayout = calculateTreeLayout(
        visualTree,
        expandedNodes,
        doc,
        getRunningNumber,
        processFlowModeNodes,
        nodeMap,
        processNodeTypes,
        layoutDirection,
      );
      const isSameLayout = (a: Record<string, NodeLayout>, b: Record<string, NodeLayout>) => {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (const id of aKeys) {
          const al = a[id];
          const bl = b[id];
          if (!al || !bl) return false;
          if (al.x !== bl.x || al.y !== bl.y || al.width !== bl.width || al.height !== bl.height) return false;
        }
        return true;
      };

      // Sanitize layout values to prevent NaN/Infinity from breaking CSS transforms and viewport centering.
      // If any entry is invalid, coerce it to a safe default so nodes remain renderable.
      const DEFAULT_W = 150;
      const DEFAULT_H = 40;
      let hadInvalid = false;
      Object.entries(newLayout).forEach(([id, l]) => {
        const x = Number.isFinite(l.x) ? l.x : 0;
        const y = Number.isFinite(l.y) ? l.y : 0;
        const w = Number.isFinite(l.width) && l.width > 0 ? l.width : DEFAULT_W;
        const h = Number.isFinite(l.height) && l.height > 0 ? l.height : DEFAULT_H;
        if (x !== l.x || y !== l.y || w !== l.width || h !== l.height) {
          hadInvalid = true;
          newLayout[id] = { ...l, x, y, width: w, height: h };
        }
      });

      // Flow tab swimlane override: position nodes into a lane/stage grid while keeping
      // the rest of the process-node rendering/connector semantics intact.
      if (swimlaneLayout && visualTree.length > 0) {
        const computed = computeSwimlaneLayoutOverride({
          baseLayout: newLayout,
          visualTree,
          swimlane: {
            lanes: swimlaneLayout.lanes,
            stages: swimlaneLayout.stages,
            nodeToLaneId: swimlaneLayout.nodeToLaneId,
            nodeToStage: swimlaneLayout.nodeToStage,
          },
          nodeWidth: NODE_WIDTH,
          diamondSize: DIAMOND_SIZE,
        });
        newLayout = computed.layout;
        const isSameBands = (a: SwimlaneBandMetrics | null, b: SwimlaneBandMetrics): boolean => {
          if (!a) return false;
          if (
            a.laneGutterW !== b.laneGutterW ||
            a.headerH !== b.headerH ||
            a.stageInsetX !== b.stageInsetX ||
            a.laneInsetY !== b.laneInsetY
          ) {
            return false;
          }
          const eqArr = (x: number[], y: number[]) =>
            x.length === y.length && x.every((v, i) => v === y[i]);
          return (
            eqArr(a.laneTops, b.laneTops) &&
            eqArr(a.laneHeights, b.laneHeights) &&
            eqArr(a.stageLefts, b.stageLefts) &&
            eqArr(a.stageWidths, b.stageWidths)
          );
        };
        setSwimlaneBands((prev) => (isSameBands(prev, computed.bands) ? prev : computed.bands));
      } else {
        setSwimlaneBands((prev) => (prev === null ? prev : null));
      }

      // Conditional hub notes: reserve EXACT space for the notes box without moving the hub group upward.
      // We do this by computing an extra top padding per hub and shifting the hub's nodes down by that amount.
      // This prevents the notes box from overlapping nodes above, and avoids giant fixed padding.
      if (!swimlaneLayout) {
        const layoutBeforeNotes = newLayout;
        const BASE_PAD_TOP = 48;
        const BOX_TOP_OFFSET = 32; // matches summary/popover `top-8`
        const BOX_MARGIN_BOTTOM = 8;
        const BOX_WIDTH = 360;
        const BOX_INNER_WIDTH = BOX_WIDTH - 16; // px-2 left+right
        const HEADING_H = 14;
        const SECTION_GAP = 8; // space-y-2
        const BOX_PADDING_Y = 16; // py-2
        const COLLAPSED_INNER_LIMIT = 32; // ~2 lines at 11px
        const EXPANDED_INNER_LIMIT = 160; // max-h-40

        const measureWrappedHeight = (text: string, width: number, fontSizePx: number): number => {
          const t = (text || '').trim();
          if (!t) return 0;
          const lineHeightPx = Math.round(fontSizePx * 1.45);
          // Canvas-based measurement if available
          if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.font = `400 ${fontSizePx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
              const lines: string[] = [];
              t.split('\n').forEach((rawLine) => {
                const line = rawLine.trimEnd();
                if (!line) {
                  lines.push('');
                  return;
                }
                const words = line.split(' ');
                let cur = '';
                words.forEach((w) => {
                  const test = cur ? `${cur} ${w}` : w;
                  const wpx = ctx.measureText(test).width;
                  if (wpx > width && cur) {
                    lines.push(cur);
                    cur = w;
                  } else {
                    cur = test;
                  }
                });
                if (cur) lines.push(cur);
              });
              return Math.max(1, lines.length) * lineHeightPx;
            }
          }
          // SSR fallback
          const avgChar = fontSizePx * 0.6;
          const charsPerLine = Math.max(10, Math.floor(width / avgChar));
          const approxLines = Math.max(1, Math.ceil(t.length / charsPerLine));
          return approxLines * lineHeightPx;
        };

        const measureNoteBoxHeight = (note: { dependencies: string; impact: string }, expanded: boolean): number => {
          const deps = note.dependencies.trim();
          const imp = note.impact.trim();
          const sections: Array<{ heading: string; body: string }> = [];
          if (deps) sections.push({ heading: 'Dependencies', body: deps });
          if (imp) sections.push({ heading: 'Impact', body: imp });
          if (sections.length === 0) return 0;

          // Inner content height = headings + wrapped bodies + gaps
          let inner = 0;
          sections.forEach((s, idx) => {
            inner += HEADING_H;
            inner += 2; // small heading->body margin
            inner += measureWrappedHeight(s.body, BOX_INNER_WIDTH, 11);
            if (idx < sections.length - 1) inner += SECTION_GAP;
          });

          const innerClamped = expanded ? Math.min(inner, EXPANDED_INNER_LIMIT) : Math.min(inner, COLLAPSED_INNER_LIMIT);
          return BOX_PADDING_Y + innerClamped;
        };

        const getHasHubAsAncestor = (n: NexusNode, hubId: string) => {
          let cur: NexusNode | undefined = n;
          while (cur && cur.parentId) {
            if (cur.parentId === hubId) return true;
            cur = nodeMap.get(cur.parentId);
          }
          return false;
        };

        const extraByHubId: Record<string, number> = {};
        const nodesToShiftById: Record<string, number> = {};
        const pushDownSpecs: Array<{
          hubId: string;
          extra: number;
          groupNodeIds: Set<string>;
          oldMinX: number;
          oldMaxX: number;
          oldMaxY: number;
        }> = [];

        flattenedNodes.forEach((hubCandidate) => {
          if (!hubCandidate.isHub) return;
          const note = conditionalHubNoteIndex.getNoteForHub(hubCandidate);
          const hasNote = !!note && (!!note.dependencies.trim() || !!note.impact.trim());
          if (!hasNote || !note) return;
          const expanded = hubNotesExpandedIds.has(hubCandidate.id);
          const boxH = measureNoteBoxHeight(note, expanded);
          const desiredPadTop = BOX_TOP_OFFSET + boxH + BOX_MARGIN_BOTTOM;
          const extra = Math.max(0, Math.ceil(desiredPadTop - BASE_PAD_TOP));
          if (!extra) return;
          extraByHubId[hubCandidate.id] = extra;

          // Determine which nodes are in the hub group, and record old bounds for "push nodes below" logic.
          const groupNodeIds = new Set<string>();
          let oldMinX = Infinity;
          let oldMaxX = -Infinity;
          let oldMaxY = -Infinity;

          flattenedNodes.forEach((n) => {
            const inGroup = n.id === hubCandidate.id || getHasHubAsAncestor(n, hubCandidate.id);
            if (!inGroup) return;
            groupNodeIds.add(n.id);
            const l0 = layoutBeforeNotes[n.id];
            if (!l0) return;
            oldMinX = Math.min(oldMinX, l0.x);
            oldMaxX = Math.max(oldMaxX, l0.x + l0.width);
            oldMaxY = Math.max(oldMaxY, l0.y + l0.height);
          });

          if (oldMinX !== Infinity) {
            pushDownSpecs.push({ hubId: hubCandidate.id, extra, groupNodeIds, oldMinX, oldMaxX, oldMaxY });
          }

          // Shift hub + its descendants down by `extra` to make space above the hub content.
          flattenedNodes.forEach((n) => {
            if (groupNodeIds.has(n.id)) {
              nodesToShiftById[n.id] = (nodesToShiftById[n.id] || 0) + extra;
            }
          });
        });

        const shiftedAny = Object.keys(nodesToShiftById).length > 0;
        if (shiftedAny) {
          const nextLayout: Record<string, NodeLayout> = { ...newLayout };
          Object.entries(nodesToShiftById).forEach(([nodeId, dy]) => {
            const l = nextLayout[nodeId];
            if (!l) return;
            nextLayout[nodeId] = { ...l, y: l.y + dy };
          });
          newLayout = nextLayout;
        }

        // Push nodes BELOW the hub group down as well, so the hub's shifted descendants don't overlap them.
        // We do this relative to the old (pre-shift) group bottom.
        if (pushDownSpecs.length > 0) {
          const PAD_X = 40;
          const additionalShift: Record<string, number> = {};
          pushDownSpecs.forEach((spec) => {
            const left = spec.oldMinX - PAD_X;
            const right = spec.oldMaxX + PAD_X;
            flattenedNodes.forEach((n) => {
              if (spec.groupNodeIds.has(n.id)) return;
              const l = newLayout[n.id];
              if (!l) return;
              const overlapsX = l.x < right && l.x + l.width > left;
              if (!overlapsX) return;
              if (l.y >= spec.oldMaxY - 1) {
                additionalShift[n.id] = (additionalShift[n.id] || 0) + spec.extra;
              }
            });
          });
          if (Object.keys(additionalShift).length > 0) {
            const nextLayout: Record<string, NodeLayout> = { ...newLayout };
            Object.entries(additionalShift).forEach(([nodeId, dy]) => {
              const l = nextLayout[nodeId];
              if (!l) return;
              nextLayout[nodeId] = { ...l, y: l.y + dy };
            });
            newLayout = nextLayout;
          }
        }
        setHubNoteExtraTopByHubId(extraByHubId);
      } else {
        setHubNoteExtraTopByHubId({});
      }

      // IMPORTANT: Only update `layout` state when it actually changed.
      // During animations, unrelated re-renders (e.g. mousemove presence updates) can cause
      // this effect to re-run and recompute an identical layout. If we call setLayout with a
      // fresh object each time, `useLayoutAnimation` will restart from the beginning, which
      // looks like flicker/looping.
      setLayout((prev) => (isSameLayout(prev, newLayout) ? prev : newLayout));
      if ((pendingViewportFitRef.current || !initializedRef.current) && visualTree.length > 0 && containerRef.current) {
          // If we have a pending per-node center (new node), never override it with whole-graph fit.
          if (pendingCenterNodeIdRef.current) {
            pendingViewportFitRef.current = false;
            initializedRef.current = true;
            return;
          }

          const { clientWidth, clientHeight } = containerRef.current;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          Object.values(newLayout).forEach((l) => {
            if (
              !Number.isFinite(l.x) ||
              !Number.isFinite(l.y) ||
              !Number.isFinite(l.width) ||
              !Number.isFinite(l.height)
            ) {
              return;
            }
            minX = Math.min(minX, l.x);
            minY = Math.min(minY, l.y);
            maxX = Math.max(maxX, l.x + l.width);
            maxY = Math.max(maxY, l.y + l.height);
          });
          if (minX !== Infinity && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
              const contentWidth = maxX - minX;
              const contentHeight = maxY - minY;
              // Fit zoom on explicit viewport fit requests (imports), then center.
              const PAD = 80;
              const MIN_SCALE = 0.1;
              const MAX_SCALE = 5;
              const w = Math.max(1, contentWidth + PAD * 2);
              const h = Math.max(1, contentHeight + PAD * 2);
              const fitScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(clientWidth / w, clientHeight / h)));
              const nextScale = pendingViewportFitRef.current ? fitScale : scale;
              if (pendingViewportFitRef.current) setScale(nextScale);
              setOffset({
                  x: (clientWidth - contentWidth * nextScale) / 2 - minX * nextScale,
                  y: (clientHeight - contentHeight * nextScale) / 2 - minY * nextScale
              });
              initializedRef.current = true;
              pendingViewportFitRef.current = false;
              if (hadInvalid) {
                topToast.show('Some nodes had invalid layout values; view was auto-recovered.');
              }
          }
      }
  }, [
    visualTree,
    expandedNodesArray,
    processNodeTypes,
    nodeMap,
    doc,
    getRunningNumber,
    processFlowModeNodes,
    swimlaneLayout,
    flattenedNodes,
    hubNotesExpandedIds,
    scale,
    conditionalHubNoteIndex,
    layoutDirection,
  ]); 

  // If viewport math ever produces non-finite values (NaN/Infinity), reset to a safe state.
  useEffect(() => {
    const bad =
      !Number.isFinite(scale) ||
      !Number.isFinite(offset.x) ||
      !Number.isFinite(offset.y);
    if (!bad) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    initializedRef.current = false;
    pendingViewportFitRef.current = true;
  }, [scale, offset.x, offset.y]);

  // Key tracking
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => { if (e.metaKey || e.ctrlKey) setIsCmdHeld(true); };
      const handleKeyUp = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey) setIsCmdHeld(false); };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, []);

  const startEditing = (id: string, initialValue?: string, selectAll = false) => {
    const node = nodeMap.get(id);
    if (!node) return;
    setEditingNodeId(id);
    onSelectNode(id);
    const nextValue = initialValue !== undefined ? initialValue : node.content; // Use content (clean text)
    // When editing starts from a typed character, ensure the caret lands AFTER that character
    // (otherwise subsequent typing inserts before it).
    if (!selectAll) {
      pendingEditSelectionRef.current = { start: nextValue.length, end: nextValue.length };
    }
    setEditValue(nextValue);
    setSelectAllOnFocus(selectAll);
  };

  // Pending Actions
  useEffect(() => {
      if (pendingAction !== null) {
          const node = Array.from(rawNodeMap.values()).find(n => n.lineIndex === pendingAction.lineIndex);
          if (node) {
              pendingActionRetryRef.current = 0;
              const createdViaEnterTab = pendingAction.type === 'edit' && lastCreateRef.current?.lineIndex === pendingAction.lineIndex;
              const createdViaPointer = pendingAction.type === 'edit' && pointerCreateLineIndexRef.current === pendingAction.lineIndex;
              const shouldCenter = createdViaEnterTab || createdViaPointer;

              if (createdViaEnterTab) {
                const meta = lastCreateRef.current!;
                lastCreateRef.current = null;
                onNodeCreated?.({
                  nodeId: node.id,
                  parentId: node.parentId,
                  kind: meta.kind,
                  fromNodeId: meta.fromNodeId,
                });
              }
              if (createdViaPointer) {
                pointerCreateLineIndexRef.current = null;
              }
              if (shouldCenter) {
                pendingCenterNodeIdRef.current = node.id;
                // Prevent an in-flight auto-fit from overriding the per-node center.
                pendingViewportFitRef.current = false;
                initializedRef.current = true;
              }
              if (pendingAction.type === 'edit') {
                  startEditing(node.id, undefined, pendingAction.selectAll); 
              } else if (pendingAction.type === 'select') {
                  onSelectNode(node.id);
                  onPendingSelectResolved(node.id);
                  if (containerRef.current) containerRef.current.focus();
              }
              setPendingAction(null);
          } else {
              // `rawNodeMap` may not yet include the newly inserted line immediately after a Yjs write.
              // Retry briefly before giving up (prevents "Enter did nothing" feeling).
              if (pendingActionRetryRef.current < 25) {
                pendingActionRetryRef.current += 1;
                const raf = window.requestAnimationFrame(() => setPendingActionRetryTick((t) => t + 1));
                return () => window.cancelAnimationFrame(raf);
              }

              // If a create/move operation inserted a line outside the currently rendered subtree
              // (e.g. Flow tab `rootFocusId`), we may not be able to resolve the target node here.
              // Never let `pendingAction` get stuck.
              pendingActionRetryRef.current = 0;
              lastCreateRef.current = null;
              pointerCreateLineIndexRef.current = null;
              setPendingAction(null);
          }
      }
  }, [rawNodeMap, pendingAction, pendingActionRetryTick, onSelectNode, onNodeCreated]);

  // If a node was just created, center the viewport on it once we have layout for it.
  useEffect(() => {
    const targetId = pendingCenterNodeIdRef.current;
    if (!targetId) return;
    // Use FINAL layout coordinates so the node stays centered after animations settle.
    // (Using animatedLayout can center on an intermediate position and then "drift".)
    const l = layout[targetId] || animatedLayout[targetId];
    const safe = getSafeViewport();
    if (!l || !safe) return;
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const targetScreenX = safe.centerX;
    const targetScreenY = safe.centerY;
    setOffset({
      x: targetScreenX - cx * scale,
      y: targetScreenY - cy * scale,
    });
    // Prevent any pending "fit to content" requests from overriding this.
    pendingViewportFitRef.current = false;
    initializedRef.current = true;
    pendingCenterNodeIdRef.current = null;
  }, [animatedLayout, layout, scale, getSafeViewport]);

  const centerNodeInSafeViewport = useCallback(
    (nodeId: string) => {
      const l = layout[nodeId] || animatedLayout[nodeId];
      const safe = getSafeViewport();
      if (!l || !safe) return;
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      setOffset({
        x: safe.centerX - cx * scale,
        y: safe.centerY - cy * scale,
      });
      // Don't let any pending fit override manual centering.
      pendingViewportFitRef.current = false;
      initializedRef.current = true;
    },
    [animatedLayout, getSafeViewport, layout, scale],
  );

  const requestCenterOnFinalLayout = useCallback((nodeId: string) => {
    pendingCenterNodeIdRef.current = nodeId;
    pendingViewportFitRef.current = false;
    initializedRef.current = true;
  }, []);

  const { followKeyboardNavigation, requestFollowAfterPendingSelect, onPendingSelectResolved } = useFollowSelectionViewport({
    centerNow: centerNodeInSafeViewport,
    requestCenterOnFinalLayout,
  });

  // External connector label editor request (Flow tab uses this to enforce detail labels on lane/stage transitions).
  const lastConnectorEditKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connectorEditRequest) return;
    const key = `${connectorEditRequest.fromId}__${connectorEditRequest.toId}__${connectorEditRequest.initialValue || ''}`;
    if (lastConnectorEditKeyRef.current === key) return;
    lastConnectorEditKeyRef.current = key;
    setEditingConnector({ fromId: connectorEditRequest.fromId, toId: connectorEditRequest.toId });
    setEditingConnectorValue(connectorEditRequest.initialValue || '');
    onConnectorEditRequestHandled?.();
  }, [connectorEditRequest, onConnectorEditRequestHandled]);

  // Focus management
  useEffect(() => {
    if (!editingNodeId) return;
    const textarea = inputRef.current;
    if (!textarea) return;

    // IMPORTANT: Do not "refocus" on every layout change while typing.
    // That can reset the caret/selection and make characters insert at the start.
    if (document.activeElement !== textarea) {
      textarea.focus();
    }

    if (selectAllOnFocus) {
      // For textarea, use setSelectionRange instead of select()
      textarea.setSelectionRange(0, textarea.value.length);
      return;
    }

    // If we have a pending selection (e.g. edit started from a typed character),
    // apply it at focus time too. This avoids a race where the restore effect
    // runs before the textarea ref is ready.
    const pending = pendingEditSelectionRef.current;
    if (pending) {
      try {
        textarea.setSelectionRange(pending.start, pending.end);
      } catch {
        // ignore
      }
      pendingEditSelectionRef.current = null;
      return;
    }

    // Fallback: some browsers place the caret at 0 on programmatic focus.
    // If nothing is selected, move caret to end so typing appends naturally.
    try {
      if ((textarea.selectionStart ?? 0) === 0 && (textarea.selectionEnd ?? 0) === 0 && textarea.value.length > 0) {
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      }
    } catch {
      // ignore
    }
  }, [editingNodeId, selectAllOnFocus]);

  // While editing, keep the textarea height aligned to the node container.
  // This must NOT call focus(), otherwise it can disrupt the caret.
  useEffect(() => {
    if (!editingNodeId) return;
    const textarea = inputRef.current;
    if (!textarea) return;
    const nodeLayout = layout[editingNodeId];
    if (!nodeLayout) return;

    const lineCount = (textarea.value.match(/\n/g) || []).length + 1;
    // Account for parent padding (py-2 = 8px top + 8px bottom = 16px total)
    const availableHeight = nodeLayout.height - 16;

    if (lineCount === 1) {
      // For single-line text, set height to fill available space for proper centering
      textarea.style.minHeight = `${availableHeight}px`;
      textarea.style.height = `${availableHeight}px`;
    } else {
      // For multi-line text, allow it to grow beyond node height while editing
      textarea.style.minHeight = '24px'; // Minimum for one line
      textarea.style.height = 'auto';
      // Allow growth beyond availableHeight for multi-line content
      const contentHeight = Math.max(24, textarea.scrollHeight);
      textarea.style.height = `${contentHeight}px`;
    }
    textarea.style.paddingTop = '0';
    textarea.style.paddingBottom = '0';
  }, [editingNodeId, layout, editValue]);

  const isFlowLike = !!swimlaneLayout || !!hideShowFlowToggle;
  const getIsFromFormField = useCallback((target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el.isContentEditable ||
      !!el.closest('input,textarea,select,[contenteditable="true"]')
    );
  }, []);

  const createChildFromSelection = useCallback(() => {
    const effectiveSelectedId = selectedNodeId || rootFocusId || null;
    if (!effectiveSelectedId) return;
    const node = nodeMap.get(effectiveSelectedId);
    if (!node) return;
    suppressAnimation();
    const action = structure.createChild(node, rawNodeMap, node.activeVariantId);
    if (!action) return;
    lastCreateRef.current = {
      lineIndex: action.lineIndex,
      kind: 'child',
      fromNodeId: node.id,
    };
    setPendingAction(action);
  }, [nodeMap, rawNodeMap, rootFocusId, selectedNodeId, structure, suppressAnimation]);

  const createSiblingFromSelection = useCallback(() => {
    const effectiveSelectedId = selectedNodeId || rootFocusId || null;
    if (!effectiveSelectedId) return;
    const node = nodeMap.get(effectiveSelectedId);
    if (!node) return;
    suppressAnimation();
    // Sibling creation for the focused root would insert OUTSIDE the focused subtree.
    // In that edge case, fall back to "add child" to keep interaction stable.
    const isFocusedRoot = !!rootFocusId && effectiveSelectedId === rootFocusId;
    const action = isFocusedRoot
      ? structure.createChild(node, rawNodeMap, node.activeVariantId)
      : structure.createSibling(node, rawNodeMap, node.activeVariantId);
    if (!action) return;
    lastCreateRef.current = {
      lineIndex: action.lineIndex,
      kind: isFocusedRoot ? 'child' : 'sibling',
      fromNodeId: node.id,
    };
    setPendingAction(action);
  }, [nodeMap, rawNodeMap, rootFocusId, selectedNodeId, structure, suppressAnimation]);

  // Keyboard mapping:
  // - Horizontal (left→right): Enter = sibling, Tab = child
  // - Vertical (top→bottom):   Enter = child,   Tab = sibling
  const onEnterCreate = layoutDirection === 'vertical' ? createChildFromSelection : createSiblingFromSelection;
  const onTabCreate = layoutDirection === 'vertical' ? createSiblingFromSelection : createChildFromSelection;

  useFlowlikeGlobalEnterTab({
    enabled: isFlowLike,
    isEditing: !!editingNodeId,
    hasSelection: !!selectedNodeId || !!rootFocusId,
    getIsFromFormField,
    onEnter: onEnterCreate,
    onTab: onTabCreate,
  });

  const { focusOnPointerEvent } = useCanvasKeyboardFocus({
    containerRef,
    editingNodeId,
    selectedNodeId,
    focusTick,
  });

  useEffect(() => {
      if (shakeNodeId) {
          const timer = setTimeout(() => setShakeNodeId(null), 500);
          return () => clearTimeout(timer);
      }
  }, [shakeNodeId]);


  // --- Handlers ---

  const zoomAtClientPoint = useCallback(
    (nextScaleRaw: number, clientX: number, clientY: number) => {
      const el = containerRef.current;
      const nextScale = Math.max(0.1, Math.min(5, nextScaleRaw));
      if (!el) {
        setScale(nextScale);
        return;
      }
      const rect = el.getBoundingClientRect();

      // World point under cursor before zoom
      const wx = (clientX - rect.left - offset.x) / Math.max(1e-6, scale);
      const wy = (clientY - rect.top - offset.y) / Math.max(1e-6, scale);

      // Keep that world point under the cursor after zoom
      const nextOffsetX = clientX - rect.left - wx * nextScale;
      const nextOffsetY = clientY - rect.top - wy * nextScale;

      setScale(nextScale);
      setOffset({ x: nextOffsetX, y: nextOffsetY });
    },
    [offset.x, offset.y, scale],
  );

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomSpeed = 0.001;
          zoomAtClientPoint(scale - e.deltaY * zoomSpeed, e.clientX, e.clientY);
      } else {
          setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
  };

  const handleKeyValueSelect = (e: React.ChangeEvent<HTMLSelectElement>, hubId: string, key: string) => {
      e.stopPropagation();
      onActiveVariantChange(prev => ({
          ...prev,
          [hubId]: {
              ...(prev[hubId] || {}),
              [key]: e.target.value
          }
      }));
      onSelectNode(hubId);
  };

  const toggleCommon = (e: React.MouseEvent, node: NexusNode) => {
      e.stopPropagation();
      structure.toggleCommonNode(node, node.activeVariantId || null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (editingNodeId) return; 
    setDraggedNodeId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId?: string) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    if (targetId) e.stopPropagation();
    
    if (targetId && targetId !== draggedNodeId) {
        if (dragDrop.validateDrop(draggedNodeId, targetId)) {
             setDropTargetId(targetId);
        } else {
             setDropTargetId(null);
        }
    } else {
        setDropTargetId(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    if (!draggedNodeId || draggedNodeId === targetId) {
        setDraggedNodeId(null);
        setDropTargetId(null);
        return;
    }
    
    // Variant-aware drop target logic
    let finalTargetId = targetId;
    const targetNode = nodeMap.get(targetId);
    if (targetNode && targetNode.isHub && targetNode.activeVariantId) {
        finalTargetId = targetNode.activeVariantId;
    }

    dragDrop.performMove(draggedNodeId, finalTargetId);
    setDraggedNodeId(null);
    setDropTargetId(null);
  };


  const handleCanvasClick = (e: React.MouseEvent) => {
    commitEdit();
    setEditingNodeId(null);
    if (isPanning) return;

    if (activeTool === 'node') {
        const yText = doc.getText('nexus');
        const currentText = yText.toString();
        const lines = currentText.split('\n');
        const endsWithNewline = !!currentText && currentText.endsWith('\n');
        const prefix = currentText && !endsWithNewline ? '\n' : '';
        const newText = `${currentText}${prefix}Root Node`;
        
        doc.transact(() => {
            yText.delete(0, yText.length);
            yText.insert(0, newText);
        });
        
        const newLineIndex = !currentText ? 0 : endsWithNewline ? Math.max(0, lines.length - 1) : lines.length;
        pointerCreateLineIndexRef.current = newLineIndex;
        setPendingAction({ lineIndex: newLineIndex, type: 'edit', selectAll: true });
        if (containerRef.current) containerRef.current.focus();
        onToolUse?.();
        return;
    }
    onSelectExpandedGridNode?.(null);
    onSelectNodeIds?.([]);
    onSelectNode(null);
  };

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      return clientToWorldPoint({
        containerEl: containerRef.current,
        viewportEl: viewportRef.current,
        clientX,
        clientY,
        offset,
        scale,
      });
    },
    [offset, scale],
  );

  // Marquee selection (rectangular multi-select), modularized so it doesn't regress with unrelated UI changes.
  const {
    overlay: nodeMarqueeOverlay,
    marqueeActive: isMarqueeActive,
    start: startMarquee,
    move: moveMarquee,
    end: endMarquee,
    cancel: cancelMarquee,
  } = useNodeMarqueeSelection<NexusNode>({
    enabled: activeTool === 'select',
    containerRef,
    clientToWorld,
    nodes: flattenedNodes,
    selectedIds: selectedNodeIds,
    getNodeId: (n) => n.id,
    setSuppressNextClick: (v) => {
      suppressNextClickRef.current = v;
    },
    isNodeSelectable: (n) => {
      // Skip nodes hidden under collapsed process flows.
      return !isChildOfCollapsedProcess(n);
    },
    getRenderedRectWorld: (n) => {
      const l = animatedLayout[n.id];
      if (!l) return null;
      const isProcessNode = n.isFlowNode;
      const processNodeType = isProcessNode ? (processNodeTypes[n.id] || 'step') : null;
      const isDiamond =
        !!isProcessNode &&
        isShowFlowOnForNode(n.id) &&
        !!processNodeType &&
        (processNodeType === 'validation' || processNodeType === 'branch');

      const diamondSize = isDiamond ? Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, l.height)) : DIAMOND_SIZE;
      const rx = isDiamond ? l.x + (l.width - diamondSize) / 2 : l.x;
      const ry = l.y;
      const rw = isDiamond ? diamondSize : l.width;
      const rh =
        isDiamond
          ? diamondSize
          : isProcessNode && (processNodeType === 'time' || processNodeType === 'loop')
            ? l.height + 24
            : l.height;
      return { x: rx, y: ry, w: rw, h: rh };
    },
    onSelectNodeIds: onSelectNodeIds,
    onSelectPrimaryNode: onSelectNode,
  });

  const commitEdit = (finalValue?: string) => {
    if (!editingNodeId) return;
    const node = nodeMap.get(editingNodeId);
    if (!node) return;

    let valToSave = finalValue !== undefined ? finalValue : editValue;
    
    // Check for duplicate sibling content and add number suffix if needed
    const parent = node.parentId ? rawNodeMap.get(node.parentId) : null;
    const siblings = parent ? parent.children : roots;
    
    // Extract base content without conditions/tags for comparison
    const extractBaseContent = (content: string): string => {
      const contentMatch = content.match(/^([^#]+)/);
      return contentMatch ? contentMatch[1].trim() : content.trim();
    };
    
    const baseContent = extractBaseContent(valToSave);
    let finalContent = baseContent;
    let counter = 2;
    
    // Check if content matches any sibling (excluding self)
    while (siblings.some(s => {
      if (s.id === node.id) return false; // Skip self
      const siblingBaseContent = extractBaseContent(s.content);
      return siblingBaseContent === finalContent;
    })) {
      finalContent = `${baseContent}-${counter}`;
      counter++;
    }
    
    // If content was modified, update valToSave
    if (finalContent !== baseContent) {
      valToSave = finalContent;
    }

    // Check for Common Node Sync (Content Update)
    const extraMutations: { index: number, text: string }[] = [];
    if (node.isCommon && node.parentId) {
        const parent = rawNodeMap.get(node.parentId);
        if (parent && parent.isHub && parent.variants) {
            parent.variants.forEach(variant => {
                if (variant.id === node.parentId) return; // Skip own parent
                
                // Find matching common child
                const matchingChild = variant.children.find(c => c.isCommon && c.content === node.content);
                if (matchingChild) {
                    // Update this child too
                     const yText = doc.getText('nexus'); // Read current state? No, assume consistent with 'lines' derived below?
                     // Actually complex because we need to parse lines.
                     // Let's assume lines are stable for this transaction.
                     
                     const matchIndent = ' '.repeat(matchingChild.level * 2);
                     let matchSuffix = '';
                     if (matchingChild.conditions) {
                         const parts = Object.entries(matchingChild.conditions).map(([k, v]) => `${k}=${v}`);
                         matchSuffix += ` (${parts.join(', ')})`;
                     }
                     if (matchingChild.isCommon) matchSuffix += ' #common#';
                     
                     extraMutations.push({
                         index: matchingChild.lineIndex,
                         text: `${matchIndent}${encodeNewlines(valToSave)}${matchSuffix}`
                     });
                }
            });
        }
    }

    // Compare with encoded version since rawContent in markdown has encoded newlines
    // Extract just the content part from rawContent (without conditions/tags) for comparison
    const extractRawContent = (raw: string): string => {
      // Remove conditions and tags to get just the base content
      let content = raw;
      // Remove conditions: (key=value)
      content = content.replace(/\([^)]*\)/g, '');
      // Remove #common# tag
      content = content.replace(/#common#/g, '');
      return content.trim();
    };
    
    const encodedValToSave = encodeNewlines(valToSave);
    const rawContentBase = extractRawContent(node.rawContent);
    
    if (rawContentBase !== encodedValToSave || extraMutations.length > 0) {
        const yText = doc.getText('nexus');
        const lines = yText.toString().split('\n');

        // Preserve metadata comments that may be attached to the node line.
        // Important: these comments are part of other persistence systems (expanded history, icons, running numbers, etc.)
        const preserveKnownComments = (line: string): string => buildPreservedNodeLineCommentSuffix(line);
        
        // Prepare main update
        const updates: { index: number, text: string }[] = [];
        
        if (node.isHub && node.variants) {
             const sortedVariants = [...node.variants].sort((a, b) => b.lineIndex - a.lineIndex);
             // Logic for Hub update...
             // If Hub, we update ALL variants names.
             sortedVariants.forEach(variant => {
                  // ... logic duplicated from original ...
                  // We need to reconstruct this part to be compatible with `updates` list
                 const match = lines[variant.lineIndex].match(/^(\s*)(.*)/);
                 const indent = match ? match[1] : '';
                 
                 let conditionSuffix = '';
                 if (variant.conditions) {
                     const parts = Object.entries(variant.conditions).map(([k, v]) => `${k}=${v}`);
                     conditionSuffix = ` (${parts.join(', ')})`;
                 }
                 if (variant.isCommon) conditionSuffix += ' #common#';
                 if (variant.isFlowNode) conditionSuffix += ' #flow#';
                 const preserved = preserveKnownComments(lines[variant.lineIndex] || '');
                 
                 updates.push({
                     index: variant.lineIndex,
                    text: `${indent}${encodeNewlines(valToSave)}${conditionSuffix}${preserved}`
                 });
             });
        } else {
           // Single node update
           const match = lines[node.lineIndex].match(/^(\s*)(.*)/);
           const indent = match ? match[1] : '';
           let suffix = '';
           
           if (node.conditions) {
               const parts = Object.entries(node.conditions).map(([k, v]) => `${k}=${v}`);
               suffix += ` (${parts.join(', ')})`;
           }
           
           if (node.isCommon) suffix += ' #common#';
           if (node.isFlowNode) suffix += ' #flow#';
           const preserved = preserveKnownComments(lines[node.lineIndex] || '');
           
           updates.push({
               index: node.lineIndex,
              text: `${indent}${encodeNewlines(valToSave)}${suffix}${preserved}`
           });
        }
        
        // Merge extra mutations (Common Sync)
        // Ensure mutations also preserve comment metadata.
        extraMutations.forEach((m) => {
          const preserved = preserveKnownComments(lines[m.index] || '');
          updates.push({ ...m, text: `${m.text}${preserved}` });
        });
        
        // Sort descending
        updates.sort((a, b) => b.index - a.index);
        
        // Apply
        doc.transact(() => {
             updates.forEach(u => {
                 const lineLength = lines[u.index].length;
                 // Calculate start index... costly?
                 // Recalculating start index for every line is slow and tricky if lengths change.
                 // Better: Replace string logic
             });
             
             // Simpler: Just reconstruct the string locally and replace all.
             updates.forEach(u => {
                 lines[u.index] = u.text;
             });
             
             yText.delete(0, yText.length);
             yText.insert(0, lines.join('\n'));
        });

        // Keep the flow-node running number registry stable across RENAMES.
        // The registry is used to resolve process node types (validation/branch/time/...) by running number.
        // If we don't update it here, a rename can break the (content+parentPath) match and cause types to
        // temporarily fall back to "step" until the user reassigns them.
        if (node.isFlowNode) {
          const runningNumber = getProcessNumber(node.id);
          if (typeof runningNumber === 'number' && Number.isFinite(runningNumber)) {
            upsertFlowNodeRegistryEntryByRunningNumber({
              doc,
              roots,
              node,
              nodeMap,
              runningNumber,
              content: valToSave,
            });
          }
        }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!editingNodeId) return;
    e.stopPropagation();

    const node = nodeMap.get(editingNodeId);
    if (!node) return;

    // Autocomplete (optional): Arrow keys + Enter to apply suggestion without committing edit.
    if (editSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEditSuggestionIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, editSuggestions.length - 1);
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEditSuggestionIndex((prev) => {
          if (prev === null) return editSuggestions.length - 1;
          return Math.max(prev - 1, -1);
        });
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (editSuggestionIndex !== null && editSuggestionIndex >= 0 && editSuggestionIndex < editSuggestions.length) {
          e.preventDefault();
          setEditValue(editSuggestions[editSuggestionIndex]);
          setEditSuggestionIndex(null);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        // Editing mode: Enter commits text only (does NOT create nodes).
        e.preventDefault();
        commitEdit(editValue);
        setEditingNodeId(null);
        setPendingAction({ lineIndex: node.lineIndex, type: 'select' });
    } 
    // Shift+Enter allows newline, don't prevent default
    else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(editValue);
        if (!e.shiftKey) {
            // Creating a new node can cause a re-layout; temporarily suppress position animation
            suppressAnimation();

            const tabCreatesSibling = layoutDirection === 'vertical';
            if (tabCreatesSibling) {
              // If Tab maps to sibling, preserve Flow-tab focused-root constraint.
              const isFocusedRoot = !!rootFocusId && node.id === rootFocusId;
              const action = isFocusedRoot
                ? structure.createChild(node, rawNodeMap, node.activeVariantId)
                : structure.createSibling(node, rawNodeMap, node.activeVariantId);
              if (action) {
                lastCreateRef.current = {
                  lineIndex: action.lineIndex,
                  kind: isFocusedRoot ? 'child' : 'sibling',
                  fromNodeId: node.id,
                };
                setPendingAction(action);
              }
            } else {
              const action = structure.createChild(node, rawNodeMap, node.activeVariantId);
              if (action) {
                lastCreateRef.current = { lineIndex: action.lineIndex, kind: 'child', fromNodeId: node.id };
                setPendingAction(action);
              }
            }
        }
        setEditingNodeId(null);
    }
    else if (e.key === 'Escape') {
        e.preventDefault();
        commitEdit(editValue);
        setEditingNodeId(null);
        setPendingAction({ lineIndex: node.lineIndex, type: 'select' });
    }
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
          e.preventDefault();
          if (selectedLineId) {
            setSelectedLineId(null);
          } else {
            onSelectNode(null);
          }
          return;
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected custom line (works with any tool)
        if (selectedLineId) {
          e.preventDefault();
          deleteLine(selectedLineId);
          return;
        }
        
        // Delete selected node
          if (selectedNodeId && !editingNodeId) {
              const node = nodeMap.get(selectedNodeId);
              if (node) {
                  e.preventDefault();
                  // Check safety
                  if (node.children.length > 0) {
                      setShakeNodeId(selectedNodeId);
                  } else {
                      const action = structure.deleteNode(node);
                      if (action.type === 'select' && action.targetId) onSelectNode(action.targetId);
                      else onSelectNode(null);
                  }
              }
          }
          return;
      }

      if (editingNodeId) return;
      const effectiveSelectedId = selectedNodeId || rootFocusId || null;
      if (!effectiveSelectedId) return;

      const node = nodeMap.get(effectiveSelectedId);
      if (!node) return;
      
      const isCmd = e.metaKey || e.ctrlKey;

      if (e.key === 'Enter') {
        e.preventDefault();
        onEnterCreate();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        onTabCreate();
        return;
      }
      
      // Navigation
      const navTarget = navigation.navigate(e.key, isCmd);
      if (navTarget) {
          e.preventDefault();
          onSelectNode(navTarget);
          // Follow keyboard selection changes.
          followKeyboardNavigation(navTarget);
          return;
      }
      
      // Structural Moves
      if (isCmd && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const direction = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'unindent' : 'indent';

          if (direction === 'unindent') {
            const blocked = getBlockedCmdUnindentReason(node, nodeMap);
            if (blocked) {
              setShakeNodeId(selectedNodeId);
              topToast.show(blocked.message);
              return;
            }
          }

          const action = structure.moveNodeStructure(node, direction, nodeMap); // Pass nodeMap!
          if (action) {
            // After structural moves, ids can change (lineIndex-derived). Center once the pending select resolves.
            requestFollowAfterPendingSelect();
            setPendingAction(action);
          }
      }
    
      if (e.key.length === 1 && !isCmd && !e.altKey && activeTool === 'select') {
        startEditing(node.id, e.key, false); 
        e.preventDefault();
      }
  };

  const cursorStyle =
    activeTool === 'node'
      ? 'cursor-crosshair'
      : activeTool === 'line'
        ? 'cursor-alias'
        : activeTool === 'comment' || activeTool === 'annotation'
          ? 'cursor-help'
          : 'cursor-default';

  const fitToContent = useCallback(
    (opts?: { resetZoom?: boolean; fitZoom?: boolean }) => {
      const el = containerRef.current;
      if (!el) return;
      const renderedIds = new Set<string>();
      flattenedNodes.forEach((n) => {
        if (isNodeRendered(n) && layout[n.id]) renderedIds.add(n.id);
      });
      const entries = Array.from(renderedIds)
        .map((id) => layout[id])
        .filter(
          (l): l is NodeLayout =>
            !!l &&
            Number.isFinite(l.x) &&
            Number.isFinite(l.y) &&
            Number.isFinite(l.width) &&
            Number.isFinite(l.height),
        );
      if (entries.length === 0) {
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      entries.forEach((l) => {
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + l.width);
        maxY = Math.max(maxY, l.y + l.height);
      });
      if (minX === Infinity) return;
      const { clientWidth, clientHeight } = el;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const PAD = 80; // screen padding around fitted content (px)
      const MIN_SCALE = 0.1;
      const MAX_SCALE = 5;

      const computeFitScale = () => {
        const w = Math.max(1, contentWidth + PAD * 2);
        const h = Math.max(1, contentHeight + PAD * 2);
        const s = Math.min(clientWidth / w, clientHeight / h);
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      };

      const nextScale = opts?.fitZoom ? computeFitScale() : opts?.resetZoom ? 1 : scale;
      if (opts?.fitZoom || opts?.resetZoom) setScale(nextScale);

      // screen = world * scale + offset  => offset = (screenCenter - worldCenter*scale)
      setOffset({
        x: (clientWidth - contentWidth * nextScale) / 2 - minX * nextScale,
        y: (clientHeight - contentHeight * nextScale) / 2 - minY * nextScale,
      });
      initializedRef.current = true;
      pendingViewportFitRef.current = false;
    },
    [flattenedNodes, isNodeRendered, layout, scale, topToast],
  );
  // Allow earlier effects to invoke the latest fitToContent callback.
  fitToContentRef.current = fitToContent;

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full mac-canvas-bg overflow-hidden outline-none ${cursorStyle}`}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        focusOnPointerEvent(target);

        if (activeTool !== 'select') return;
        if (target.closest('[data-nexus-node]')) return;
        if (target.closest('[data-expanded-node]')) return;
        const isAdd = e.shiftKey || e.metaKey || e.ctrlKey;
        startMarquee(e.clientX, e.clientY, isAdd);
      }}
      onClick={(e) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        // Don't handle canvas click if clicking on expanded nodes or background sections
        const target = e.target as HTMLElement;
        if (target.closest('[data-expanded-node]')) {
          return; // Don't handle clicks on expanded nodes
        }
        if (target.closest('[data-hub-group]') || target.closest('[data-process-flow-group]')) {
          return; // Don't handle clicks on background sections (they have their own handlers)
        }
        
        // Deselect line when clicking on canvas (check if click is on canvas, not on a node or line)
        if (selectedLineId && (e.target === e.currentTarget || (e.target as Element).tagName === 'svg')) {
          setSelectedLineId(null);
        }
        // Don't handle canvas click if we're in the middle of line drawing
        if (activeTool === 'line' && draggingLineFrom) {
          // Let the node's onMouseUp handle it
          return;
        }
        handleCanvasClick(e);
        setAnnotationEditorForId(null);
        // Cancel line drawing if clicking on canvas (but not during line tool)
        if (draggingLineFrom) {
          setDraggingLineFrom(null);
          setMousePos(null);
        }
      }}
      onMouseMove={(e) => {
        // Update preview line position while dragging
        if (draggingLineFrom && activeTool === 'line') {
          const pt = clientToWorld(e.clientX, e.clientY);
          if (pt) setMousePos({ x: pt.x, y: pt.y });
        } else if (isMarqueeActive && activeTool === 'select') {
          moveMarquee(e.clientX, e.clientY);
        } else {
          setMousePos(null);
        }

        // Multiplayer cursor (world-space)
        const pt = clientToWorld(e.clientX, e.clientY);
        if (pt && presence) presence.setCursor(pt);
      }}
      onMouseUp={() => {
        if (isMarqueeActive && activeTool === 'select') {
          endMarquee();
        }
        // If user releases on empty canvas (not on a node), cancel the preview/ghost line.
        if (activeTool === 'line' && draggingLineFrom) {
          setDraggingLineFrom(null);
          setMousePos(null);
        }
      }}
      onMouseLeave={() => {
        if (isMarqueeActive && activeTool === 'select') {
          cancelMarquee();
        }
        // Cancel line drawing if mouse leaves canvas
        if (draggingLineFrom) {
          setDraggingLineFrom(null);
          setMousePos(null);
        }
        if (presence) presence.setCursor(null);
      }}
      onDragOver={(e) => handleDragOver(e)} 
      onKeyDown={handleContainerKeyDown}
      onWheel={handleWheel}
      tabIndex={0} 
    >
      {roots.length > 0 && Object.keys(layout).length === 0 ? (
        <div className="pointer-events-none absolute left-4 top-4 z-50">
          <div className="rounded-md border border-amber-200 bg-white/95 px-3 py-2 text-[12px] text-amber-900 shadow-sm">
            <div className="font-semibold">Nodes parsed, but layout is empty.</div>
            <div className="mt-1 text-amber-800">
              Try reloading; if this persists, the layout engine may be producing invalid positions.
            </div>
          </div>
        </div>
      ) : null}
       {/* Top toast for blocked keyboard actions */}
       <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-50">
         {topToast.message && (
           <div className="rounded-md border border-red-200 bg-white/95 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">
             {topToast.message}
           </div>
         )}
       </div>

       {/* Multiplayer cursors (screen-space overlay) */}
       {presence?.peers?.length ? (
         <div className="pointer-events-none absolute inset-0 z-50">
           {presence.peers
             .filter((p) => p.state?.view === effectivePresenceView && p.state?.cursor)
             .map((p) => {
               const c = p.state.cursor!;
               const x = c.x * scale + offset.x;
               const y = c.y * scale + offset.y;
               return (
                 <div key={`cursor-${p.clientId}`} className="absolute" style={{ left: x, top: y }}>
                   <div className="w-3 h-3 border border-black bg-white mac-shadow-hard" />
                   <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] mac-double-outline ${p.state.user.badgeClass}`}>
                     <span className="font-semibold">{p.state.user.name}</span>
                   </div>
                 </div>
               );
             })}
         </div>
       ) : null}
       <h3 className="absolute top-4 left-4 text-xs font-bold uppercase tracking-wider text-gray-500 z-10 select-none">Visual Map</h3>

       {/* Marquee overlay is drawn in world-space (inside viewport SVG), see below. */}
      
      <div 
        className="absolute left-0 top-0 origin-top-left transition-transform duration-75 ease-out will-change-transform"
        ref={viewportRef}
        // Important: transform order matters for hit-testing math.
        // We want: screen = world * scale + offset, so world = (screen - offset) / scale.
        // CSS applies transforms right-to-left, so we must write `translate(...) scale(...)`
        // to ensure translation is NOT scaled and stays in screen pixels.
        style={{ transformOrigin: '0 0', transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {/* Swimlane overlay (Flow tab): lanes/stages headers + bands */}
        {swimlaneLayout && (
          <div className="pointer-events-none">
            {(() => {
              const ROW_MIN_H = DIAMOND_SIZE;
              const laneW = 6000;
              const stageCount = Math.max(
                1,
                swimlaneBands?.stageWidths.length ?? swimlaneLayout.stages.length,
              );

              // Use stable band positions (match the swimlaneLayout transform in the layout effect).
              const STAGE_STRIDE = NODE_WIDTH + 100;
              const LANE_STRIDE = Math.max(DIAMOND_SIZE, 260) + 80;
              const LANE_GUTTER_W = swimlaneBands?.laneGutterW ?? 140;
              const HEADER_H = swimlaneBands?.headerH ?? 28;

              const laneIndexById = new Map<string, number>(
                swimlaneLayout.lanes.map((l, idx) => [l.id, idx]),
              );
              const defaultLaneId = swimlaneLayout.lanes[0]?.id || 'branch-1';
              const getLaneIdx = (nodeId: string) => {
                const laneId = swimlaneLayout.nodeToLaneId[nodeId] || defaultLaneId;
                return laneIndexById.get(laneId) ?? 0;
              };

              const laneCount = Math.max(1, swimlaneLayout.lanes.length);
              const laneEndY = (() => {
                if (swimlaneBands && laneCount > 0) {
                  const lastIdx = laneCount - 1;
                  return (swimlaneBands.laneTops[lastIdx] ?? 0) + (swimlaneBands.laneHeights[lastIdx] ?? LANE_STRIDE);
                }
                return laneCount * LANE_STRIDE;
              })();
              const stageEndX = (() => {
                if (swimlaneBands && stageCount > 0) {
                  const lastIdx = stageCount - 1;
                  return (swimlaneBands.stageLefts[lastIdx] ?? 0) + (swimlaneBands.stageWidths[lastIdx] ?? STAGE_STRIDE);
                }
                return stageCount * STAGE_STRIDE;
              })();
              const getStageBoundaryX = (idx: number) => {
                if (idx === stageCount) return stageEndX;
                return swimlaneBands?.stageLefts[idx] ?? idx * STAGE_STRIDE;
              };
              const getLaneBoundaryY = (idx: number) => {
                if (idx === laneCount) return laneEndY;
                return swimlaneBands?.laneTops[idx] ?? idx * LANE_STRIDE;
              };

              return (
                <>
                  {/* Grid lines (flat, no background fills) */}
                  {Array.from({ length: stageCount + 1 }).map((_, idx) => (
                    <div
                      key={`stage-grid-${idx}`}
                      className="absolute bg-black"
                      style={{
                        left: getStageBoundaryX(idx),
                        top: 0,
                        width: 2,
                        height: Math.max(laneEndY, 600),
                      }}
                    />
                  ))}
                  {Array.from({ length: laneCount + 1 }).map((_, idx) => (
                    <div
                      key={`lane-grid-${idx}`}
                      className="absolute bg-black"
                      style={{
                        left: -LANE_GUTTER_W,
                        top: getLaneBoundaryY(idx),
                        height: 2,
                        width: Math.max(laneW + LANE_GUTTER_W + 80, stageEndX + LANE_GUTTER_W + 80),
                      }}
                    />
                  ))}

                  {/* Lane bands */}
                  {swimlaneLayout.lanes.map((lane, idx) => (
                    <div
                      key={lane.id}
                      className="group absolute"
                      style={{
                        left: -LANE_GUTTER_W,
                        top: swimlaneBands?.laneTops[idx] ?? idx * LANE_STRIDE,
                        width: laneW + LANE_GUTTER_W + 80,
                        height: swimlaneBands?.laneHeights[idx] ?? LANE_STRIDE,
                      }}
                      onClick={(e) => {
                        // Allow clicking the lane band background to select insertion lane.
                        e.stopPropagation();
                        swimlaneActions?.onSetInsertTarget?.({
                          laneId: lane.id,
                          stage: swimlaneLayout.insertTarget?.stage ?? 0,
                        });
                      }}
                    >
                      {/* Lane label pill (interactive) */}
                      {(() => {
                        const isActiveLane =
                          !!swimlaneLayout.showInsertTargetUI &&
                          swimlaneLayout.insertTarget?.laneId === lane.id;
                        return (
                          <>
                            <div
                              className={`pointer-events-auto absolute left-10 top-2 inline-flex items-center gap-2 px-2 py-1 text-[10px] font-semibold ${
                                isActiveLane ? 'mac-double-outline mac-shadow-hard mac-fill--hatch text-black' : 'opacity-70'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                swimlaneActions?.onSetInsertTarget?.({
                                  laneId: lane.id,
                                  stage: swimlaneLayout.insertTarget?.stage ?? 0,
                                });
                              }}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setSwimlaneRename({
                                  kind: 'lane',
                                  laneId: lane.id,
                                  value: lane.label,
                                  left: -LANE_GUTTER_W + 8,
                                  top: (swimlaneBands?.laneTops[idx] ?? idx * LANE_STRIDE) + 8,
                                  width: 220,
                                });
                              }}
                              title="Click to set insertion lane; double-click to rename"
                            >
                              <span>{lane.label}</span>
                              {isActiveLane ? (
                                <button
                                  type="button"
                                  className={`h-5 w-5 border ${
                                    swimlaneActions?.canDeleteLaneIds?.has(lane.id)
                                      ? ''
                                      : 'opacity-40 cursor-not-allowed'
                                  }`}
                                  title={
                                    swimlaneActions?.canDeleteLaneIds?.has(lane.id)
                                      ? 'Delete lane'
                                      : 'Cannot delete lane (has nodes or last lane)'
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!swimlaneActions?.canDeleteLaneIds?.has(lane.id)) return;
                                    swimlaneActions?.onDeleteLane?.(lane.id);
                                  }}
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>

                            {/* Lane controls: plus buttons at inferred insert locations (top-left / bottom-left) */}
                            <div
                              className={`pointer-events-auto absolute left-2 top-2 flex items-center gap-1 transition-opacity ${
                                isActiveLane
                                  ? 'opacity-100'
                                  : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                              }`}
                            >
                              <button
                                type="button"
                                className="h-6 w-6 border"
                                title="Insert lane above"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  swimlaneActions?.onInsertLane?.(idx);
                                }}
                              >
                                +
                              </button>
                            </div>
                            <div
                              className={`pointer-events-auto absolute left-2 bottom-1 flex items-center gap-1 transition-opacity ${
                                isActiveLane
                                  ? 'opacity-100'
                                  : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                              }`}
                            >
                              <button
                                type="button"
                                className="h-6 w-6 border"
                                title="Insert lane below"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  swimlaneActions?.onInsertLane?.(idx + 1);
                                }}
                              >
                                +
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}

                  {/* Stage headers */}
                  {Array.from({ length: stageCount }).map((_, idx) => {
                    const stage = swimlaneLayout.stages[idx] || { id: `stage-${idx + 1}`, label: `Stage ${idx + 1}` };
                    const left = swimlaneBands?.stageLefts[idx] ?? idx * STAGE_STRIDE;
                    const isActiveStage =
                      !!swimlaneLayout.showInsertTargetUI &&
                      swimlaneLayout.insertTarget?.stage === idx;
                    return (
                      <div
                        key={stage.id}
                        className={`group pointer-events-auto absolute z-30 text-[10px] font-semibold ${
                          isActiveStage ? 'text-slate-900' : 'text-slate-500'
                        }`}
                        style={{
                          left,
                          top: -HEADER_H,
                          width: Math.max(NODE_WIDTH, (swimlaneBands?.stageWidths[idx] ?? STAGE_STRIDE) - 8),
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          swimlaneActions?.onSetInsertTarget?.({
                            laneId: swimlaneLayout.insertTarget?.laneId || defaultLaneId,
                            stage: idx,
                          });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSwimlaneRename({
                            kind: 'stage',
                            stageIndex: idx,
                            value: stage.label,
                            left,
                            top: -HEADER_H - 4,
                            width: 220,
                          });
                        }}
                        title="Click to set insertion stage; double-click to rename"
                      >
                        <div
                          className="relative inline-flex items-center gap-2 px-2 py-0.5"
                          style={{ minHeight: HEADER_H - 4 }}
                        >
                          {/* Insert-before (left edge) */}
                          <button
                            type="button"
                            className={`absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 border transition-opacity ${
                              isActiveStage
                                ? 'opacity-100'
                                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                            }`}
                            title="Insert stage before"
                            onClick={(e) => {
                              e.stopPropagation();
                              swimlaneActions?.onInsertStage?.(idx);
                            }}
                          >
                            +
                          </button>

                          <span
                            className={`inline-flex items-center gap-2 ${
                              isActiveStage ? 'mac-double-outline mac-shadow-hard mac-fill--hatch text-black' : 'opacity-70'
                            }`}
                          >
                            <span>{stage.label}</span>
                            {isActiveStage ? (
                              <button
                                type="button"
                                className={`h-5 w-5 border ${
                                  swimlaneActions?.canDeleteStageIdxs?.has(idx)
                                    ? ''
                                    : 'opacity-40 cursor-not-allowed'
                                }`}
                                title={
                                  swimlaneActions?.canDeleteStageIdxs?.has(idx)
                                    ? 'Delete stage'
                                    : 'Cannot delete stage (has nodes or last stage)'
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!swimlaneActions?.canDeleteStageIdxs?.has(idx)) return;
                                  swimlaneActions?.onDeleteStage?.(idx);
                                }}
                              >
                                ×
                              </button>
                            ) : null}
                          </span>

                          {/* Insert-after (right edge) */}
                          <button
                            type="button"
                            className={`absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 border transition-opacity ${
                              isActiveStage
                                ? 'opacity-100'
                                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                            }`}
                            title="Insert stage after"
                            onClick={(e) => {
                              e.stopPropagation();
                              swimlaneActions?.onInsertStage?.(idx + 1);
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Inline rename editor (prompt() is not supported in this runtime) */}
                  {swimlaneRename ? (
                    <div
                      className="pointer-events-auto absolute z-50"
                      style={{
                        left: swimlaneRename.left,
                        top: swimlaneRename.top,
                        width: swimlaneRename.width,
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={swimlaneRename.value}
                        onChange={(e) =>
                          setSwimlaneRename((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setSwimlaneRename(null);
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = swimlaneRename.value.trim();
                            if (val) {
                              if (swimlaneRename.kind === 'lane') {
                                swimlaneActions?.onRenameLane?.(swimlaneRename.laneId, val);
                              } else {
                                swimlaneActions?.onRenameStage?.(swimlaneRename.stageIndex, val);
                              }
                            }
                            setSwimlaneRename(null);
                          }
                        }}
                        onBlur={() => {
                          const val = swimlaneRename.value.trim();
                          if (val) {
                            if (swimlaneRename.kind === 'lane') {
                              swimlaneActions?.onRenameLane?.(swimlaneRename.laneId, val);
                            } else {
                              swimlaneActions?.onRenameStage?.(swimlaneRename.stageIndex, val);
                            }
                          }
                          setSwimlaneRename(null);
                        }}
                        className="mac-field h-7 w-full"
                        placeholder="Name…"
                      />
                      <div className="mt-1 text-[10px] text-slate-400">Enter to save · Esc to cancel</div>
                    </div>
                  ) : null}

                  {/* (Grid lines are drawn above) */}
                </>
              );
            })()}
          </div>
        )}
        {/* Process Flow Background Sections (hide in Flow tab swimlane view) */}
        {!swimlaneLayout &&
          processFlowGroups.map(({ rootProcessNode, bounds }) => {
          const processNodeStyle = styleMap.get(rootProcessNode.id);
          const { groupClass } = getHubGroupStyle(processNodeStyle?.hueIndex);

          return (
            <div
              key={`process-flow-group-${rootProcessNode.id}`}
              data-process-flow-group={rootProcessNode.id}
              className={`absolute ${groupClass} hover:shadow-sm transition-shadow duration-150`}
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                pointerEvents: 'none',
              }}
            >
              {/* Background area for clicking to select root process node (but not blocking expanded nodes) */}
              <div
                className="absolute inset-0 cursor-pointer"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => {
                  // If we just did a marquee selection, don't treat this as a click-to-select-group.
                  if (suppressNextClickRef.current) return;
                  // Don't handle clicks if clicking on an expanded node or its children
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-expanded-node]')) {
                    return;
                  }
                  e.stopPropagation();
                  onSelectNode(rootProcessNode.id);
                }}
              />
            </div>
          );
        })}

        {/* Conditional Hub Enclosures */}
        {hubGroups.map(({ hub, bounds }) => {
          const keyValueMap = getHubConditionDimensions(hub);
          const selectedConditions = activeVariantState[hub.id] || {};
          const keys = Array.from(keyValueMap.keys()).sort();
          const hubNote = conditionalHubNoteIndex.getNoteForHub(hub);
          const hasHubNote = !!hubNote && (!!hubNote.dependencies.trim() || !!hubNote.impact.trim());

          const hubStyle = styleMap.get(hub.id);
          const { groupClass, headerClass } = getHubGroupStyle(hubStyle?.hueIndex);

          return (
            <div
              key={`hub-group-${hub.id}`}
              className={`absolute ${groupClass} hover:shadow-sm transition-shadow duration-150`}
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
                pointerEvents: 'none',
              }}
            >
              {/* Background area for clicking to select hub (but not blocking header or expanded nodes) */}
              <div
                className="absolute inset-0 cursor-pointer"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => {
                  // If we just did a marquee selection, don't treat this as a click-to-select-group.
                  if (suppressNextClickRef.current) return;
                  // Only handle clicks if they're not on the header or on expanded nodes
                  const target = e.target as HTMLElement;
                  if (target.closest('[data-hub-header]')) {
                    return;
                  }
                  if (target.closest('[data-hub-notes-popover]') || target.closest('[data-hub-notes-summary]')) {
                    return;
                  }
                  // Don't handle clicks if clicking on an expanded node or its children
                  if (target.closest('[data-expanded-node]')) {
                    return;
                  }
                  e.stopPropagation();
                  onSelectNode(hub.id);
                }}
              />
              {/* Header with condition dropdowns */}
              <div
                data-hub-header
                className={`absolute top-0 left-0 flex items-center gap-2 text-white text-[10px] font-semibold px-2 py-1 rounded-tl-md rounded-br-md max-w-full ${headerClass}`}
                style={{ pointerEvents: 'auto', zIndex: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(hub.id);
                }}
              >
                {keys.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {keys.map((key) => {
                        const values = Array.from(keyValueMap.get(key) || []).sort();
                        const selectedValue = selectedConditions[key] || values[0] || '';

                        return (
                          <select
                            key={key}
                            value={selectedValue}
                            onChange={(e) => handleKeyValueSelect(e, hub.id, key)}
                            onClick={(e) => e.stopPropagation()}
                            className="px-1.5 py-0.5 text-[9px] bg-transparent border border-white/70 text-white rounded hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white cursor-pointer"
                          >
                            <option value="" disabled>
                              {key}
                            </option>
                            {values.map((val) => (
                              <option key={val} value={val}>
                                {val}
                              </option>
                            ))}
                          </select>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMatrixHubId(hub.id);
                      }}
                      className="p-0.5 hover:bg-white/20 rounded transition-colors"
                      title="View condition matrix"
                    >
                      <Eye size={10} className="text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const current = conditionalHubNoteIndex.getNoteForHub(hub);
                        setHubNotesDraft({
                          dependencies: current?.dependencies || '',
                          impact: current?.impact || '',
                        });
                        setHubNotesOpenForId((prev) => (prev === hub.id ? null : hub.id));
                      }}
                      className={`p-0.5 rounded transition-colors ${hasHubNote ? 'bg-white/15 hover:bg-white/25' : 'hover:bg-white/20'}`}
                      title="Dependencies & impact"
                    >
                      <AlertTriangle size={10} className="text-white" />
                    </button>
                  </>
                )}
              </div>

              {/* Notes summary box */}
              {hasHubNote ? (
                <div
                  data-hub-notes-summary
                  className="absolute left-2 top-8 max-w-[360px] mac-popover mac-double-outline mac-shadow-hard text-[11px] px-2 py-2"
                  style={{ pointerEvents: 'auto', zIndex: 2 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHubNotesExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(hub.id)) next.delete(hub.id);
                      else next.add(hub.id);
                      return next;
                    });
                  }}
                >
                  <div
                    className={`space-y-2 pr-1 ${
                      hubNotesExpandedIds.has(hub.id) ? 'max-h-40 overflow-auto' : 'max-h-[2.8em] overflow-hidden'
                    }`}
                  >
                    {hubNote?.dependencies?.trim() ? (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          Dependencies
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap text-[11px]">
                          {hubNote.dependencies.trim()}
                        </div>
                      </div>
                    ) : null}
                    {hubNote?.impact?.trim() ? (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          Impact
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap text-[11px]">
                          {hubNote.impact.trim()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Notes popover */}
              {hubNotesOpenForId === hub.id ? (
                <div
                  data-hub-notes-popover
                  className="absolute left-2 top-8 w-[380px] mac-window overflow-hidden"
                  style={{ pointerEvents: 'auto', zIndex: 2 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mac-titlebar">
                    <div className="mac-title">Dependencies &amp; Impact</div>
                  </div>
                  <div className="p-2">
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Dependencies</div>
                  <textarea
                    value={hubNotesDraft.dependencies}
                    onChange={(e) => setHubNotesDraft((p) => ({ ...p, dependencies: e.target.value }))}
                    onMouseDown={(e) => e.stopPropagation()}
                    rows={3}
                    className="w-full mac-field text-[11px]"
                    placeholder="What does this depend on?"
                  />
                  <div className="text-[10px] uppercase tracking-wide opacity-70 mt-2 mb-1">Impact</div>
                  <textarea
                    value={hubNotesDraft.impact}
                    onChange={(e) => setHubNotesDraft((p) => ({ ...p, impact: e.target.value }))}
                    onMouseDown={(e) => e.stopPropagation()}
                    rows={3}
                    className="w-full mac-field text-[11px]"
                    placeholder="What is the impact?"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setHubNotesOpenForId(null)}
                      className="mac-btn"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        upsertConditionalHubNote({
                          doc,
                          hub,
                          dependencies: hubNotesDraft.dependencies,
                          impact: hubNotesDraft.impact,
                          nodeMap,
                          roots,
                        });
                        setHubNotesOpenForId(null);
                      }}
                      className="mac-btn mac-btn--primary"
                    >
                      Save
                    </button>
                  </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Loop sections (optional) */}
        {!swimlaneLayout &&
          Object.entries(loopTargets).map(([loopNodeId, targetId]) => {
            if (!loopNodeId || !targetId) return null;
            if ((processNodeTypes[loopNodeId] || 'step') !== 'loop') return null;

            // Only show when this process flow is in "show flow" mode
            const rootId = getRootProcessNodeId(loopNodeId);
            if (rootId && !processFlowModeNodes?.has(rootId)) return null;
            if (!isNodeVisible(loopNodeId) || !isNodeVisible(targetId)) return null;
            if (!isDescendantOfLocal(loopNodeId, targetId)) return null;

            const fromNode = nodeMap.get(loopNodeId);
            const toNode = nodeMap.get(targetId);
            const fromLayout = animatedLayout[loopNodeId];
            const toLayout = animatedLayout[targetId];
            if (!fromNode || !toNode || !fromLayout || !toLayout) return null;

            const from = getRenderedRectForMainCanvasNode({
              node: fromNode,
              layout: fromLayout,
              processNodeType: processNodeTypes[loopNodeId] || 'step',
              showFlowOn: isShowFlowOnForNode(loopNodeId),
            });
            const to = getRenderedRectForMainCanvasNode({
              node: toNode,
              layout: toLayout,
              processNodeType: processNodeTypes[targetId] || 'step',
              showFlowOn: isShowFlowOnForNode(targetId),
            });
            if (!from || !to) return null;

            const bounds = computePaddedSpanBounds({ from, to, pad: 18 });

            return (
              <div
                key={`loop-section-${loopNodeId}-${targetId}`}
                className="absolute rounded-md mac-double-outline mac-fill--dots-3 opacity-60"
                style={{
                  left: bounds.left,
                  top: bounds.top,
                  width: bounds.width,
                  height: bounds.height,
                  pointerEvents: 'none',
                }}
              />
            );
          })}

        <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible">
            <defs>
              <marker
                id="arrowhead-light"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#000000" stroke="#000000" strokeWidth="1" />
              </marker>
              <marker
                id="arrowhead-gray"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <polygon points="0 0, 8 4, 0 8" fill="#000000" stroke="#000000" strokeWidth="1" />
              </marker>
            </defs>
            {/* eslint-disable-next-line react-hooks/refs */}
            {flattenedNodes.map(node => {
                if (!node.parentId) return null;
                if (!isNodeVisible(node.id)) return null;
                if (!isNodeVisible(node.parentId)) return null;
                
                // Hide connectors for children of collapsed process nodes (when process flow mode is off)
                if (isChildOfCollapsedProcess(node)) return null;
                
                const parentLayout = animatedLayout[node.parentId];
                const childLayout = animatedLayout[node.id];
                if (!parentLayout || !childLayout) return null;

                // Check if this is a connector between process nodes within the same process flow
                // (both parent and child must be descendants of the same root process node)
                const parentNode = nodeMap.get(node.parentId);
                const dimConnector = isNodeDimmed(node) || (parentNode ? isNodeDimmed(parentNode) : false);
                const isProcessConnector = (() => {
                  if (!parentNode?.isFlowNode || !node.isFlowNode) return false;
                  
                  // Find root process node for parent
                  let parentRoot: NexusNode | null = parentNode || null;
                  let checkParent: NexusNode | null = parentNode || null;
                  while (checkParent) {
                    if (checkParent.isFlowNode) {
                      parentRoot = checkParent;
                      const parentId = checkParent.parentId;
                      if (!parentId) break;
                      const parent = nodeMap.get(parentId);
                      if (!parent || !parent.isFlowNode) break;
                      checkParent = parent;
                    } else {
                      break;
                    }
                  }
                  
                  // Find root process node for child
                  let childRoot: NexusNode | null = node || null;
                  let checkChild: NexusNode | null = node || null;
                  while (checkChild) {
                    if (checkChild.isFlowNode) {
                      childRoot = checkChild;
                      const parentId = checkChild.parentId;
                      if (!parentId) break;
                      const parent = nodeMap.get(parentId);
                      if (!parent || !parent.isFlowNode) break;
                      checkChild = parent;
                    } else {
                      break;
                    }
                  }
                  
                  // Both must be in the same process flow (same root)
                  return parentRoot && childRoot && parentRoot.id === childRoot.id;
                })();
                
                // Only show connector labels when process flow mode is enabled for the root
                const rootProcessNode = (() => {
                  if (!parentNode) return null;
                  let root: NexusNode | null = parentNode;
                  let check: NexusNode | null = parentNode;
                  while (check) {
                    if (check.isFlowNode) {
                      root = check;
                      const parentId = check.parentId;
                      if (!parentId) break;
                      const parent = nodeMap.get(parentId);
                      if (!parent || !parent.isFlowNode) break;
                      check = parent;
                    } else {
                      break;
                    }
                  }
                  return root;
                })();
                
                const isProcessFlowModeEnabled = rootProcessNode && processFlowModeNodes?.has(rootProcessNode.id);
                
                const connectorKey = `${node.parentId}__${node.id}`;
                let label = (isProcessConnector && isProcessFlowModeEnabled) ? connectorLabels[connectorKey] : undefined;
                
                // Get parent and child node types for diamond corner calculations
                const parentType = parentNode ? processNodeTypes[parentNode.id] : undefined;
                const childType = processNodeTypes[node.id];
                
                // Determine child index for validation nodes (to determine which corner to use)
                let childIndex = 0;
                if (parentNode && parentType === 'validation') {
                  const parentChildren = parentNode.children;
                  childIndex = parentChildren.findIndex(c => c.id === node.id);
                }
                
                // Auto-label validation node connectors with Yes/No
                if (isProcessConnector && parentNode && !label) {
                  if (parentType === 'validation') {
                    const newLabels = { ...connectorLabels };
                    if (childIndex === 0) {
                      // First child = Yes (monochrome)
                      newLabels[connectorKey] = { label: 'Yes', color: '#000000' };
                      label = newLabels[connectorKey];
                      // Schedule save after render to avoid setState during render
                      pendingConnectorLabelsRef.current = newLabels;
                    } else if (childIndex === 1) {
                      // Second child = No (monochrome)
                      newLabels[connectorKey] = { label: 'No', color: '#000000' };
                      label = newLabels[connectorKey];
                      // Schedule save after render to avoid setState during render
                      pendingConnectorLabelsRef.current = newLabels;
                    }
                  }
                }
                
                // Get connection points using diamond corners for validation/branch nodes
                // For diamonds, use the actual diamond position and size
                const parentIsDiamond = parentType === 'validation' || parentType === 'branch';
                const childIsDiamond = childType === 'validation' || childType === 'branch';
                const parentDiamondSize = parentIsDiamond ? Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, parentLayout.height)) : DIAMOND_SIZE;
                const childDiamondSize = childIsDiamond ? Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, childLayout.height)) : DIAMOND_SIZE;
                const parentX = parentIsDiamond ? parentLayout.x + (parentLayout.width - parentDiamondSize) / 2 : parentLayout.x;
                const parentY = parentIsDiamond ? parentLayout.y : parentLayout.y; // Diamond is positioned at top corner
                const childX = childIsDiamond ? childLayout.x + (childLayout.width - childDiamondSize) / 2 : childLayout.x;
                // Diamonds are positioned using `layout.y` as the **top corner** (not vertically centered),
                // so connector math must use that same origin.
                const childY = childIsDiamond ? childLayout.y : childLayout.y;
                
                const startPoint = getOutgoingConnectionPoint(
                  parentType,
                  parentX,
                  parentY,
                  parentIsDiamond ? parentDiamondSize : parentLayout.width,
                  parentIsDiamond ? parentDiamondSize : parentLayout.height,
                  childIndex,
                  layoutDirection,
                );
                const endPoint = getIncomingConnectionPoint(
                  childType,
                  childX,
                  childY,
                  childIsDiamond ? childDiamondSize : childLayout.width,
                  childIsDiamond ? childDiamondSize : childLayout.height,
                  layoutDirection,
                );
                let startX = startPoint.x;
                let startY = startPoint.y;
                const endX = endPoint.x;
                const endY = endPoint.y;

                // If parent is currently expanded AND this child node is linked to a data object,
                // reattach the connector to the corresponding inner grid node (auto-synced by child data object).
                // When parent is collapsed, we fall back to the normal parent connector.
                const reattached = reattachStartToExpandedBorder({
                  parentId: node.parentId,
                  parentLayout,
                  end: { x: endX, y: endY },
                  childDataObjectId: node.dataObjectId,
                  expandedNodes,
                  anchorsByParentAndDoId: expandedInnerAnchorByParentAndDoId,
                });
                if (reattached) {
                  // Start the main connector at the expanded card border so it isn't hidden underneath.
                  // A short stub (inner anchor -> border) is rendered above the card.
                  startX = reattached.x;
                  startY = reattached.y;
                }
                
                const { pathD, mid } =
                  parentType === 'validation'
                    ? buildValidationConnectorBezier({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        childIndex,
                        layoutDirection,
                      })
                    : buildStandardConnectorBezier({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        layoutDirection,
                      });
                const midX = mid.x;
                const midY = mid.y;

                // Special visual behavior: when a process-flow "goto" node is collapsed into a fake line,
                // the incoming connector should NOT render an arrowhead.
                const hideArrowForCollapsedGoto =
                  isProcessConnector &&
                  isProcessFlowModeEnabled &&
                  childType === 'goto' &&
                  !!gotoTargets[node.id] &&
                  selectedNodeId !== node.id &&
                  isShowFlowOnForNode(node.id);
                
                return (
                    <g key={`${node.parentId}-${node.id}`}>
                        <path 
                            d={pathD}
                            stroke="#000000"
                            strokeWidth={selectedNodeId === node.id || dropTargetId === node.id ? '2' : '1.5'}
                            fill="none"
                            markerEnd={
                              isProcessConnector && !hideArrowForCollapsedGoto ? "url(#arrowhead-light)" : undefined
                            }
                            className={transitionClasses}
                            style={{ pointerEvents: (isProcessConnector && isProcessFlowModeEnabled) ? 'stroke' : 'none', cursor: (isProcessConnector && isProcessFlowModeEnabled) ? 'pointer' : 'default' }}
                            opacity={dimConnector ? 0.3 : 1}
                            onDoubleClick={(e) => {
                              if (isProcessConnector && isProcessFlowModeEnabled && node.parentId) {
                                e.stopPropagation();
                                e.preventDefault();
                                setEditingConnector({ fromId: node.parentId, toId: node.id });
                                setEditingConnectorValue(label?.label || '');
                              }
                            }}
                        />
                        {label && label.label && (
                          <g>
                            <rect
                              x={midX - 40}
                              y={midY - 10}
                              rx={0}
                              ry={0}
                              width={80}
                              height={20}
                              fill="#000000"
                              style={{ cursor: 'pointer' }}
                              pointerEvents="all"
                              onDoubleClick={(e) => {
                                if (isProcessConnector && isProcessFlowModeEnabled && node.parentId) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setEditingConnector({ fromId: node.parentId, toId: node.id });
                                  setEditingConnectorValue(label.label || '');
                                }
                              }}
                            />
                            <text
                              x={midX}
                              y={midY + 3}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize={10}
                              pointerEvents="none"
                            >
                              {label.label}
                            </text>
                          </g>
                        )}
                    </g>
                );
            })}
            
            {/* Render dotted lines for goto nodes */}
            {flattenedNodes.map(node => {
              const processNodeType = processNodeTypes[node.id];
              if (processNodeType !== 'goto') return null;

              // Hide goto connectors when this process flow's "show flow" mode is OFF.
              if (!isShowFlowOnForNode(node.id)) return null;
              
              const targetId = gotoTargets[node.id];
              if (!targetId) return null;

              if (!isNodeVisible(node.id) || !isNodeVisible(targetId)) return null;
              
              const sourceLayout = animatedLayout[node.id];
              const targetLayout = animatedLayout[targetId];
              if (!sourceLayout || !targetLayout) return null;

              const isCollapsedGoto = selectedNodeId !== node.id;
              const isGotoSelected = selectedNodeId === node.id;

              // When collapsed, the "goto node" is rendered as:
              // - a bridge line across the node's box (left → right)
              // - a solid redirect line from the right edge to the target
              // The incoming connector's arrowhead is suppressed elsewhere.
              if (isCollapsedGoto) {
                const { bridgePath, redirectPath } = buildCollapsedGotoPaths({
                  source: sourceLayout,
                  target: targetLayout,
                  layoutDirection,
                });

                const handleExpand = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelectNode(node.id);
                };

                const dim =
                  (nodeMap.get(node.id) ? isNodeDimmed(nodeMap.get(node.id)!) : false) ||
                  (nodeMap.get(targetId) ? isNodeDimmed(nodeMap.get(targetId)!) : false);

                return (
                  <g key={`goto-collapsed-${node.id}-${targetId}`}>
                    {/* Visible bridge */}
                    <path
                      d={bridgePath}
                      stroke="#000000"
                      strokeWidth={isGotoSelected ? 3 : 2}
                      fill="none"
                      opacity={dim ? 0.25 : 0.9}
                    />
                    {/* Visible redirect */}
                    <path
                      d={redirectPath}
                      stroke="#000000"
                      strokeWidth={isGotoSelected ? 3 : 2}
                      fill="none"
                      markerEnd="url(#arrowhead-light)"
                      opacity={dim ? 0.25 : 0.9}
                    />
                    {/* Click target (fatter, transparent) */}
                    <path
                      d={`${bridgePath} ${redirectPath}`}
                      stroke="transparent"
                      strokeWidth={14}
                      fill="none"
                      style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                      onClick={handleExpand}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                    />
                  </g>
                );
              }

              const { pathD } = buildJumpBezierBetweenBoxes({
                from: sourceLayout,
                to: targetLayout,
                layoutDirection,
              });
              
              const sourceNode = nodeMap.get(node.id);
              const targetNode = nodeMap.get(targetId);
              const dim = (sourceNode ? isNodeDimmed(sourceNode) : false) || (targetNode ? isNodeDimmed(targetNode) : false);

              return (
                <g key={`goto-${node.id}-${targetId}`}>
                  <path
                    d={pathD}
                    stroke="#000000"
                    strokeWidth="1.5"
                    fill="none"
                    strokeDasharray="4 4"
                    markerEnd="url(#arrowhead-gray)"
                    opacity={dim ? 0.3 : 0.6}
                  />
                </g>
              );
            })}

            {/* Custom lines (shortcut and return) */}
            {customLines.map((line) => {
              // Hide dashed lines created by the line tool when connected to a process flow
              // whose "show flow" mode is OFF.
              if (line.type === 'shortcut') {
                const fromRoot = getRootProcessNodeId(line.fromId);
                const toRoot = getRootProcessNodeId(line.toId);
                if (
                  (fromRoot && !processFlowModeNodes?.has(fromRoot)) ||
                  (toRoot && !processFlowModeNodes?.has(toRoot))
                ) {
                  return null;
                }
              }

              if (!isNodeVisible(line.fromId) || !isNodeVisible(line.toId)) return null;

              const from = animatedLayout[line.fromId];
              const to = animatedLayout[line.toId];
              if (!from || !to) return null;

              const { pathD: path } = buildJumpBezierBetweenBoxes({
                from,
                to,
                layoutDirection,
              });

              const isSelected = selectedLineId === line.id;
              // Highlight if line is connected to selected node
              const shouldHighlight = isSelected || isLineConnectedToNode(line, selectedNodeId);
              const fromNode = nodeMap.get(line.fromId);
              const toNode = nodeMap.get(line.toId);
              const dim = (fromNode ? isNodeDimmed(fromNode) : false) || (toNode ? isNodeDimmed(toNode) : false);
              
              return (
                <path
                  key={line.id}
                  d={path}
                  stroke="#000000"
                  strokeWidth={shouldHighlight ? (line.type === 'shortcut' ? 4 : 3.5) : (line.type === 'shortcut' ? 3 : 2.5)}
                  fill="none"
                  strokeDasharray={line.type === 'shortcut' ? '4 4' : 'none'}
                  markerEnd={line.type === 'shortcut' ? 'url(#arrowhead-gray)' : 'url(#arrowhead-light)'}
                  opacity={dim ? 0.3 : 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLineId(line.id);
                    onSelectNode(null); // Deselect any selected node
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                />
              );
            })}

            {/* Preview line while dragging */}
            {draggingLineFrom && activeTool === 'line' && mousePos && (() => {
              // Hide preview when originating from a process flow whose "show flow" mode is OFF.
              if (!isShowFlowOnForNode(draggingLineFrom)) return null;
              const from = animatedLayout[draggingLineFrom];
              if (!from) return null;
              
              const { pathD: path } = buildJumpBezierToPoint({
                from,
                to: mousePos,
                layoutDirection,
              });
              
              return (
                <path
                  d={path}
                  stroke="#000000"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="4 4"
                  markerEnd="url(#arrowhead-gray)"
                  opacity={0.5}
                />
              );
            })()}

            {/* Marquee selection rectangle (world-space, matches line tool coordinate system) */}
            {nodeMarqueeOverlay && (
              <rect
                x={nodeMarqueeOverlay.x}
                y={nodeMarqueeOverlay.y}
                width={nodeMarqueeOverlay.w}
                height={nodeMarqueeOverlay.h}
                fill="rgba(0, 0, 0, 0.06)"
                stroke="#000000"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
        </svg>

        <ExpandedConnectorStubOverlay stubs={expandedConnectorStubs} />

        {flattenedNodes.map(node => {
            const nodeLayout = animatedLayout[node.id];
            if (!nodeLayout) return null;
            if (!isNodeVisible(node.id)) return null;
            
            const isSelected = selectedNodeIdsSet.has(node.id) || selectedNodeId === node.id;
            const isEditing = editingNodeId === node.id;
            const isDropTarget = dropTargetId === node.id;
            const isDragged = draggedNodeId === node.id;
            const isShaking = shakeNodeId === node.id;
            const showMoveVisual = isSelected && isCmdHeld && !isEditing;
            const isHub = node.isHub;
            const isExpanded = expandedNodes.has(node.id);
            const hasEverExpanded = getRunningNumber(node.id) !== undefined;
            const isProcessNode = node.isFlowNode;
            const nodeTagIds = Array.isArray((node as any).tags) ? ((node as any).tags as string[]) : [];
            const pinnedTagsForNodeIds =
              pinnedTagIdsStable.length && nodeTagIds.length
                ? pinnedTagIdsStable.filter((id) => pinnedTagIdsSet.has(id) && nodeTagIds.includes(id))
                : [];
            const pinnedTagsForNodeNames = pinnedTagsForNodeIds.map((id) => tagNameById.get(id) || id);
            const hasPinnedTagsForNode = pinnedTagsForNodeIds.length > 0;
            // Default to 'step' if node is a process node but type hasn't been set yet
            const processNodeType = isProcessNode ? (processNodeTypes[node.id] || 'step') : null;
            const rootProcessNodeId = isProcessNode ? getRootProcessNodeId(node.id) : null;
            const isRootProcessNode = isProcessNode && rootProcessNodeId === node.id;
            
            // Check if this node is a child of a collapsed process node (when process flow mode is off)
            const collapsedProcessParent = isChildOfCollapsedProcess(node);
            const dimmedByTagView = isNodeDimmed(node);
            
            const style = styleMap.get(node.id) || { styleClass: 'bg-white border-gray-200' };
            
            // Override background color, border, and shadow for process node types
            // When collapsed or process flow mode is off, use original color scheme
            const isCollapsed = collapsedProcessParent;
            
            // Check if this process node (or its root process node) is in process flow mode
            let isInProcessFlowMode = false;
            if (isProcessNode) {
              // Find root process node
              let rootProcessNode: NexusNode | null = node;
              let check: NexusNode | null = node;
              while (check) {
                if (check.isFlowNode) {
                  rootProcessNode = check;
                  const parentId = check.parentId;
                  if (!parentId) {
                    // No parent, this is the root
                    break;
                  }
                  const parent: NexusNode | undefined = nodeMap.get(parentId);
                  if (!parent || !parent.isFlowNode) {
                    // Found the root process node
                    break;
                  }
                  check = parent;
                } else {
                  break;
                }
              }
              
              // Check if root process node is in process flow mode
              if (rootProcessNode && processFlowModeNodes?.has(rootProcessNode.id)) {
                isInProcessFlowMode = true;
              }
            }
            
            let processNodeBgClass = '';
            let processNodeBorderClass = 'border-2 border-black';
            let processNodeShadowClass = '';
            
            if (isProcessNode && !isCollapsed && isInProcessFlowMode) {
              // Monochrome border for all process nodes
              processNodeBorderClass = 'border-2 border-black';
              
              if (processNodeType) {
                switch (processNodeType) {
                  case 'validation':
                  case 'branch':
                    processNodeBgClass = 'bg-white';
                    processNodeShadowClass = '';
                    break;
                  case 'goto':
                    processNodeBgClass = 'mac-fill--hatch';
                    processNodeShadowClass = '';
                    break;
                  case 'end':
                    processNodeBgClass = 'bg-white';
                    processNodeShadowClass = '';
                    break;
                  case 'step':
                  case 'time':
                  case 'loop':
                    // White background for step and time nodes
                    processNodeBgClass = 'bg-white';
                    break;
                  default:
                    // Use default style
                    break;
                }
              } else {
                // If it's a process node but type is not set yet, use white background
                processNodeBgClass = 'bg-white';
              }
            }

            const isDiamond = isProcessNode && isInProcessFlowMode && processNodeType && (processNodeType === 'validation' || processNodeType === 'branch');
            // Diamonds are normally 120px, but allow them to grow (up to NODE_WIDTH) so text doesn't clip.
            // We cap at NODE_WIDTH because the layout engine reserves NODE_WIDTH horizontally for these nodes.
            const diamondSize = isDiamond ? Math.min(NODE_WIDTH, Math.max(DIAMOND_SIZE, nodeLayout.height)) : DIAMOND_SIZE;

            const rn = lineIndexToRn.get(node.lineIndex);
            const commentTargetKey = typeof rn === 'number' ? buildNexusNodeCommentTargetKey(rn) : null;
            const commentThread = commentTargetKey ? allCommentThreads[commentTargetKey] : undefined;
            const hasComment = !!commentThread;
            const commentCount = commentThread ? 1 + (commentThread.replies?.length || 0) : 0;

            // Collapsed "goto" nodes are rendered as SVG lines (see goto connector section),
            // so we skip the normal node card entirely.
            const isCollapsedGotoVisual =
              isProcessNode &&
              isInProcessFlowMode &&
              processNodeType === 'goto' &&
              !!gotoTargets[node.id] &&
              selectedNodeId !== node.id;
            if (isCollapsedGotoVisual && !isEditing) return null;

            return (
              <Fragment key={node.id}>
                <div 
                    data-nexus-node="true"
                    data-nexus-node-id={node.id}
                    draggable={!isEditing && !isExpanded && !collapsedProcessParent && activeTool === 'select'}
                    onDragStart={(e) => {
                      if (!isExpanded && !collapsedProcessParent) {
                        handleDragStart(e, node.id);
                      } else {
                        e.preventDefault();
                      }
                    }}
                    onDragOver={(e) => {
                      if (!isExpanded && !collapsedProcessParent) {
                        handleDragOver(e, node.id);
                      }
                    }}
                    onDrop={(e) => {
                      if (!isExpanded && !collapsedProcessParent) {
                        handleDrop(e, node.id);
                      }
                    }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      // Always keep keyboard focus on the canvas so Enter/Tab works (especially in Flow tab).
                      containerRef.current?.focus();
                      onSelectExpandedGridNode?.(null);
                      if (activeTool === 'annotation') {
                        onSelectNode(node.id);
                        setAnnotationEditorForId(node.id);
                        setAnnotationDraft(node.annotation || '');
                        return;
                      }
                      if (activeTool === 'comment') {
                        onSelectNode(node.id);
                        // Ensure stable anchor (rn) for this node so comments can persist across edits.
                        const yText = doc.getText('nexus');
                        const current = yText.toString();
                        let lineIndexToRunning = extractRunningNumbersFromMarkdown(current);
                        let rn = lineIndexToRunning.get(node.lineIndex);
                        if (rn === undefined && typeof node.lineIndex === 'number') {
                          ensureRunningNumberTagsForNodes({
                            doc,
                            nodes: [{ id: node.id, lineIndex: node.lineIndex }],
                          });
                          lineIndexToRunning = extractRunningNumbersFromMarkdown(doc.getText('nexus').toString());
                          rn = lineIndexToRunning.get(node.lineIndex);
                        }
                        if (typeof rn === 'number') {
                          const targetKey = buildNexusNodeCommentTargetKey(rn);
                          const thread = getThread(doc, targetKey);
                          onOpenComments?.({
                            targetKey,
                            targetLabel: node.content,
                            ...(thread ? { scrollToThreadId: thread.id } : {}),
                          });
                        }
                        return;
                      }
                      if (activeTool === 'select') {
                        if (e.shiftKey || e.metaKey || e.ctrlKey) {
                          const next = new Set(selectedNodeIdsSet);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          onSelectNodeIds?.(Array.from(next));
                          onSelectNode(Array.from(next)[0] || null);
                          return;
                        } else {
                          onSelectNodeIds?.([node.id]);
                        }
                      }
                      // Close process type menu if clicking elsewhere
                      if (processTypeMenuForId && processTypeMenuForId !== node.id) {
                        setProcessTypeMenuForId(null);
                        setProcessTypeMenuPosition(null);
                      }
                      // Don't select if clicking on process type menu button
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-process-type-menu]')) {
                        return;
                      }
                      if (selectedLineId) {
                        setSelectedLineId(null);
                      }
                      if (activeTool !== 'line') {
                        onSelectNode(node.id);
                        // Center the clicked node in the visible (panel-aware) viewport.
                        if (activeTool === 'select') {
                          centerNodeInSafeViewport(node.id);
                        }
                      }
                    }}
                    onMouseDown={(e) => {
                      if (activeTool === 'line' && !isEditing) {
                        e.stopPropagation();
                        e.preventDefault();
                        setDraggingLineFrom(node.id);
                        // Initialize mouse position immediately so the preview line starts under the cursor,
                        // even before the first mousemove event fires.
                        const pt = clientToWorld(e.clientX, e.clientY);
                        if (pt) setMousePos({ x: pt.x, y: pt.y });
                      }
                    }}
                    onMouseUp={(e) => {
                      if (activeTool === 'line' && draggingLineFrom && draggingLineFrom !== node.id) {
                        e.stopPropagation();
                        e.preventDefault();
                        // Complete line drawing
                        createLine(draggingLineFrom, node.id);
                        setDraggingLineFrom(null);
                        setMousePos(null);
                        if (onToolUse) onToolUse();
                      } else if (draggingLineFrom === node.id) {
                        // Cancel if released on same node
                        setDraggingLineFrom(null);
                        setMousePos(null);
                      }
                    }}
                    onDoubleClick={(e) => {
                      startEditing(node.id, undefined, true);
                    }} 
                    className={`absolute ${isDiamond ? 'text-black bg-transparent' : style.styleClass} ${(isProcessNode && !isCollapsed && isInProcessFlowMode && !isDiamond) ? (processNodeBgClass || '') : ''} ${isDiamond ? '' : 'mac-double-outline'} ${isDiamond ? '' : 'rounded-md'} ${isDiamond ? '' : 'px-3 py-2'} flex flex-col items-center justify-center text-sm font-medium break-words ${isExpanded ? 'overflow-visible group' : (hasPinnedTagsForNode ? 'overflow-visible' : (isProcessNode && !isInProcessFlowMode && node.children.length > 0 ? 'overflow-visible' : 'overflow-hidden'))} ${(() => {
                      if (!isProcessNode) return '';
                      // Check if process flow mode is enabled for root process node
                      let root: NexusNode | null = node;
                      let check: NexusNode | null = node;
                      while (check) {
                        if (check.isFlowNode) {
                          root = check;
                          const parentId = check.parentId;
                          if (!parentId) break;
                          const p = nodeMap.get(parentId);
                          if (!p || !p.isFlowNode) break;
                          check = p;
                        } else {
                          break;
                        }
                      }
                      return root && processFlowModeNodes?.has(root.id) ? 'overflow-visible' : '';
                    })()} ${transitionClasses} outline-none select-none
                        ${isSelected && !isDiamond ? 'mac-shadow-hard' : ''}
                        ${isDropTarget && !isDiamond ? 'mac-shadow-hard' : ''}
                        ${isDragged ? 'opacity-50 border-dashed' : ''}
                        ${isShaking ? 'animate-shake border-black' : ''}
                        ${activeTool === 'select' ? 'cursor-pointer' : activeTool === 'line' ? 'cursor-crosshair' : 'cursor-default'}
                        ${draggingLineFrom === node.id && !isDiamond ? 'mac-shadow-hard' : ''}
                        ${showMoveVisual ? `cursor-move ${isDiamond ? '' : 'mac-shadow-hard'}` : ''}
                    `}
                    style={{
                        left: (() => {
                          const baseLeft = collapsedProcessParent ? (() => {
                            const parent = nodeMap.get(node.parentId!);
                            if (parent) {
                              const parentLayout = animatedLayout[parent.id];
                              if (parentLayout) return parentLayout.x;
                            }
                            return nodeLayout.x;
                          })() : nodeLayout.x;
                          // Center diamond horizontally
                          return isDiamond ? baseLeft + (nodeLayout.width - diamondSize) / 2 : baseLeft;
                        })(),
                        top: (() => {
                          const baseTop = collapsedProcessParent ? (() => {
                            const parent = nodeMap.get(node.parentId!);
                            if (parent) {
                              const parentLayout = animatedLayout[parent.id];
                              if (parentLayout) return parentLayout.y;
                            }
                            return nodeLayout.y;
                          })() : nodeLayout.y;
                          // For diamonds, position at layout Y (top corner position, not centered)
                          return baseTop;
                        })(),
                        width: isDiamond ? diamondSize : nodeLayout.width,
                        height: (() => {
                          if (isDiamond) {
                            return diamondSize;
                          }
                          // Increase height for process nodes with top icons (time/loop)
                          if (isProcessNode && (processNodeType === 'time' || processNodeType === 'loop')) {
                            // Add extra space for icon at top, plus extra room for loop dropdown when selected
                            const extraForIcon = 24;
                            const extraForLoopDropdown =
                              processNodeType === 'loop' && isSelected ? 26 : 0;
                            return nodeLayout.height + extraForIcon + extraForLoopDropdown;
                          }
                          return nodeLayout.height;
                        })(),
                        minWidth: isDiamond ? diamondSize : nodeLayout.width,
                        minHeight: (() => {
                          if (isDiamond) {
                            return diamondSize;
                          }
                          // Increase min height for process nodes with top icons (time/loop)
                          if (isProcessNode && (processNodeType === 'time' || processNodeType === 'loop')) {
                            const extraForIcon = 24;
                            const extraForLoopDropdown =
                              processNodeType === 'loop' && isSelected ? 26 : 0;
                            return nodeLayout.height + extraForIcon + extraForLoopDropdown;
                          }
                          return nodeLayout.height;
                        })(),
                        ...(isDiamond ? {
                          // Diamonds are rendered as an SVG polygon so the visible shape
                          // matches the same bounding box used by connector math.
                          transform: 'rotate(0deg)',
                        } : {}),
                        zIndex: collapsedProcessParent ? -1 : 'auto',
                        opacity: collapsedProcessParent ? 0 : (dimmedByTagView ? 0.3 : 1),
                        pointerEvents: collapsedProcessParent ? 'none' : 'auto'
                    }}
                >
                    {isDiamond ? (
                      <svg
                        className="mac-diamond-outline-svg absolute inset-0 z-[0]"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {/* Fill */}
                        <polygon
                          points="50,0 100,50 50,100 0,50"
                          fill="#ffffff"
                          shapeRendering="crispEdges"
                        />
                        {/* Double outline: black / white / black */}
                        <polygon
                          points="50,2 98,50 50,98 2,50"
                          fill="none"
                          stroke="var(--mac-black)"
                          strokeWidth={isSelected ? 5 : 3}
                          strokeLinejoin="miter"
                          shapeRendering="crispEdges"
                        />
                        <polygon
                          points="50,4 96,50 50,96 4,50"
                          fill="none"
                          stroke="var(--mac-white)"
                          strokeWidth={isSelected ? 3 : 2}
                          strokeLinejoin="miter"
                          shapeRendering="crispEdges"
                        />
                        <polygon
                          points="50,6 94,50 50,94 6,50"
                          fill="none"
                          stroke="var(--mac-black)"
                          strokeWidth={isSelected ? 2 : 1}
                          strokeLinejoin="miter"
                          shapeRendering="crispEdges"
                        />
                      </svg>
                    ) : null}

                    {referencedNodeIds?.has(node.id) ? (
                      <div
                        className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-700"
                        title="This node references a main-canvas process node"
                      >
                        <Link2 size={14} />
                      </div>
                    ) : null}

                    {hasPinnedTagsForNode ? (
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-1 group"
                      >
                        {pinnedTagsForNodeIds.slice(0, 3).map((id) => {
                          const name = tagNameById.get(id) || id;
                          return (
                            <span
                              key={`${node.id}-pin-${id}`}
                              className="px-1.5 py-0.5 rounded border border-slate-200 bg-white/95 text-[9px] leading-none text-slate-700 shadow-sm max-w-[88px] truncate"
                            >
                              {name}
                            </span>
                          );
                        })}
                        {pinnedTagsForNodeNames.length > 3 ? (
                          <span
                            className="px-1.5 py-0.5 rounded border border-slate-200 bg-white/95 text-[9px] leading-none text-slate-700 shadow-sm"
                          >
                            +{pinnedTagsForNodeNames.length - 3}
                          </span>
                        ) : null}

                        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="max-w-[240px] whitespace-pre-wrap text-[10px] leading-snug mac-double-outline bg-white px-2 py-1 mac-shadow-hard text-slate-800">
                            {pinnedTagsForNodeNames.join('\n')}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Comment bubble is rendered outside the node card to avoid overflow clipping */}
                    {/* Stacked shapes behind collapsed process nodes - outer stacked effect */}
                    {isProcessNode && !isInProcessFlowMode && node.children.length > 0 && (
                      <>
                        {/* Multiple outer stacked shapes to indicate hidden children - behind main node, same border as main node */}
                        <div 
                          className={`absolute rounded-md ${(isCollapsed || !isInProcessFlowMode) ? 'border' : processNodeBorderClass} pointer-events-none`}
                          style={{
                            left: '2px',
                            top: '2px',
                            width: '100%',
                            height: '100%',
                            zIndex: 0,
                            backgroundColor: 'transparent',
                          }}
                        />
                        <div 
                          className={`absolute rounded-md ${(isCollapsed || !isInProcessFlowMode) ? 'border' : processNodeBorderClass} pointer-events-none`}
                          style={{
                            left: '4px',
                            top: '4px',
                            width: '100%',
                            height: '100%',
                            zIndex: 0,
                            backgroundColor: 'transparent',
                          }}
                        />
                        <div 
                          className={`absolute rounded-md ${(isCollapsed || !isInProcessFlowMode) ? 'border' : processNodeBorderClass} pointer-events-none`}
                          style={{
                            left: '6px',
                            top: '6px',
                            width: '100%',
                            height: '100%',
                            zIndex: 0,
                            backgroundColor: 'transparent',
                          }}
                        />
                      </>
                    )}
                    
                    {/* Light colored background layer - behind text content */}
                    {isProcessNode && !isInProcessFlowMode && node.children.length > 0 && (
                      <div 
                        className="absolute inset-0 rounded-md bg-slate-50 pointer-events-none"
                        style={{
                          zIndex: 0,
                        }}
                      />
                    )}
                   
                    {node.isCommon && (
                      <div className="absolute -top-1 -right-1 bg-black text-white px-1 py-0.5 text-[8px] shadow-sm pointer-events-none mac-double-outline">
                        C
                      </div>
                    )}

                    {showMoveVisual && (
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-black text-white p-0.5 shadow-sm mac-double-outline">
                            <Move size={10} />
                        </div>
                    )}

                    <NodeInlineControls
                      hasExpandedHistory={hasEverExpanded}
                      isExpanded={isExpanded}
                      onToggleExpanded={() => {
                        onExpandedNodesChange((prev) => {
                          const next = new Set(prev || []);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          return next;
                        });
                      }}
                      hasShowFlowToggle={!hideShowFlowToggle && !!isRootProcessNode && !!onProcessFlowModeNodesChange}
                      isShowFlowOn={!!processFlowModeNodes?.has(node.id)}
                      onToggleShowFlow={() => {
                        onProcessFlowModeNodesChange?.((prev) => {
                          const next = new Set(prev || []);
                          if (next.has(node.id)) next.delete(node.id);
                          else next.add(node.id);
                          return next;
                        });
                      }}
                      isSelected={isSelected}
                      shiftLeftForOtherRightButton={!isRootProcessNode && isProcessNode && isInProcessFlowMode && isSelected}
                    />
                    
                    {/* Process node type icons and features */}
                    {isProcessNode && (() => {
                      // Find the root process node (the one whose parent is NOT a process node)
                      let rootProcessNode: NexusNode | null = node;
                      let checkNode: NexusNode | null = node;
                      let isRootProcessNodeLocal = false;
                      
                      // Walk up to find the root process node
                      while (checkNode) {
                        if (checkNode.isFlowNode) {
                          rootProcessNode = checkNode;
                          const parentId = checkNode.parentId;
                          if (!parentId) {
                            // No parent, this is the root
                            isRootProcessNodeLocal = (checkNode.id === node.id);
                            break;
                          }
                          const parent: NexusNode | undefined = nodeMap.get(parentId);
                          if (!parent || !parent.isFlowNode) {
                            // Found the root process node
                            isRootProcessNodeLocal = (checkNode.id === node.id);
                            break;
                          }
                          checkNode = parent;
                        } else {
                          break;
                        }
                      }
                      
                      // Check if process flow mode is enabled for the root process node
                      const isInProcessFlowMode = rootProcessNode && rootProcessNode.isFlowNode && processFlowModeNodes?.has(rootProcessNode.id);
                      
                      return (
                        <>
                          {/* Icons at the top for time - always show when in process flow mode */}
                          {isInProcessFlowMode && processNodeType === 'time' && (
                            <div className="flex justify-center pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 w-full">
                              <Clock size={20} className="text-slate-500" />
                            </div>
                          )}
                          {isInProcessFlowMode && processNodeType === 'loop' && (
                            <div className="flex justify-center pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 w-full">
                              <Repeat size={20} className="text-slate-500" />
                            </div>
                          )}
                          {isInProcessFlowMode && processNodeType === 'end' && (
                            <div className="w-full border-2 border-black bg-black px-1.5 py-0.5 text-xs text-white text-center mac-shadow-hard">
                              End
                            </div>
                          )}
                          {isInProcessFlowMode && processNodeType === 'goto' && (
                            <div className="flex w-full items-center justify-center gap-1 text-xs text-slate-900">
                              <span className="text-slate-600">Go to</span>
                              <select
                                value={gotoTargets[node.id] || ''}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleSaveGotoTarget(node.id, e.target.value);
                                }}
                                className="appearance-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="" disabled>
                                  Select…
                                </option>
                                {flattenedNodes
                                  .filter((n) => n.id !== node.id && n.isFlowNode)
                                  .map((n) => (
                                    <option key={n.id} value={n.id}>
                                      {n.content || n.id}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                          
                          {/* Show-flow toggle moved to NodeInlineControls above */}
                          
                          {/* Type selection button - only for child process nodes when selected */}
                          {!isRootProcessNodeLocal && isInProcessFlowMode && isSelected && (
                            <button
                              ref={(el) => {
                                if (el) {
                                  typeMenuButtonRefs.current.set(node.id, el);
                                } else {
                                  typeMenuButtonRefs.current.delete(node.id);
                                }
                              }}
                              type="button"
                              data-process-type-menu
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const isCurrentlyOpen = processTypeMenuForId === node.id;
                                
                                if (isCurrentlyOpen) {
                                  // Close menu
                                  setProcessTypeMenuForId(null);
                                  setProcessTypeMenuPosition(null);
                                } else {
                                  // Open menu - calculate position
                                  const button = typeMenuButtonRefs.current.get(node.id);
                                  if (button && containerRef.current) {
                                    const buttonRect = button.getBoundingClientRect();
                                    const containerRect = containerRef.current.getBoundingClientRect();
                                    
                                    // Calculate absolute screen position
                                    const absoluteX = buttonRect.right;
                                    const absoluteY = buttonRect.bottom + 4;
                                    
                                    // Store relative position for portal calculation
                                    const relativeX = (buttonRect.right - containerRect.left - offset.x) / scale;
                                    const relativeY = (buttonRect.bottom - containerRect.top - offset.y) / scale + 4;
                                    
                                    setProcessTypeMenuPosition({ x: relativeX, y: relativeY });
                                    setProcessTypeMenuForId(node.id);
                                  } else {
                                    // Fallback: just open without position (will be calculated in portal)
                                    setProcessTypeMenuForId(node.id);
                                    setProcessTypeMenuPosition({ x: 0, y: 0 });
                                  }
                                }
                              }}
                              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 z-20"
                              title="Change process node type"
                              style={{ pointerEvents: 'auto' }}
                            >
                              <ArrowLeftRight size={12} />
                            </button>
                          )}
                        </>
                      );
                    })()}
                    
                    {/* Content area */}
                    {isExpanded ? (() => {
                        const runningNumber = getRunningNumber(node.id);
                        if (runningNumber === undefined) return null;
                        
                        const metadata = loadExpandedNodeMetadata(doc, runningNumber);
                        return (
                            <>
                            <div 
                                data-expanded-node={node.id}
                                className="w-full h-full"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <ExpandedNodeView
                                    node={node}
                                    doc={doc}
                                    styleClass={style.styleClass}
                                    nodeMap={nodeMap}
                                    runningNumber={runningNumber}
                                    selectedGridNodeKey={
                                      selectedExpandedGridNode?.runningNumber === runningNumber
                                        ? selectedExpandedGridNode.gridNodeKeys?.[0] || null
                                        : null
                                    }
                                    onSelectGridNode={(gridNodeKey) => {
                                      onSelectExpandedGridNode?.({
                                        runningNumber,
                                        gridNodeKeys: [gridNodeKey],
                                        parentNodeLabel: node.content,
                                        parentNodeId: node.id,
                                      });
                                    }}
                                    gridWidth={metadata.gridWidth || metadata.gridSize || 4}
                                    gridHeight={metadata.gridHeight || metadata.gridSize || 4}
                                    onAddNode={(gridX, gridY) => {
                                        // This will be handled by ExpandedNodeView
                                    }}
                                    onDeleteNode={(nodeId) => {
                                        // This will be handled by ExpandedNodeView
                                    }}
                                />
                                {/* Ghost resize overlay + corner handle (bottom-right) */}
                                {expandedNodeGhostResize?.nodeId === node.id && (
                                  <div
                                    className="absolute top-0 left-0 border-2 border-dashed border-blue-500 bg-blue-500/5 pointer-events-none z-30"
                                    style={{
                                      width: NODE_WIDTH * expandedNodeGhostResize.ghostWidthMult,
                                      height:
                                        expandedNodeGhostResize.baseHeightPx * expandedNodeGhostResize.ghostHeightMult +
                                        expandedNodeGhostResize.extraHeightPx,
                                    }}
                                  >
                                    <div className="absolute -top-7 right-0 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">
                                      {expandedNodeGhostResize.ghostWidthMult}×{expandedNodeGhostResize.ghostHeightMult}
                                    </div>
                                  </div>
                                )}
                                {!isDiamond && (
                                  <button
                                    type="button"
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();

                                      const currentWidthMult = metadata.width ?? 4;
                                      const currentHeightMult = metadata.height ?? 4;

                                      const baseHeightPx =
                                        currentHeightMult > 0 ? nodeLayout.height / currentHeightMult : nodeLayout.height;

                                      const extraHeightPx = (() => {
                                        if (isProcessNode && (processNodeType === 'time' || processNodeType === 'loop')) {
                                          const extraForIcon = 24;
                                          const extraForLoopDropdown = processNodeType === 'loop' && isSelected ? 26 : 0;
                                          return extraForIcon + extraForLoopDropdown;
                                        }
                                        return 0;
                                      })();

                                      const initial = {
                                        nodeId: node.id,
                                        startClientX: e.clientX,
                                        startClientY: e.clientY,
                                        baseHeightPx,
                                        extraHeightPx,
                                        startWidthMult: currentWidthMult,
                                        startHeightMult: currentHeightMult,
                                        ghostWidthMult: currentWidthMult,
                                        ghostHeightMult: currentHeightMult,
                                      };

                                      expandedNodeGhostResizeRef.current = initial;
                                      setExpandedNodeGhostResize(initial);
                                      (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
                                    }}
                                    className={`absolute bottom-1 right-1 w-4 h-4 rounded-sm bg-blue-500/80 hover:bg-blue-600 transition-opacity z-30 cursor-nwse-resize ${
                                      expandedNodeGhostResize?.nodeId === node.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                    title="Resize (drag corner)"
                                    style={{ pointerEvents: 'auto' }}
                                  >
                                    <span className="sr-only">Resize</span>
                                  </button>
                                )}

                                {/* Right edge - column count controls */}
                                <div className="absolute top-1/2 -right-6 -translate-y-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                  <div className="flex flex-col gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExpandedGridSizeChange(node.id, 'columns', +1);
                                      }}
                                      className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
                                      title="Add column"
                                    >
                                      <Plus size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExpandedGridSizeChange(node.id, 'columns', -1);
                                      }}
                                      className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
                                      title="Remove column"
                                    >
                                      <Minus size={10} />
                                    </button>
                                  </div>
                                </div>
                            </div>
                            {/* Bottom edge - row count controls - positioned outside the expanded node container */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full flex flex-row gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                  {/* Grid rows (+ / -) */}
                                  <div className="flex flex-row gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExpandedGridSizeChange(node.id, 'rows', +1);
                                      }}
                                      className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
                                      title="Add row"
                                    >
                                      <Plus size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExpandedGridSizeChange(node.id, 'rows', -1);
                                      }}
                                      className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors cursor-pointer"
                                      title="Remove row"
                                    >
                                      <Minus size={10} />
                                    </button>
                                  </div>
                                </div>
                            </>
                        );
                    })() : isEditing ? (
                        <div className={`w-full flex flex-col items-center justify-center ${isDiamond ? 'px-3 py-2 relative z-[2]' : ''}`}>
                            {node.icon && node.icon.trim().length > 0 && (
                              <div
                                className="pointer-events-none select-none leading-none"
                                style={{
                                  fontSize: '3em',
                                  lineHeight: '1',
                                  marginBottom: 6,
                                }}
                              >
                                {node.icon}
                              </div>
                            )}
                            <div className="relative w-full">
                              <textarea 
                                  ref={inputRef}
                                  value={editValue || ''} 
                                  className="w-full text-center bg-transparent focus:outline-none min-w-[50px] text-inherit resize-none relative z-[2]"
                                  onClick={(e) => e.stopPropagation()}
                                  onBlur={() => { commitEdit(); setEditingNodeId(null); }}
                                  onKeyDown={handleInputKeyDown}
                                  onChange={(e) => {
                                    const t = e.target as HTMLTextAreaElement;
                                    // Capture caret before React updates the controlled value.
                                    pendingEditSelectionRef.current = {
                                      start: t.selectionStart ?? t.value.length,
                                      end: t.selectionEnd ?? t.value.length,
                                    };
                                    setEditValue(t.value);
                                    setEditSuggestionIndex(null);
                                  }}
                                  style={{
                                      lineHeight: '1.5',
                                      paddingTop: '0',
                                      paddingBottom: '0',
                                      maxHeight: 'none', // Allow unlimited growth for multi-line content
                                  }}
                                  onInput={(e) => {
                                      // Auto-resize textarea to fit content
                                      const target = e.target as HTMLTextAreaElement;
                                      const lineCount = (target.value.match(/\n/g) || []).length + 1;
                                      
                                      // Account for parent padding (py-2 = 8px top + 8px bottom = 16px total)
                                      const availableHeight = nodeLayout.height - 16;
                                      
                                      if (lineCount === 1) {
                                          // For single-line text, set height to fill available space for proper centering
                                          target.style.minHeight = `${availableHeight}px`;
                                          target.style.height = `${availableHeight}px`;
                                      } else {
                                          // For multi-line text, allow it to grow beyond node height while editing
                                          target.style.minHeight = '24px'; // Minimum for one line
                                          target.style.height = 'auto';
                                          // Allow growth beyond availableHeight for multi-line content
                                          const newHeight = Math.max(24, target.scrollHeight);
                                          target.style.height = `${newHeight}px`;
                                      }
                                      target.style.paddingTop = '0';
                                      target.style.paddingBottom = '0';
                                  }}
                              />
                              {editSuggestions.length > 0 && (
                                <div
                                  className="absolute z-50 mt-1 left-1/2 -translate-x-1/2 w-[260px] bg-white border border-slate-200 rounded shadow-lg max-h-44 overflow-y-auto text-left"
                                  onMouseDown={(e) => {
                                    // Keep focus on textarea (avoid blur/commit).
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  {editSuggestions.map((s, idx) => (
                                    <div
                                      key={`${s}-${idx}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setEditValue(s);
                                        setEditSuggestionIndex(null);
                                      }}
                                      className={`px-2 py-1 text-[11px] cursor-pointer hover:bg-blue-50 ${
                                        idx === editSuggestionIndex ? 'bg-blue-100' : ''
                                      }`}
                                    >
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                        </div>
                    ) : (
                        <div 
                            className={`w-full text-center ${processNodeType === 'loop' && isSelected ? 'overflow-visible' : 'overflow-hidden'} flex flex-col items-center justify-center relative ${(processNodeType === 'time' || processNodeType === 'loop') ? 'pt-6' : ''} ${isDiamond ? 'px-3 py-2 relative z-[2]' : ''}`}
                            style={{ 
                                whiteSpace: 'pre-wrap',
                                maxWidth: '100%',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                zIndex: 2, // Ensure text is above background layers
                            }}
                        >
                            {node.icon && node.icon.trim().length > 0 && (
                              <div
                                className="pointer-events-none select-none leading-none"
                                style={{
                                  fontSize: '3em',
                                  lineHeight: '1',
                                  marginBottom: 6,
                                }}
                              >
                                {node.icon}
                              </div>
                            )}
                            <div className="w-full break-words whitespace-pre-wrap overflow-hidden flex items-center justify-center">
                              {(processNodeType === 'end' || processNodeType === 'goto') ? '' : (
                                <span className="mac-label-plate inline-flex items-center gap-1">
                                  {linkedTextSet.size > 0 && linkedTextSet.has((node.content || '').trim()) ? (
                                    <span className="text-slate-500" title="Linked to a dimension value">
                                      <Link2 size={12} />
                                    </span>
                                  ) : null}
                                  <span>{node.content}</span>
                                </span>
                              )}
                            </div>
                            {isProcessNode && isInProcessFlowMode && processNodeType === 'loop' && isSelected && (() => {
                              const options = getLoopTargetOptions({ loopNode: node, flattenedNodes });
                              const selected = loopTargets[node.id] || '';
                              const selectedIsValid = !selected || options.some((o) => o.id === selected);
                              const value = selectedIsValid ? selected : '';

                              return (
                                <div className="mt-1 flex w-full items-center justify-center gap-1 text-xs text-slate-900">
                                  <span className="text-slate-600">Loop to</span>
                                  <select
                                    value={value}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleSaveLoopTarget(node.id, e.target.value);
                                    }}
                                    className="appearance-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">
                                      {options.length ? 'Select…' : 'No children'}
                                    </option>
                                    {options.map((n) => (
                                      <option key={n.id} value={n.id}>
                                        {n.content || n.id}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })()}
                        </div>
                    )}
                    
                </div>

                {/* Comment bubble (Figma-style) — rendered OUTSIDE node card to avoid being cropped */}
                {showComments && commentTargetKey && (hasComment || activeTool === 'comment') && !collapsedProcessParent ? (
                  <button
                    type="button"
                    className="absolute h-6 min-w-6 px-1.5 rounded-full bg-slate-900 text-white text-[11px] shadow-sm hover:bg-slate-800 z-30"
                    style={{
                      left: (() => {
                        const baseLeft = nodeLayout.x;
                        const w = isDiamond ? diamondSize : nodeLayout.width;
                        return baseLeft + w - 4;
                      })(),
                      top: nodeLayout.y - 6,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                      opacity: dimmedByTagView ? 0.6 : 1,
                    }}
                    title={hasComment ? 'Open comment' : 'Add comment'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenComments?.({
                        targetKey: commentTargetKey,
                        targetLabel: node.content,
                        ...(commentThread ? { scrollToThreadId: commentThread.id } : {}),
                      });
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                  >
                    {hasComment ? commentCount : '+'}
                  </button>
                ) : null}

                {/* Annotation render OUTSIDE node card */}
                {showAnnotations && node.annotation && node.annotation.trim().length && !collapsedProcessParent ? (
                  <div
                    className="absolute"
                    style={{
                      left: (() => {
                        const baseLeft = collapsedProcessParent ? nodeLayout.x : nodeLayout.x;
                        return isDiamond ? baseLeft + (nodeLayout.width - diamondSize) / 2 : baseLeft;
                      })(),
                      top: (() => {
                        const baseTop = collapsedProcessParent ? nodeLayout.y : nodeLayout.y;
                        const cardH = isDiamond ? diamondSize : nodeLayout.height;
                        return baseTop + cardH + ANNOTATION_GAP_PX;
                      })(),
                      width: isDiamond ? diamondSize : nodeLayout.width,
                      pointerEvents: 'auto',
                      zIndex: 25,
                      opacity: dimmedByTagView ? 0.6 : 1,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm">
                      <div className="text-[11px] text-slate-700 whitespace-pre-wrap break-words">
                        {node.annotation}
                      </div>
                    </div>
                    {isSelected && activeTool === 'annotation' ? (
                      <button
                        type="button"
                        className="absolute -right-2 -top-2 p-1 rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-500 hover:text-slate-800"
                        title="Delete annotation"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveNodeAnnotation({ doc, lineIndex: node.lineIndex, annotation: '' });
                          if (annotationEditorForId === node.id) {
                            setAnnotationEditorForId(null);
                            setAnnotationDraft('');
                          }
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </Fragment>
            );
        })}
      </div>

      {/* Condition Matrix Overlay (shared component) */}
      <ConditionMatrixOverlay
        open={!!matrixHubId}
        hubLabel={matrixHubId ? rawNodeMap.get(matrixHubId)?.content || '' : ''}
        scenarios={matrixScenarios}
        onClose={() => setMatrixHubId(null)}
        onSelectScenario={(scenario) => {
          if (!matrixHubId) return;
          onActiveVariantChange((prev) => ({
            ...prev,
            [matrixHubId]: scenario.conditions,
          }));
          setMatrixHubId(null);
        }}
      />

      {/* Node annotation editor (annotation tool) */}
      {annotationEditorForId && (() => {
        const l = animatedLayout[annotationEditorForId];
        const n = nodeMap.get(annotationEditorForId);
        if (!l || !n) return null;

        const screenX = (l.x * scale) + offset.x + Math.min(18, (l.width * scale) * 0.2);
        const screenY = ((l.y + l.height) * scale) + offset.y + 10;

        return (
          <div
            className="absolute z-[9999] w-[340px] rounded-lg border border-slate-200 bg-white shadow-xl p-3"
            style={{ left: screenX, top: screenY }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              Annotation
            </div>
            <textarea
              value={annotationDraft}
              onChange={(e) => setAnnotationDraft(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Write an annotation…"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  saveNodeAnnotation({ doc, lineIndex: n.lineIndex, annotation: '' });
                  setAnnotationEditorForId(null);
                  setAnnotationDraft('');
                }}
                title="Delete annotation"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setAnnotationEditorForId(null);
                    setAnnotationDraft('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-7 px-2 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700"
                  onClick={() => {
                    saveNodeAnnotation({ doc, lineIndex: n.lineIndex, annotation: annotationDraft });
                    setAnnotationEditorForId(null);
                    setAnnotationDraft('');
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* Connector label editor */}
      {editingConnector && (() => {
        const from = animatedLayout[editingConnector.fromId];
        const to = animatedLayout[editingConnector.toId];
        if (!from || !to) return null;
        
        // Calculate midpoint accounting for canvas transform
        const midX = (from.x + from.width + to.x) / 2;
        const midY = (from.y + from.height / 2 + to.y + to.height / 2) / 2;
        
        // Transform coordinates to screen space
        const screenX = (midX * scale) + offset.x;
        const screenY = (midY * scale) + offset.y;
        
        const connectorColorOptions = [
          { value: '#000000', label: 'Black' },
        ];
        
        const connectorKey = `${editingConnector.fromId}__${editingConnector.toId}`;
        const currentLabel = connectorLabels[connectorKey];
        
        return (
          <div
            className="connector-label-editor absolute mac-popover mac-double-outline p-2 z-[9999]"
            style={{
              left: screenX - 100,
              top: screenY - 60,
              width: 200,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={editingConnectorValue}
                onChange={(e) => setEditingConnectorValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const newLabels = { ...connectorLabels };
                    if (editingConnectorValue.trim()) {
                      newLabels[connectorKey] = {
                        label: editingConnectorValue.trim(),
                        color: '#000000',
                      };
                    } else {
                      delete newLabels[connectorKey];
                    }
                    handleSaveConnectorLabels(newLabels);
                    setEditingConnector(null);
                    setEditingConnectorValue('');
                  } else if (e.key === 'Escape') {
                    setEditingConnector(null);
                    setEditingConnectorValue('');
                  }
                }}
                onBlur={(e) => {
                  // Don't close if clicking on the select dropdown
                  if (e.relatedTarget && (e.relatedTarget as HTMLElement).tagName === 'SELECT') {
                    return;
                  }
                  const newLabels = { ...connectorLabels };
                  if (editingConnectorValue.trim()) {
                    newLabels[connectorKey] = {
                      label: editingConnectorValue.trim(),
                      color: currentLabel?.color || '#0f172a',
                    };
                  } else {
                    delete newLabels[connectorKey];
                  }
                  handleSaveConnectorLabels(newLabels);
                  setEditingConnector(null);
                  setEditingConnectorValue('');
                }}
                className="flex-1 mac-field text-xs"
                placeholder="Label text"
                autoFocus
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const newLabels = { ...connectorLabels };
                  delete newLabels[connectorKey];
                  handleSaveConnectorLabels(newLabels);
                  setEditingConnector(null);
                  setEditingConnectorValue('');
                }}
                className="mac-btn px-2 py-1 text-xs"
                title="Delete label"
              >
                <X size={12} />
              </button>
            </div>
            <select
              value={currentLabel?.color || '#0f172a'}
              onChange={(e) => {
                e.stopPropagation();
                const newLabels = { ...connectorLabels };
                if (editingConnectorValue.trim() || currentLabel) {
                  newLabels[connectorKey] = {
                    label: editingConnectorValue.trim() || currentLabel?.label || '',
                    color: e.target.value,
                  };
                  handleSaveConnectorLabels(newLabels);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                // Don't close editor if clicking on input
                if (e.relatedTarget && (e.relatedTarget as HTMLElement).tagName === 'INPUT') {
                  return;
                }
              }}
              className="w-full mac-field text-xs"
            >
              {connectorColorOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );
      })()}
      
      {/* Process Type Menu - Rendered via portal to appear above everything */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {processTypeMenuForId && processTypeMenuPosition && typeof document !== 'undefined' && (() => {
        const node = nodeMap.get(processTypeMenuForId);
        if (!node) return null;
        const processNodeType = processNodeTypes[processTypeMenuForId] || 'step';
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;
        
        // Calculate absolute position on screen
        const absoluteX = containerRect.left + (processTypeMenuPosition.x * scale) + offset.x;
        const absoluteY = containerRect.top + (processTypeMenuPosition.y * scale) + offset.y;
        
        return createPortal(
          <div 
            data-process-type-menu
            className="fixed mac-popover mac-double-outline mac-shadow-hard z-[9999] min-w-[120px] overflow-hidden"
            style={{
              left: `${absoluteX}px`,
              top: `${absoluteY}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(['step', 'time', 'loop', 'validation', 'branch', 'end', 'goto'] as FlowNodeType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const nodeId = processTypeMenuForId;
                  if (nodeId) {
                    console.log('Selecting type:', type, 'for node:', nodeId);
                    saveProcessNodeType(nodeId, type);
                    setProcessTypeMenuForId(null);
                    setProcessTypeMenuPosition(null);
                  }
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                  processNodeType === type ? 'mac-fill--hatch' : ''
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
