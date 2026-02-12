'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadDataObjects } from '@/lib/data-object-storage';
import { loadExpandedGridNodesFromDoc, type ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';
import { loadExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import type { TreeTestModel } from '@/lib/testing/tree-test-model';
import { singleLine } from '@/lib/testing/text';
import { ExpandedGridLayout } from '@/components/testing/ExpandedGridLayout';
import { TreeTestPopupModal } from '@/components/testing/TreeTestPopupModal';

export function TreeTestRunner({
  doc,
  model,
}: {
  doc: Y.Doc;
  model: Extract<TreeTestModel, { kind: 'ready' }>;
}) {
  const state = model.core;
  const [path, setPath] = useState<string[]>(state.initialPath);
  const [popupStack, setPopupStack] = useState<{ nodeId: string; path: string[] }[]>([]);
  const [openedListNodes, setOpenedListNodes] = useState<Set<string>>(() => new Set());
  const [listSelectionByNodeId, setListSelectionByNodeId] = useState<Map<string, string>>(() => new Map());
  const [innerProgressByTargetNodeId, setInnerProgressByTargetNodeId] = useState<Map<string, number>>(() => new Map());

  const currentNodeId = path[path.length - 1] || state.startNodeId;
  const currentNode = state.nodeById.get(currentNodeId) || null;

  const jumpTo = (idx: number) => {
    const safeIdx = Math.max(0, Math.min(idx, Math.max(0, path.length - 1)));
    const targetId = path[safeIdx];
    const targetUi = state.uiTypeByNodeId.get(targetId) || null;
    // Special case: if the user navigates "back" to a popup step, jump to its parent and re-open the popup.
    if (targetUi === 'popup' && safeIdx > 0) {
      setPath(path.slice(0, safeIdx)); // parent becomes current
      setPopupStack([{ nodeId: targetId, path: [targetId] }]);
      return;
    }
    setPath(path.slice(0, Math.max(1, safeIdx + 1)));
  };

  const openPopup = (nodeId: string) => {
    setPopupStack((s) => [...s, { nodeId, path: [nodeId] }]);
  };
  const closePopup = () => setPopupStack((s) => s.slice(0, -1));

  const pushMain = (nodeId: string) => setPath((p) => [...p, nodeId]);

  const dataObjectById = useMemo(() => {
    const store = loadDataObjects(doc);
    const map = new Map<string, { id: string; name: string; data: unknown }>();
    store.objects.forEach((o) => map.set(o.id, o));
    return map;
  }, [doc]);

  const clickChild = (nodeId: string) => {
    const child = state.nodeById.get(nodeId);
    if (!child) return;
    const ui = state.uiTypeByNodeId.get(nodeId) || null;
    if (ui === 'popup') {
      openPopup(nodeId);
      return;
    }
    pushMain(nodeId);
  };

  const visibleChildren = useMemo(() => {
    if (!currentNode) return [] as NexusNode[];

    // Inner-reference behavior: at the top "step", show the inner target node first as the only card.
    if (state.innerStartNodeId && currentNodeId === state.startNodeId) {
      const inner = state.nodeById.get(state.innerStartNodeId) || null;
      if (inner && state.isDescendantOf(inner.id, state.startNodeId)) return [inner];
    }
    return currentNode.children || [];
  }, [currentNode, currentNodeId, state]);

  if (!currentNode) {
    return <div className="p-4 text-sm text-slate-600">Start node not found.</div>;
  }

  const currentUi = state.uiTypeByNodeId.get(currentNodeId) || null;
  const listGateOpened = openedListNodes.has(currentNodeId);

  // When navigating back to a list node, always show the list again (even if previously opened).
  useEffect(() => {
    if (currentUi !== 'list') return;
    setOpenedListNodes((prev) => {
      if (!prev.has(currentNodeId)) return prev;
      const next = new Set(prev);
      next.delete(currentNodeId);
      return next;
    });
  }, [currentNodeId, currentUi]);

  const currentRunningNumber = model.runningNumberByNodeId.get(currentNodeId);
  const currentGridNodes: ExpandedGridNodeRuntime[] = useMemo(() => {
    if (typeof currentRunningNumber !== 'number') return [];
    return loadExpandedGridNodesFromDoc(doc, currentRunningNumber, currentNodeId).nodes || [];
  }, [doc, currentRunningNumber, currentNodeId]);

  const currentGridNodesRenderable = useMemo(() => {
    return currentGridNodes.filter((n) => (n.uiType || 'content') !== 'navOut');
  }, [currentGridNodes]);

  const attachedInnerDoIds = useMemo(() => {
    const set = new Set<string>();
    currentGridNodesRenderable.forEach((n) => {
      const doid = (n.dataObjectId || n.sourceChildDataObjectId || '').trim();
      if (doid) set.add(doid);
    });
    return set;
  }, [currentGridNodesRenderable]);

  const currentGridDims = useMemo(() => {
    if (typeof currentRunningNumber !== 'number') return { cols: 4, rows: 4 };
    const meta = loadExpandedNodeMetadata(doc, currentRunningNumber);
    const cols = meta.gridWidth ?? meta.gridSize ?? 4;
    const rows = meta.gridHeight ?? meta.gridSize ?? 4;
    return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
  }, [doc, currentRunningNumber]);

  const innerSeq = model.innerSequenceByTargetNodeId.get(currentNodeId) || [];
  const innerProgress = innerProgressByTargetNodeId.get(currentNodeId) || 0;
  const nextInnerStep = innerSeq[innerProgress] || null;

  const nextInnerGridNode: ExpandedGridNodeRuntime | null = useMemo(() => {
    if (!nextInnerStep) return null;
    const loaded = loadExpandedGridNodesFromDoc(doc, nextInnerStep.expandedRunningNumber, nextInnerStep.targetNodeId).nodes || [];
    return loaded.find((n) => (n.key || n.id) === nextInnerStep.gridNodeKey) || null;
  }, [doc, nextInnerStep]);

  const nextInnerGridLayout = useMemo(() => {
    if (!nextInnerStep) return null as null | { cols: number; rows: number; nodes: ExpandedGridNodeRuntime[] };
    const meta = loadExpandedNodeMetadata(doc, nextInnerStep.expandedRunningNumber);
    const cols = meta.gridWidth ?? meta.gridSize ?? 4;
    const rows = meta.gridHeight ?? meta.gridSize ?? 4;
    const nodes = loadExpandedGridNodesFromDoc(doc, nextInnerStep.expandedRunningNumber, nextInnerStep.targetNodeId).nodes || [];
    return { cols: Math.max(1, cols), rows: Math.max(1, rows), nodes };
  }, [doc, nextInnerStep]);

  const clickInnerGridNode = (gridNode: ExpandedGridNodeRuntime) => {
    const doid = (gridNode.dataObjectId || gridNode.sourceChildDataObjectId || '').trim();
    if (doid) {
      const child = (currentNode.children || []).find((c) => (c.dataObjectId || '').trim() === doid) || null;
      if (child) {
        pushMain(child.id);
        return;
      }
    }
  };

  const advanceInnerProgress = () => {
    setInnerProgressByTargetNodeId((prev) => {
      const next = new Map(prev);
      next.set(currentNodeId, Math.min(innerSeq.length, innerProgress + 1));
      return next;
    });
  };

  const listGateDoIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentNode.dataObjectId) ids.add(currentNode.dataObjectId);
    (currentNode.children || []).forEach((c) => {
      if (c.dataObjectId) ids.add(c.dataObjectId);
    });
    return Array.from(ids.values());
  }, [currentNode]);

  const listGateMockItems = useMemo(() => {
    // Mock-only: duplicate items per data object to simulate a real list of instances.
    const out: Array<{ doid: string; instanceId: string; label: string }> = [];
    const DUPES_PER_DO = 6;
    listGateDoIds.forEach((doid) => {
      const obj = dataObjectById.get(doid);
      const base = obj?.name || doid;
      for (let i = 1; i <= DUPES_PER_DO; i += 1) {
        out.push({
          doid,
          instanceId: `${doid}::${i}`,
          label: `${base} ${i}`,
        });
      }
    });
    return out;
  }, [listGateDoIds, dataObjectById]);

  const selectedListToken = listSelectionByNodeId.get(currentNodeId) || '';
  const selectedListDoId = selectedListToken ? selectedListToken.split('::')[0] : '';
  const selectedListInstance = selectedListToken ? selectedListToken.split('::')[1] : '';

  const visibleChildrenFiltered = useMemo(() => {
    // If this node has an expanded grid and a child is already represented by an inner grid node (same dataObjectId),
    // don't show it again in the children list below.
    if (currentGridNodesRenderable.length === 0) return visibleChildren;
    return visibleChildren.filter((c) => {
      const doid = (c.dataObjectId || '').trim();
      if (!doid) return true;
      return !attachedInnerDoIds.has(doid);
    });
  }, [visibleChildren, currentGridNodesRenderable.length, attachedInnerDoIds]);

  const endsHere = currentGridNodesRenderable.length === 0 && visibleChildrenFiltered.length === 0;

  return (
    <div className="relative min-h-full">
      <div className="p-4">
        <div className="flex items-center flex-wrap gap-2">
          {path.map((id, idx) => {
            const label = state.nodeById.get(id)?.content || id;
            return (
              <button
                key={`${id}-${idx}`}
                type="button"
                onClick={() => jumpTo(idx)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  idx === path.length - 1
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Jump to step"
              >
                {idx + 1}. {singleLine(label)}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="text-lg font-semibold text-slate-900 mb-2">{singleLine(currentNode.content)}</div>

          {currentUi === 'list' && !listGateOpened ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              {listGateDoIds.length === 0 ? (
                <div className="text-xs text-slate-500">No linked data objects found on this node or its children.</div>
              ) : (
                <div className="rounded-md border border-slate-200 divide-y overflow-hidden">
                  {listGateMockItems.map((it) => {
                    const isSelected = selectedListToken === it.instanceId;
                    return (
                      <button
                        key={it.instanceId}
                        type="button"
                        onClick={() => {
                          setListSelectionByNodeId((prev) => {
                            const next = new Map(prev);
                            next.set(currentNodeId, it.instanceId);
                            return next;
                          });
                          setOpenedListNodes((prev) => new Set(prev).add(currentNodeId));
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${isSelected ? 'bg-blue-50' : ''}`}
                        title="Select"
                      >
                        <div className="font-medium text-slate-900">{singleLine(it.label)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
              {listGateDoIds.length === 0 ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenedListNodes((prev) => new Set(prev).add(currentNodeId))}
                    className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Continue
                  </button>
                </div>
              ) : null}
            </div>
          ) : nextInnerStep && nextInnerGridNode ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold text-slate-800 mb-1">Flow inner step</div>
              <div className="text-[11px] text-slate-600 mb-3">
                Step {innerProgress + 1} of {innerSeq.length} (from flow). Click the inner node first.
              </div>
              {nextInnerGridLayout ? (
                <ExpandedGridLayout
                  cols={nextInnerGridLayout.cols}
                  rows={nextInnerGridLayout.rows}
                  nodes={nextInnerGridLayout.nodes}
                  highlightKey={String(nextInnerStep.gridNodeKey)}
                  onClickNode={(gn) => {
                    const key = String(gn.key || gn.id);
                    if (key !== String(nextInnerStep.gridNodeKey)) return;
                    clickInnerGridNode(gn);
                    advanceInnerProgress();
                  }}
                />
              ) : null}
            </div>
          ) : (
            <>
              {selectedListToken ? (
                <div className="mb-2 text-[11px] text-slate-500">
                  Selected: {singleLine((dataObjectById.get(selectedListDoId)?.name || selectedListDoId) + (selectedListInstance ? ` ${selectedListInstance}` : ''))}
                </div>
              ) : null}

              {currentGridNodesRenderable.length > 0 ? (
                <div className="mb-4">
                  <ExpandedGridLayout
                    cols={currentGridDims.cols}
                    rows={currentGridDims.rows}
                    nodes={currentGridNodesRenderable}
                    onClickNode={clickInnerGridNode}
                  />
                </div>
              ) : null}

              {endsHere ? (
                <div className="text-xs text-slate-500">flows end here.</div>
              ) : currentUi === 'list' ? (
                <div className="rounded-md border border-slate-200 bg-white divide-y">
                  {visibleChildrenFiltered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => clickChild(c.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      title="Select item"
                    >
                      <div className="font-medium text-slate-900">{singleLine(c.content)}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleChildrenFiltered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => clickChild(c.id)}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                      title="Open"
                    >
                      <div className="text-xs font-semibold text-slate-900">{singleLine(c.content)}</div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {popupStack.length > 0 ? (
        <TreeTestPopupModal
          state={state}
          nodeId={popupStack[popupStack.length - 1].nodeId}
          onClose={closePopup}
          onSelect={(nodeId) => {
            // Selecting inside a popup advances the main path (but opening/dismissing does not).
            const popupId = popupStack[popupStack.length - 1]?.nodeId;
            closePopup();
            if (popupId) {
              setPath((prev) => [...prev, popupId, nodeId]);
            } else {
              pushMain(nodeId);
            }
          }}
        />
      ) : null}
    </div>
  );
}

