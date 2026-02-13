'use client';

import '@/app/suppress-params-warning';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useYjs } from '@/hooks/use-yjs';
import { NexusEditor } from '@/components/NexusEditor';
import { NexusCanvas } from '@/components/NexusCanvas';
import { Toolbar, ToolType } from '@/components/Toolbar';
import { LogicPanel } from '@/components/LogicPanel';
import { ExpandedGridNodePanel, type SelectedExpandedGridNode } from '@/components/ExpandedGridNodePanel';
import { ExpandedGridMultiSelectPanel, type SelectedExpandedGridNodes } from '@/components/ExpandedGridMultiSelectPanel';
import { MainNodeMultiSelectPanel } from '@/components/MainNodeMultiSelectPanel';
import { DataObjectsCanvas } from '@/components/DataObjectsCanvas';
import { FlowsCanvas } from '@/components/FlowsCanvas';
import { SystemFlowsCanvas } from '@/components/SystemFlowsCanvas';
import { TestingCanvas } from '@/components/TestingCanvas';
import { AppHeader, type AppView } from '@/components/AppHeader';
import { CommentsPanel } from '@/components/CommentsPanel';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';
import {
  loadExpandedStates,
  saveExpandedStates,
  buildParentPath,
  buildExpandedNodeParentPath,
  type ExpandedStateEntry,
  type ExpandedStateData,
} from '@/lib/expanded-state-storage';
import { matchNodeToExpandedState } from '@/lib/expanded-state-matcher';
import { syncExpandedState } from '@/lib/expanded-state-sync';
import { loadDimensionDescriptions, saveDimensionDescriptions, type DimensionDescriptionEntry } from '@/lib/dimension-description-storage';
import { loadFlowNodeStates, saveFlowNodeStates, type FlowNodeEntry, buildFlowNodeParentPath } from '@/lib/flow-node-storage';
import { buildProcessRunningNumberMap } from '@/lib/process-running-number-map';
import { matchNodeToDimensionDescription } from '@/lib/dimension-description-matcher';
import { buildExpandedNodeIdToRunningNumberLookup } from '@/lib/expanded-running-number-lookup';
import { useExpandedMainDataObjectInheritance } from '@/hooks/use-expanded-main-data-object-inheritance';
import { useChangeViewWithSelectionReset } from '@/hooks/use-change-view-with-selection-reset';
import type { TagViewState } from '@/types/tagging';
import { ImportMarkdownModal } from '@/components/ImportMarkdownModal';
import { ensureLocalFileStore, saveLocalFileStore, setLocalFileLayoutDirection, type LocalFile } from '@/lib/local-file-store';
import { loadFileSnapshot, saveFileSnapshot } from '@/lib/local-doc-snapshots';
import { useAuth } from '@/hooks/use-auth';
import { usePinnedTags } from '@/hooks/use-pinned-tags';
import { useToolbarPinnedTags } from '@/hooks/use-toolbar-pinned-tags';
import { Database, FlaskConical, LayoutDashboard, Network, Workflow } from 'lucide-react';
import { normalizeLayoutDirection, type LayoutDirection } from '@/lib/layout-direction';

type ActiveFileMeta = {
  id: string;
  name: string;
  folderId: string | null;
  roomName: string;
  canEdit: boolean;
  initialContent?: string;
};

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function canEditFromAccess(access: any, userEmail: string | null) {
  const people = access?.people;
  if (!Array.isArray(people) || people.length === 0) return false;
  if (!userEmail) return false;
  const e = normalizeEmail(userEmail);
  return people.some((p: any) => normalizeEmail(String(p?.email || '')) === e && String(p?.role || 'view') === 'edit');
}

export function EditorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, ready, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const [activeFile, setActiveFile] = useState<ActiveFileMeta | null>(null);
  const activeRoomName = activeFile?.roomName || 'nexus-demo';
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('horizontal');

  const { doc, provider, status, presence, undo, redo, canUndo, canRedo } = useYjs(activeRoomName);
  const presenceRef = useRef<typeof presence>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [mainLevel, setMainLevel] = useState(1);
  const [mainCanvasFocusTick, setMainCanvasFocusTick] = useState(0);
  const [roots, setRoots] = useState<NexusNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedExpandedGridNode, setSelectedExpandedGridNode] = useState<
    SelectedExpandedGridNode | SelectedExpandedGridNodes | null
  >(null);
  const [activeView, setActiveView] = useState<AppView>('main');
  const [centerTransformLabel, setCenterTransformLabel] = useState<string>('');
  const [tagView, setTagView] = useState<TagViewState>({
    activeGroupId: 'tg-ungrouped',
    visibleTagIds: [],
    highlightedTagIds: [],
  });

  const pinnedTags = usePinnedTags(doc);
  const pinnedTagIds = pinnedTags.tagIds || [];
  const { toolbarPinnedTagIds, onPinnedTagIdsChange, onSelectedFlowChange, onSelectedFlowPinnedTagIdsChange } =
    useToolbarPinnedTags({
      doc,
      activeView,
      globalPinnedTagIds: pinnedTagIds,
    });

  useEffect(() => {
    // Clear when switching views so we don't show stale coords.
    setCenterTransformLabel('');
    const onTransform = (evt: Event) => {
      const e = evt as CustomEvent<{ view?: string; x?: number; y?: number; z?: number }>;
      const d = e.detail;
      if (!d || typeof d.view !== 'string') return;
      if (d.view !== activeView) return;
      const x = typeof d.x === 'number' ? d.x : NaN;
      const y = typeof d.y === 'number' ? d.y : NaN;
      const z = typeof d.z === 'number' ? d.z : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      setCenterTransformLabel(`x:${Math.round(x)} y:${Math.round(y)} z:${Math.round(z * 100) / 100}`);
    };
    window.addEventListener('diregram:viewTransform', onTransform as EventListener);
    return () => window.removeEventListener('diregram:viewTransform', onTransform as EventListener);
  }, [activeView]);

  // Lifted State: Map<HubNodeId, SelectedConditions> (Record<key, value>)
  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>({});

  const [commentPanel, setCommentPanel] = useState<{
    targetKey: string | null;
    targetLabel?: string;
    scrollToThreadId?: string;
  }>({ targetKey: null });

  const [showImportMarkdown, setShowImportMarkdown] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Expanded nodes state: Set of node IDs that are expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  // When incremented, canvases will re-center/fit to content (useful after full markdown import).
  const [viewportResetTick, setViewportResetTick] = useState(0);

  // Process flow mode state: Set of process node IDs that have flow features enabled (type switcher, connector labels)
  const [processFlowModeNodes, setProcessFlowModeNodes] = useState<Set<string>>(new Set());
  const didRestoreProcessFlowModeNodesRef = useRef(false);

  // Build node map for parent path lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, NexusNode>();
    const traverse = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        map.set(node.id, node);
        if (node.isHub && node.variants) {
          node.variants.forEach((v) => {
            map.set(v.id, v);
            traverse(v.children);
          });
        } else {
          traverse(node.children);
        }
      });
    };
    traverse(roots);
    return map;
  }, [roots]);

  // IMPORTANT: running number namespaces
  const expandedRunningNumberMapRef = useRef<Map<string, number>>(new Map()); // node.id -> expanded running number
  const processRunningNumberMapRef = useRef<Map<string, number>>(new Map()); // node.id -> process/flow running number

  // Stable callbacks (avoid render loops in child effects that depend on these)
  const getRunningNumber = useCallback((nodeId: string) => expandedRunningNumberMapRef.current.get(nodeId), []);
  const getProcessRunningNumber = useCallback(
    (nodeId: string) => processRunningNumberMapRef.current.get(nodeId),
    [],
  );
  const canvasRootFilter = useCallback((root: NexusNode) => !(root.metadata as any)?.flowTab && !(root.metadata as any)?.systemFlow, []);
  const canvasPruneSubtree = useCallback((n: NexusNode) => !!(n.metadata as any)?.flowTab || !!(n.metadata as any)?.systemFlow, []);

  // Reset one-time restores when switching docs
  useEffect(() => {
    didRestoreProcessFlowModeNodesRef.current = false;
  }, [doc]);

  const changeView = useChangeViewWithSelectionReset({
    setActiveView,
    setSelectedNodeId,
    setSelectedNodeIds,
    setSelectedExpandedGridNode,
  });

  // Editor opens ONE file, chosen via ?file=<id>.
  // - Supabase mode: file id is a UUID from DB; RLS enforces access.
  // - Local mode: file id is from localStorage.
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
      setLayoutDirection(normalizeLayoutDirection(file.layoutDirection));
      setActiveFile({
        id: file.id,
        name: file.name,
        folderId: file.folderId,
        roomName: file.roomName,
        canEdit: true,
        initialContent: loadFileSnapshot(file.id) || '',
      });
      return;
    }

    // Supabase mode (async)
    (async () => {
      if (!ready) return;
      // Create a client on-demand (safe client-side).
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();
      if (!supabase) return;

      try {
        // Fetch file row; RLS ensures only allowed files are returned.
        const { data: fileRow, error: fileErr } = await supabase
          .from('files')
          .select('id,name,folder_id,room_name,content,access,owner_id,layout_direction')
          .eq('id', fileIdFromUrl)
          .single();
        if (fileErr || !fileRow) throw fileErr || new Error('File not found');

        // Compute effective layout direction: per-file override, else per-account default, else horizontal.
        const fileLayoutRaw = (fileRow as { layout_direction?: string | null }).layout_direction;
        let effectiveLayoutDirection: LayoutDirection = normalizeLayoutDirection(fileLayoutRaw);
        if (!fileLayoutRaw) {
          const uid = user?.id;
          if (!uid) {
            setLayoutDirection(effectiveLayoutDirection);
          } else {
          try {
            const { data: profileRow } = await supabase
              .from('profiles')
              .select('default_layout_direction')
              .eq('id', uid)
              .maybeSingle();
            const raw = (profileRow as { default_layout_direction?: string | null } | null)?.default_layout_direction;
            effectiveLayoutDirection = normalizeLayoutDirection(raw);
          } catch {
            // ignore
          }
          }
        }
        setLayoutDirection(effectiveLayoutDirection);

        const folderId = fileRow.folder_id as string | null;
        const { data: folderRow } = folderId
          ? await supabase.from('folders').select('id,owner_id,access').eq('id', folderId).maybeSingle()
          : { data: null as any };

        const isOwner = user?.id && fileRow.owner_id === user.id;
        const canEdit =
          !!isOwner ||
          canEditFromAccess(fileRow.access, user?.email || null) ||
          canEditFromAccess(folderRow?.access, user?.email || null);

        if (!canEdit) {
          // Read-only mode isn't supported by the editor yet.
          router.replace('/workspace');
          return;
        }

        const roomName = (fileRow.room_name as string | null) || `file-${fileRow.id}`;
        if (!fileRow.room_name) {
          // best-effort
          supabase.from('files').update({ room_name: roomName }).eq('id', fileRow.id).then(() => {});
        }

        // Touch "last opened"
        supabase.from('files').update({ last_opened_at: new Date().toISOString() }).eq('id', fileRow.id).then(() => {});

        if (cancelled) return;
        setActiveFile({
          id: fileRow.id,
          name: fileRow.name,
          folderId,
          roomName,
          canEdit: true,
          initialContent: (fileRow.content as string) || '',
        });
      } catch {
        router.replace('/workspace');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, supabaseMode, ready, user?.id, user?.email, router]);

  const persistLayoutDirectionForActiveFile = useCallback(
    async (next: LayoutDirection) => {
      setLayoutDirection(next);
      if (!activeFile) return;

      // Local mode persistence
      if (!supabaseMode) {
        const store = ensureLocalFileStore();
        const updated = setLocalFileLayoutDirection(store, activeFile.id, next);
        saveLocalFileStore(updated);
        return;
      }

      // Supabase persistence (best-effort; keep UI responsive even if offline)
      try {
        const { createClient } = await import('@/lib/supabase');
        const supabase = createClient();
        if (!supabase) return;
        await supabase.from('files').update({ layout_direction: next }).eq('id', activeFile.id);
      } catch {
        // ignore
      }
    },
    [activeFile?.id, supabaseMode],
  );

  // Persistence:
  // - Local-only mode: localStorage snapshot
  // - Supabase mode: also save to `files.content` (debounced) and restore if doc empty
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!doc || !provider || !activeFile) return;
    const fileId = activeFile.id;
    const yText = doc.getText('nexus');

    const maybeRestore = () => {
      const current = yText.toString();
      if (current.trim().length > 0) return;
      const snap = activeFile.initialContent || loadFileSnapshot(fileId);
      if (!snap || snap.trim().length === 0) return;
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, snap);
      });
    };

    // Attempt restore once the provider says we're synced.
    const onSynced = () => {
      maybeRestore();
    };
    // Hocuspocus provider supports .on('synced', ...)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).on?.('synced', onSynced);
    // Also try once immediately (safe because we only restore if empty).
    maybeRestore();

    const onTextChange = () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        const next = yText.toString();
        saveFileSnapshot(fileId, next);
        if (supabaseMode) {
          import('@/lib/supabase').then(({ createClient }) => {
            const supabase = createClient();
            if (!supabase) return;
            supabase.from('files').update({ content: next, updated_at: new Date().toISOString() }).eq('id', fileId).then(() => {});
          });
        }
      }, 250);
    };

    // Save initial content too (covers new docs)
    onTextChange();
    yText.observe(onTextChange);

    return () => {
      yText.unobserve(onTextChange);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider as any).off?.('synced', onSynced);
    };
  }, [doc, provider, activeFile?.id, supabaseMode]);

  // Keep presence view in sync with the active app view.
  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);

  useEffect(() => {
    // Only react to view changes (not presence identity changes due to peer updates).
    presenceRef.current?.setView(activeView);
  }, [activeView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLSelectElement) return;

      if (e.key.toLowerCase() === 'v') setActiveTool('select');
      if (e.key.toLowerCase() === 'r') setActiveTool('node');
      if (e.key.toLowerCase() === 'l') setActiveTool('line');
      if (e.key.toLowerCase() === 'c') setActiveTool('comment');
      if (e.key.toLowerCase() === 'a') setActiveTool('annotation');
      if (e.key.toLowerCase() === 'd') changeView((v) => (v === 'dataObjects' ? 'main' : 'dataObjects'));
      if (e.key.toLowerCase() === 'f') changeView((v) => (v === 'flows' ? 'main' : 'flows'));
      if (e.key.toLowerCase() === 's') changeView((v) => (v === 'systemFlow' ? 'main' : 'systemFlow'));
      if (e.key.toLowerCase() === 't') changeView((v) => (v === 'testing' ? 'main' : 'testing'));

      // Undo / Redo (per-user)
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (isCmd && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeView, undo, redo]);

  const handleToolChange = (tool: ToolType) => {
    setActiveTool(tool);
    if (tool === 'comment') {
      setCommentPanel((p) => ({ ...p, targetKey: p.targetKey ?? null }));
    }
  };

  // Parse NexusMarkdown in Parent
  useEffect(() => {
    if (!doc) return;
    const yText = doc.getText('nexus');

    const update = () => {
      const parsedRoots = parseNexusMarkdown(yText.toString());

      // Keep the process running-number lookup in sync with the parsed tree *immediately*.
      // Node ids are derived from lineIndex (node-<lineIndex>), so inserting/deleting lines
      // can change ids for many nodes. If this lookup updates later (in another effect),
      // flow node types can temporarily fall back to defaults, causing brief diamond/layout shifts.
      try {
        processRunningNumberMapRef.current = buildProcessRunningNumberMap({ doc, roots: parsedRoots });
      } catch {
        // Best-effort only; don't block rendering on mapping failures.
      }

      setRoots(parsedRoots);
    };

    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  // Track if we're currently loading to prevent save loop
  const isLoadingExpandedStates = useRef(false);
  const isLoadingDimensionDescriptions = useRef(false);

  // Load expanded states from markdown and match to current nodes by running number
  useEffect(() => {
    if (!doc || roots.length === 0 || isLoadingExpandedStates.current) return;

    isLoadingExpandedStates.current = true;
    const stateData = loadExpandedStates(doc);

    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    // Build node map for parent path building (needed for both expanded states and flow nodes)
    const nodeMapLocal = new Map<string, NexusNode>();
    const buildNodeMap = (nodes: NexusNode[]) => {
      nodes.forEach((n) => {
        nodeMapLocal.set(n.id, n);
        if (n.isHub && n.variants) {
          n.variants.forEach((v) => {
            nodeMapLocal.set(v.id, v);
            buildNodeMap(v.children);
          });
        } else {
          buildNodeMap(n.children);
        }
      });
    };
    buildNodeMap(roots);

    const syncResult = syncExpandedState(currentText, stateData, roots, nodeMapLocal);
    const { runningNumberToNodeId, entryMap, nodesWithComments, entriesToSave } = syncResult;

    expandedRunningNumberMapRef.current = buildExpandedNodeIdToRunningNumberLookup({
      markdown: currentText,
      roots,
      fallbackRunningNumberToNodeId: runningNumberToNodeId,
    });
    const nextProcessMap = new Map<string, number>();

    // Also load flow node states and match them
    const flowNodeData = loadFlowNodeStates(doc);
    const flowRunningNumberToNodeId = new Map<number, string>();

    const traverseFlow = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        if (node.isFlowNode && !node.isCommon) {
          const nodeParentPath = buildFlowNodeParentPath(node, nodeMapLocal, roots);
          // Match by content + parentPath.
          // Do NOT match by lineIndex: inserting nodes changes line indices and can reattach
          // running numbers (and thus types) to the wrong nodes.
          const matchingEntry = flowNodeData.entries.find((e) => {
            return (
              e.content === node.content.trim() &&
              e.parentPath.length === nodeParentPath.length &&
              e.parentPath.every((p, i) => p === nodeParentPath[i])
            );
          });

          if (matchingEntry) {
            flowRunningNumberToNodeId.set(matchingEntry.runningNumber, node.id);
            nextProcessMap.set(node.id, matchingEntry.runningNumber);
          }
        } else if (node.isFlowNode && node.isCommon) {
          const nodeParentPath = buildParentPath(node, nodeMapLocal);
          const matchingEntry = flowNodeData.entries.find((e) => {
            return (
              e.content === node.content.trim() &&
              e.parentPath.length === nodeParentPath.length &&
              e.parentPath.every((p, i) => p === nodeParentPath[i])
            );
          });

          if (matchingEntry) {
            flowRunningNumberToNodeId.set(matchingEntry.runningNumber, node.id);
            nextProcessMap.set(node.id, matchingEntry.runningNumber);
          }
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => traverseFlow(v.children));
        } else {
          traverseFlow(node.children);
        }
      });
    };
    traverseFlow(roots);
    // Swap in at the end so there is never a "cleared" window.
    processRunningNumberMapRef.current = nextProcessMap;

    // Restore initial process flow mode nodes based on matched running numbers.
    if (!didRestoreProcessFlowModeNodesRef.current) {
      didRestoreProcessFlowModeNodesRef.current = true;

      const matchedFlowNodeIds = new Set(Array.from(flowRunningNumberToNodeId.values()));
      const rootProcessNodeIds = new Set<string>();
      matchedFlowNodeIds.forEach((nodeId) => {
        const node = nodeMapLocal.get(nodeId);
        if (node && node.isFlowNode) {
          const isRootProcessNode = !node.parentId || !nodeMapLocal.get(node.parentId)?.isFlowNode;
          if (isRootProcessNode) rootProcessNodeIds.add(nodeId);
        }
      });

      setProcessFlowModeNodes((prev) => {
        const prevSet = prev || new Set<string>();
        const merged = new Set(prevSet);
        rootProcessNodeIds.forEach((id) => merged.add(id));

        const prevArray = Array.from(prevSet).sort().join(',');
        const mergedArray = Array.from(merged).sort().join(',');
        if (prevArray === mergedArray) return prev;
        return merged;
      });
    }

    if (entriesToSave.length > 0) {
      saveExpandedStates(
        doc,
        {
          nextRunningNumber: stateData.nextRunningNumber,
          entries: entriesToSave,
        },
        new Set(entryMap.keys()),
      );
    }

    // IMPORTANT: Avoid resetting React state when the expanded set hasn't actually changed.
    // This effect runs on many markdown edits (including flow/show-flow metadata writes), and
    // unconditionally creating a new Set here causes extra re-renders that can restart layout
    // animations (perceived as flicker/jerky looping).
    setExpandedNodes((prev) => {
      const prevSet = prev || new Set<string>();
      if (prevSet.size !== nodesWithComments.size) return new Set(nodesWithComments);
      for (const id of prevSet) {
        if (!nodesWithComments.has(id)) return new Set(nodesWithComments);
      }
      return prev;
    });

    setTimeout(() => {
      isLoadingExpandedStates.current = false;
    }, 100);
  }, [doc, roots]);

  // Save expanded states to markdown when they change (but not during load)
  const prevExpandedNodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!doc || roots.length === 0 || isLoadingExpandedStates.current) return;

    const currentIds = Array.from(expandedNodes).sort().join(',');
    const prevIds = Array.from(prevExpandedNodesRef.current).sort().join(',');
    if (currentIds === prevIds) return;

    prevExpandedNodesRef.current = new Set(expandedNodes);

    const currentStateData = loadExpandedStates(doc);
    let nextRunningNumber = currentStateData.nextRunningNumber;

    const entryMap = new Map<number, ExpandedStateEntry>();
    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    const traverseForMatching = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        const match = matchNodeToExpandedState(node, currentText, currentStateData.entries, nodeMap, roots);

        if (match !== null) {
          const nodeParentPath = buildExpandedNodeParentPath(node, nodeMap, roots);
          const updatedEntry: ExpandedStateEntry = {
            runningNumber: match.runningNumber,
            content: node.content.trim(),
            parentPath: nodeParentPath,
            lineIndex: node.lineIndex,
          };
          entryMap.set(match.runningNumber, updatedEntry);
          expandedRunningNumberMapRef.current.set(node.id, match.runningNumber);
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => {
            const vMatch = matchNodeToExpandedState(v, currentText, currentStateData.entries, nodeMap, roots);

            if (vMatch !== null) {
              const vParentPath = buildExpandedNodeParentPath(v, nodeMap, roots);
              const vUpdatedEntry: ExpandedStateEntry = {
                runningNumber: vMatch.runningNumber,
                content: v.content.trim(),
                parentPath: vParentPath,
                lineIndex: v.lineIndex,
              };
              entryMap.set(vMatch.runningNumber, vUpdatedEntry);
              expandedRunningNumberMapRef.current.set(v.id, vMatch.runningNumber);
            }
            traverseForMatching(v.children);
          });
        } else {
          traverseForMatching(node.children);
        }
      });
    };
    traverseForMatching(roots);

    const expandedRunningNumbers = new Set<number>();
    const traverseForExpanded = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        if (expandedNodes.has(node.id)) {
          let runningNumber = expandedRunningNumberMapRef.current.get(node.id);

          if (runningNumber === undefined) {
            runningNumber = nextRunningNumber++;
            expandedRunningNumberMapRef.current.set(node.id, runningNumber);
          }
          expandedRunningNumbers.add(runningNumber);

          entryMap.set(runningNumber, {
            runningNumber,
            content: node.content.trim(),
            parentPath: buildExpandedNodeParentPath(node, nodeMap, roots),
            lineIndex: node.lineIndex,
          });
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => {
            if (expandedNodes.has(v.id)) {
              let runningNumber = expandedRunningNumberMapRef.current.get(v.id);

              if (runningNumber === undefined) {
                runningNumber = nextRunningNumber++;
                expandedRunningNumberMapRef.current.set(v.id, runningNumber);
              }
              expandedRunningNumbers.add(runningNumber);

              entryMap.set(runningNumber, {
                runningNumber,
                content: v.content.trim(),
                parentPath: buildExpandedNodeParentPath(v, nodeMap, roots),
                lineIndex: v.lineIndex,
              });
            }
            traverseForExpanded(v.children);
          });
        } else {
          traverseForExpanded(node.children);
        }
      });
    };
    traverseForExpanded(roots);

    saveExpandedStates(
      doc,
      {
        nextRunningNumber,
        entries: Array.from(entryMap.values()),
      },
      expandedRunningNumbers,
    );
  }, [doc, expandedNodes, roots, nodeMap]);

  useExpandedMainDataObjectInheritance(doc, roots);

  // Load and save flow node states (assign running numbers to process flow mode nodes)
  const prevProcessFlowModeNodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!doc || roots.length === 0) return;

    const currentIds = Array.from(processFlowModeNodes).sort().join(',');
    const prevIds = Array.from(prevProcessFlowModeNodesRef.current).sort().join(',');
    if (currentIds === prevIds) return;

    prevProcessFlowModeNodesRef.current = new Set(processFlowModeNodes);

    const flowNodeData = loadFlowNodeStates(doc);
    let nextRunningNumber = flowNodeData.nextRunningNumber;
    const entryMap = new Map<number, FlowNodeEntry>();

    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    const traverseForMatching = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        if (node.isFlowNode) {
          const matchingEntry = flowNodeData.entries.find((e) => e.lineIndex === node.lineIndex && e.content === node.content.trim());

          if (matchingEntry) {
            entryMap.set(matchingEntry.runningNumber, {
              ...matchingEntry,
              parentPath: buildParentPath(node, nodeMap),
              lineIndex: node.lineIndex,
            });
            processRunningNumberMapRef.current.set(node.id, matchingEntry.runningNumber);
          }
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => traverseForMatching(v.children));
        } else {
          traverseForMatching(node.children);
        }
      });
    };
    traverseForMatching(roots);

    const traverseForExpanded = (nodes: NexusNode[], parentIsProcessNode = false, rootProcessNodeId: string | null = null) => {
      nodes.forEach((node) => {
        let isInProcessFlowMode = false;
        let effectiveRootId = rootProcessNodeId;
        const isProcessNode = node.isFlowNode;

        if (isProcessNode) {
          const isRootProcessNode = !parentIsProcessNode;

          if (isRootProcessNode) {
            if (processFlowModeNodes.has(node.id)) {
              isInProcessFlowMode = true;
              effectiveRootId = node.id;
            }
          } else {
            if (rootProcessNodeId && processFlowModeNodes.has(rootProcessNodeId)) {
              isInProcessFlowMode = true;
              effectiveRootId = rootProcessNodeId;
            }
          }
        } else if (rootProcessNodeId && processFlowModeNodes.has(rootProcessNodeId)) {
          effectiveRootId = rootProcessNodeId;
        }

        if (node.isFlowNode && isInProcessFlowMode) {
          let runningNumber = processRunningNumberMapRef.current.get(node.id);

          if (runningNumber === undefined) {
            runningNumber = nextRunningNumber++;
            processRunningNumberMapRef.current.set(node.id, runningNumber);
          }

          const parentPath = node.isCommon ? buildParentPath(node, nodeMap) : buildFlowNodeParentPath(node, nodeMap, roots);

          entryMap.set(runningNumber, {
            runningNumber,
            content: node.content.trim(),
            parentPath,
            lineIndex: node.lineIndex,
          });
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => traverseForExpanded(v.children, isProcessNode, effectiveRootId));
        } else {
          traverseForExpanded(node.children, isProcessNode, effectiveRootId);
        }
      });
    };
    traverseForExpanded(roots);

    saveFlowNodeStates(doc, {
      nextRunningNumber,
      entries: Array.from(entryMap.values()),
    });
  }, [doc, processFlowModeNodes, roots, nodeMap]);

  // Load and update dimension description running numbers when nodes move
  const prevDimensionDescEntriesRef = useRef<string>('');
  useEffect(() => {
    if (!doc || roots.length === 0 || isLoadingDimensionDescriptions.current) return;

    isLoadingDimensionDescriptions.current = true;
    const descData = loadDimensionDescriptions(doc);

    const entriesKey = JSON.stringify(
      descData.entries
        .map((e) => ({
          rn: e.runningNumber,
          li: e.lineIndex,
          pp: e.parentPath.join('|'),
        }))
        .sort((a, b) => a.rn - b.rn),
    );

    if (entriesKey === prevDimensionDescEntriesRef.current) {
      isLoadingDimensionDescriptions.current = false;
      return;
    }

    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    const entriesToUpdate: { runningNumber: number; newLineIndex: number }[] = [];

    const traverse = (nodes: NexusNode[]) => {
      nodes.forEach((node) => {
        if (node.isHub && node.variants) {
          const dimensionKeys = new Set<string>();
          node.variants.forEach((v) => {
            if (v.conditions) {
              Object.keys(v.conditions).forEach((key) => dimensionKeys.add(key));
            }
          });

          dimensionKeys.forEach((dimensionKey) => {
            for (const mode of ['flow', 'table'] as const) {
              const match = matchNodeToDimensionDescription(
                node,
                dimensionKey,
                mode,
                currentText,
                descData.entries,
                nodeMap,
              );

              if (match && (match.needsLineIndexUpdate || match.needsParentPathUpdate)) {
                entriesToUpdate.push({
                  runningNumber: match.runningNumber,
                  newLineIndex: node.lineIndex,
                });
              }
            }
          });

          node.variants.forEach((v) => traverse(v.children));
        } else {
          traverse(node.children);
        }
      });
    };
    traverse(roots);

    if (entriesToUpdate.length > 0) {
      const updatedEntriesMap = new Map<number, DimensionDescriptionEntry>();

      entriesToUpdate.forEach((update) => {
        const originalEntry = descData.entries.find((e) => e.runningNumber === update.runningNumber);
        if (originalEntry) {
          const matchingNode = Array.from(nodeMap.values()).find(
            (n) => n.content === originalEntry.content && n.lineIndex === update.newLineIndex,
          );

          if (matchingNode) {
            updatedEntriesMap.set(update.runningNumber, {
              ...originalEntry,
              parentPath: buildParentPath(matchingNode, nodeMap),
              lineIndex: update.newLineIndex,
            });
          }
        }
      });

      const finalEntries = descData.entries.map((entry) => {
        const updated = updatedEntriesMap.get(entry.runningNumber);
        return updated || entry;
      });

      saveDimensionDescriptions(doc, {
        nextRunningNumber: descData.nextRunningNumber,
        entries: finalEntries,
      });
      prevDimensionDescEntriesRef.current = JSON.stringify(
        finalEntries
          .map((e) => ({
            rn: e.runningNumber,
            li: e.lineIndex,
            pp: e.parentPath.join('|'),
          }))
          .sort((a, b) => a.rn - b.rn),
      );
    }

    isLoadingDimensionDescriptions.current = false;
  }, [doc, roots, nodeMap]);

  const selectedNode = useMemo<NexusNode | null>(() => {
    if (!selectedNodeId) return null;
    let found: NexusNode | null = null;

    const traverse = (nodes: NexusNode[]) => {
      for (const node of nodes) {
        if (node.id === selectedNodeId) {
          found = node;
          return;
        }
        if (node.isHub && node.variants) {
          if (node.variants.some((v) => v.id === selectedNodeId)) {
            found = node;
            return;
          }
        }

        if (node.isHub && node.variants) {
          node.variants.forEach((v) => traverse(v.children));
        } else {
          traverse(node.children);
        }
        if (found) return;
      }
    };
    traverse(roots);
    return found;
  }, [selectedNodeId, roots]);

  const selectedActiveVariantId = useMemo(() => {
    if (!selectedNode || !selectedNode.isHub || !selectedNode.variants) return null;

    const selectedConditions = activeVariantState[selectedNode.id];
    if (!selectedConditions || Object.keys(selectedConditions).length === 0) {
      return selectedNode.variants[0]?.id ?? null;
    }

    const matchingVariant = selectedNode.variants.find((v) => {
      if (!v.conditions) return false;
      return Object.entries(selectedConditions).every(([key, value]) => v.conditions?.[key] === value);
    });

    return matchingVariant?.id ?? selectedNode.variants[0]?.id ?? null;
  }, [selectedNode, activeVariantState]);

  if (!doc) return <div className="flex h-screen items-center justify-center">Loading Collaboration Engine...</div>;

  // Emergency clear function - completely resets the database (current doc only)
  const clearDatabase = () => {
    if (!doc || !confirm('Are you sure you want to clear all nodes and reset the database? This cannot be undone.')) return;

    const yText = doc.getText('nexus');
    const currentText = yText.toString();

    let cleaned = currentText
      .replace(/```expanded-states\n[\s\S]*?\n```/g, '')
      .replace(/```dimension-descriptions\n[\s\S]*?\n```/g, '')
      .replace(/```conditional-hub-notes\n[\s\S]*?\n```/g, '')
      .replace(/```tag-store\n[\s\S]*?\n```/g, '')
      .replace(/```data-objects\n[\s\S]*?\n```/g, '')
      .replace(/```systemflow-[^\n]+\n[\s\S]*?\n```/g, '')
      .replace(/```expanded-grid-\d+\n[\s\S]*?\n```/g, '')
      .replace(/```expanded-metadata-\d+\n[\s\S]*?\n```/g, '')
      .replace(/```expanded-grid-node-\d+\n[\s\S]*?\n```/g, '')
      .replace(/```expanded-metadata-node-\d+\n[\s\S]*?\n```/g, '');

    cleaned = cleaned
      .replace(/<!--\s*expanded:\d+\s*-->/g, '')
      .replace(/<!--\s*desc:[^>]*\s*-->/g, '')
      .replace(/<!--\s*ann:[^>]*\s*-->/g, '')
      .replace(/<!--\s*rn:\d+\s*-->/g, '')
      .replace(/<!--\s*expid:\d+\s*-->/g, '')
      .replace(/<!--\s*sfid:[^>]*\s*-->/g, '')
      .replace(/<!--\s*icon:[\s\S]*?\s*-->/g, '')
      .replace(/<!--\s*tags:[^>]*\s*-->/g, '');
    cleaned = cleaned.replace(/<!--\s*uiType:[^>]*\s*-->/g, '');
    cleaned = cleaned.replace(/<!--\s*hubnote:\d+\s*-->/g, '');
    cleaned = cleaned.replace(/<!--\s*do:[^>]*\s*-->/g, '');
    cleaned = cleaned.replace(/<!--\s*doattrs:[^>]*\s*-->/g, '');

    const separatorIndex = cleaned.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      cleaned = cleaned.slice(0, separatorIndex);
    }

    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, 'Root Node');
    });

    setExpandedNodes(new Set());
    setSelectedNodeId(null);
    expandedRunningNumberMapRef.current.clear();
    processRunningNumberMapRef.current.clear();
    prevDimensionDescEntriesRef.current = '';
    isLoadingExpandedStates.current = false;
    isLoadingDimensionDescriptions.current = false;
  };

  const viewBarWidthClass =
    activeView === 'testing'
      ? 'w-[320px] max-w-[38vw] min-w-[220px]'
      : 'w-[280px] max-w-[35vw] min-w-[200px]';

  return (
    <main className="mac-desktop flex h-screen flex-col">
      <AppHeader
        status={status}
        onClearDatabase={clearDatabase}
        onOpenImportMarkdown={() => setShowImportMarkdown(true)}
        activeFileName={activeFile?.name}
        onlineCount={presence ? 1 + presence.peers.length : undefined}
      />

      <ImportMarkdownModal
        doc={doc}
        isOpen={showImportMarkdown}
        onClose={() => setShowImportMarkdown(false)}
        onDidReplace={() => {
          // After a full markdown replace, reset interaction state so the canvas
          // is immediately usable (selection/tools/focus can otherwise feel "stuck").
          setViewportResetTick((n) => n + 1);
          setMainCanvasFocusTick((n) => n + 1);
          setActiveTool('select');
          setSelectedNodeId(null);
          setSelectedNodeIds([]);
          setTagView((prev) => ({ ...prev, visibleTagIds: [], highlightedTagIds: [] }));
          setExpandedNodes(new Set());
          setProcessFlowModeNodes(new Set());
        }}
      />

      <div className="flex-1 overflow-hidden relative">
        {/* View bar: overlays top-left, above left panels only (doesn't shrink right side). */}
        <div className="absolute left-4 top-2 z-50 pointer-events-auto">
          <div className={`${viewBarWidthClass} inline-flex items-center justify-between mac-double-outline bg-white px-2 py-1`}>
              <div className="relative group">
                <button
                  type="button"
                  className={`mac-btn h-8 w-8 flex items-center justify-center ${activeView === 'main' ? 'mac-btn--primary' : ''}`}
                  onClick={() => changeView('main')}
                  aria-label="Canvas"
                >
                  <Network size={16} />
                </button>
                <span className="mac-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Canvas
                </span>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  className={`mac-btn h-8 w-8 flex items-center justify-center ${activeView === 'flows' ? 'mac-btn--primary' : ''}`}
                  onClick={() => changeView('flows')}
                  aria-label="Flow (F)"
                >
                  <Workflow size={16} />
                </button>
                <span className="mac-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Flow (F)
                </span>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  className={`mac-btn h-8 w-8 flex items-center justify-center ${activeView === 'systemFlow' ? 'mac-btn--primary' : ''}`}
                  onClick={() => changeView('systemFlow')}
                  aria-label="System Flow (S)"
                >
                  <LayoutDashboard size={16} />
                </button>
                <span className="mac-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  System Flow (S)
                </span>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  className={`mac-btn h-8 w-8 flex items-center justify-center ${activeView === 'dataObjects' ? 'mac-btn--primary' : ''}`}
                  onClick={() => changeView('dataObjects')}
                  aria-label="Data Objects (D)"
                >
                  <Database size={16} />
                </button>
                <span className="mac-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Data Objects (D)
                </span>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  className={`mac-btn h-8 w-8 flex items-center justify-center ${activeView === 'testing' ? 'mac-btn--primary' : ''}`}
                  onClick={() => changeView('testing')}
                  aria-label="Testing (T)"
                >
                  <FlaskConical size={16} />
                </button>
                <span className="mac-tooltip absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  Testing (T)
                </span>
              </div>
          </div>
        </div>

        <div className="absolute inset-0">
          {activeView === 'dataObjects' ? (
            <DataObjectsCanvas
              doc={doc}
              roots={roots.filter((r) => !(r.metadata as any)?.flowTab && !(r.metadata as any)?.systemFlow)}
              activeTool={activeTool}
              presence={presence}
              showComments={showComments}
              showAnnotations={showAnnotations}
              initialFitToContent
              onOpenComments={(info) => {
                setActiveTool('comment');
                setCommentPanel({
                  targetKey: info.targetKey,
                  targetLabel: info.targetLabel,
                  scrollToThreadId: info.scrollToThreadId,
                });
              }}
            />
          ) : activeView === 'flows' ? (
            <FlowsCanvas
              doc={doc}
              activeTool={activeTool}
              onToolUse={() => setActiveTool('select')}
              layoutDirection={layoutDirection}
              mainLevel={mainLevel}
              tagView={tagView}
              pinnedTagIds={pinnedTagIds}
              onSelectedFlowChange={onSelectedFlowChange}
              onSelectedFlowPinnedTagIdsChange={onSelectedFlowPinnedTagIdsChange}
              showComments={showComments}
              showAnnotations={showAnnotations}
              activeVariantState={activeVariantState}
              onActiveVariantChange={setActiveVariantState}
              presence={presence}
              viewportResetTick={viewportResetTick}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (id === null) setSelectedExpandedGridNode(null);
              }}
              selectedNodeIds={selectedNodeIds}
              onSelectNodeIds={(ids) => {
                setSelectedNodeIds(ids);
                if (ids.length > 0) setSelectedExpandedGridNode(null);
              }}
              expandedNodes={expandedNodes}
              onExpandedNodesChange={setExpandedNodes}
              processFlowModeNodes={processFlowModeNodes}
              onProcessFlowModeNodesChange={setProcessFlowModeNodes}
              getRunningNumber={getRunningNumber}
              getProcessRunningNumber={getProcessRunningNumber}
              onOpenComments={(info) => {
                setActiveTool('comment');
                setCommentPanel({
                  targetKey: info.targetKey,
                  targetLabel: info.targetLabel,
                  scrollToThreadId: info.scrollToThreadId,
                });
              }}
            />
          ) : activeView === 'systemFlow' ? (
            <SystemFlowsCanvas
              doc={doc}
              presence={presence}
              activeTool={activeTool}
              showComments={showComments}
              showAnnotations={showAnnotations}
              onOpenComments={(info) => {
                setActiveTool('comment');
                setCommentPanel({
                  targetKey: info.targetKey,
                  targetLabel: info.targetLabel,
                  scrollToThreadId: info.scrollToThreadId,
                });
              }}
            />
          ) : activeView === 'testing' ? (
            <TestingCanvas doc={doc} />
          ) : (
            <NexusCanvas
              getRunningNumber={getRunningNumber}
              getProcessRunningNumber={getProcessRunningNumber}
              doc={doc}
              presence={presence}
              presenceView="main"
              activeTool={activeTool}
              onToolUse={() => setActiveTool('select')}
              layoutDirection={layoutDirection}
              mainLevel={mainLevel}
              viewportResetTick={viewportResetTick}
              focusTick={mainCanvasFocusTick}
              showComments={showComments}
              showAnnotations={showAnnotations}
              initialFitToContent
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (id === null) setSelectedExpandedGridNode(null);
              }}
              selectedNodeIds={selectedNodeIds}
              onSelectNodeIds={(ids) => {
                setSelectedNodeIds(ids);
                if (ids.length > 0) setSelectedExpandedGridNode(null);
              }}
              tagView={tagView}
              pinnedTagIds={pinnedTagIds}
              activeVariantState={activeVariantState}
              onActiveVariantChange={setActiveVariantState}
              expandedNodes={expandedNodes}
              onExpandedNodesChange={setExpandedNodes}
              processFlowModeNodes={processFlowModeNodes}
              onProcessFlowModeNodesChange={setProcessFlowModeNodes}
              pruneSubtree={canvasPruneSubtree}
              selectedExpandedGridNode={
                selectedExpandedGridNode
                  ? {
                      runningNumber: selectedExpandedGridNode.runningNumber,
                      gridNodeKeys:
                        'gridNodeKeys' in selectedExpandedGridNode
                          ? selectedExpandedGridNode.gridNodeKeys
                          : [selectedExpandedGridNode.gridNodeKey],
                    }
                  : null
              }
              onSelectExpandedGridNode={(sel) => {
                setSelectedNodeIds([]);
                const keys = sel?.gridNodeKeys || [];
                setSelectedExpandedGridNode(
                  sel
                    ? keys.length > 1
                      ? {
                          runningNumber: sel.runningNumber,
                          gridNodeKeys: keys,
                          parentNodeLabel: sel.parentNodeLabel,
                          parentNodeId: sel.parentNodeId,
                        }
                      : {
                          runningNumber: sel.runningNumber,
                          gridNodeKey: keys[0],
                          parentNodeLabel: sel.parentNodeLabel,
                          parentNodeId: sel.parentNodeId,
                        }
                    : null,
                );
              }}
              rootFilter={canvasRootFilter}
              onOpenComments={(info) => {
                setActiveTool('comment');
                setCommentPanel({
                  targetKey: info.targetKey,
                  targetLabel: info.targetLabel,
                  scrollToThreadId: info.scrollToThreadId,
                });
              }}
            />
          )}
        </div>

        {/* Floating left window: markdown source (only on main canvas) */}
          {activeView === 'main' ? (
          <div
            className="absolute left-4 top-14 bottom-24 z-50 pointer-events-auto"
            data-editor-left-panel
            data-safe-panel="left"
            data-safe-panel-view="main"
          >
              <NexusEditor doc={doc} />
            </div>
          ) : null}

          {/* Floating right window(s) */}
          <div
            className="absolute right-4 top-4 bottom-24 z-50 pointer-events-auto"
            data-editor-right-panel
            data-safe-panel="right"
            data-safe-panel-view="*"
          >
          {activeTool === 'comment' ? (
            <CommentsPanel
              doc={doc}
              selectedTargetKey={commentPanel.targetKey}
              selectedTargetLabel={commentPanel.targetLabel}
              scrollToThreadId={commentPanel.scrollToThreadId || null}
              onClose={() => {
                setCommentPanel({ targetKey: null });
                setActiveTool('select');
              }}
            />
          ) : activeTool === 'annotation' ? null : activeView === 'main' ? (
            selectedNodeIds.length > 1 ? (
              <MainNodeMultiSelectPanel
                doc={doc}
                selectedNodeIds={selectedNodeIds}
                nodeMap={nodeMap}
                onClose={() => setSelectedNodeIds([])}
              />
            ) : selectedExpandedGridNode && 'gridNodeKeys' in selectedExpandedGridNode ? (
              <ExpandedGridMultiSelectPanel
                key={`${selectedExpandedGridNode.runningNumber}:${selectedExpandedGridNode.gridNodeKeys.join(',')}`}
                doc={doc}
                selection={selectedExpandedGridNode}
                nodeMap={nodeMap}
                onClose={() => setSelectedExpandedGridNode(null)}
              />
            ) : selectedExpandedGridNode ? (
              <ExpandedGridNodePanel
                key={`${selectedExpandedGridNode.runningNumber}:${selectedExpandedGridNode.gridNodeKey}`}
                doc={doc}
                selection={selectedExpandedGridNode}
                nodeMap={nodeMap}
                onClose={() => setSelectedExpandedGridNode(null)}
              />
            ) : selectedNode ? (
              <LogicPanel
                node={selectedNode}
                doc={doc}
                activeVariantId={selectedActiveVariantId}
                roots={roots}
                expandedNodes={expandedNodes}
                onExpandedNodesChange={setExpandedNodes}
                processFlowModeNodes={processFlowModeNodes}
                onProcessFlowModeNodesChange={setProcessFlowModeNodes}
                getRunningNumber={getRunningNumber}
                onSelectConditions={(conditions) => {
                  setActiveVariantState((prev) => ({
                    ...prev,
                    [selectedNode.id]: conditions,
                  }));
                }}
              />
            ) : null
          ) : null}
        </div>

        {activeView !== 'testing' ? (
          <Toolbar
            doc={doc}
            activeTool={activeTool}
            onToolChange={handleToolChange}
            layoutDirection={layoutDirection}
            onLayoutDirectionChange={persistLayoutDirectionForActiveFile}
            mainLevel={mainLevel}
            onMainLevelChange={setMainLevel}
            tagView={tagView}
            onTagViewChange={setTagView}
            pinnedTagIds={toolbarPinnedTagIds}
            onPinnedTagIdsChange={onPinnedTagIdsChange}
            showComments={showComments}
            onShowCommentsChange={(next) => {
              setShowComments(next);
              if (!next) {
                if (activeTool === 'comment') setActiveTool('select');
                setCommentPanel({ targetKey: null });
              }
            }}
            showAnnotations={showAnnotations}
            onShowAnnotationsChange={(next) => {
              setShowAnnotations(next);
              if (!next && activeTool === 'annotation') setActiveTool('select');
            }}
            variant={activeView === 'flows' || activeView === 'systemFlow' || activeView === 'dataObjects' ? 'notesOnly' : 'full'}
            onCenterView={() => {
              if (activeView === 'dataObjects') {
                window.dispatchEvent(new CustomEvent('diregram:dataobjectsTool', { detail: { tool: 'center' } }));
                return;
              }
              window.dispatchEvent(new CustomEvent('diregram:canvasTool', { detail: { tool: 'center', view: activeView } }));
            }}
            centerTooltip={centerTransformLabel}
            systemFlowTools={
              activeView === 'systemFlow'
                ? {
                    onAddBox: () => window.dispatchEvent(new CustomEvent('systemflow:tool', { detail: { type: 'addBox' } })),
                    onToggleLinkMode: () =>
                      window.dispatchEvent(new CustomEvent('systemflow:tool', { detail: { type: 'toggleLinkMode' } })),
                    onCreateZone: () =>
                      window.dispatchEvent(new CustomEvent('systemflow:tool', { detail: { type: 'createZone' } })),
                    onDeleteSelection: () =>
                      window.dispatchEvent(new CustomEvent('systemflow:tool', { detail: { type: 'deleteSelection' } })),
                  }
                : null
            }
            dataObjectsTools={
              activeView === 'dataObjects'
                ? {
                    onOpenManage: () =>
                      window.dispatchEvent(new CustomEvent('diregram:dataobjectsTool', { detail: { tool: 'manage' } })),
                    onZoomIn: () =>
                      window.dispatchEvent(new CustomEvent('diregram:dataobjectsTool', { detail: { tool: 'zoomIn' } })),
                    onZoomOut: () =>
                      window.dispatchEvent(new CustomEvent('diregram:dataobjectsTool', { detail: { tool: 'zoomOut' } })),
                  }
                : null
            }
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        ) : null}
      </div>
    </main>
  );
}

