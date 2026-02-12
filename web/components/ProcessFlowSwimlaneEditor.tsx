import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowLeftRight, Clock, Repeat } from 'lucide-react';
import { DIAMOND_SIZE } from '@/lib/process-flow-diamond';
import { getIncomingConnectionPoint, getOutgoingConnectionPoint } from '@/lib/connector-points';
import type { FlowNode, FlowNodeType } from '@/components/DimensionFlowEditor';
import { getBranchInsertIndexForFork } from '@/lib/flow-branch-ordering';

export type LaneDef = { id: string; label: string };

type Props = {
  initialNodes: FlowNode[];
  initialEdges: Record<string, { label: string; color: string }>;
  initialLanes: LaneDef[];
  onChange?: (payload: {
    nodes: FlowNode[];
    edges: Record<string, { label: string; color: string }>;
    lanes: LaneDef[];
  }) => void;
  autoPromptConnectorLabelOnFork?: boolean;
};

let localCounter = 1;
const nextId = () => `flow-${localCounter++}`;
let laneCounter = 1;
const nextLaneId = () => `branch-${laneCounter++}`;

const NODE_WIDTH = 150;
const NODE_HEIGHT = 40;
const GAP_X = 50;
const GAP_Y = 32;
const ROW_HEIGHT = DIAMOND_SIZE; // keep enough room for validation diamonds without overlap

const edgeKey = (fromId: string, toId: string) => `${fromId}__${toId}`;

export function ProcessFlowSwimlaneEditor({
  initialNodes,
  initialEdges,
  initialLanes,
  onChange,
  autoPromptConnectorLabelOnFork = false,
}: Props) {
  const [lanes, setLanes] = useState<LaneDef[]>(() => {
    const base = initialLanes?.length ? initialLanes : [{ id: 'branch-1', label: 'Lane 1' }];
    const numericMax =
      base
        .map((l) => {
          const m = l.id.match(/branch-(\d+)$/);
          return m ? Number(m[1]) : 0;
        })
        .reduce((max, n) => Math.max(max, Number.isFinite(n) ? n : 0), 0) || 0;
    laneCounter = Math.max(1, numericMax + 1);
    return base;
  });

  const [nodes, setNodes] = useState<FlowNode[]>(() => {
    const seen = new Set<string>();
    let maxNum = 0;
    (initialNodes || []).forEach((n) => {
      const m = typeof n.id === 'string' ? n.id.match(/^flow-(\d+)$/) : null;
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    });
    if (maxNum > 0) localCounter = maxNum + 1;
    const normalized = (initialNodes || []).map((n) => {
      let id = n.id;
      if (!id || seen.has(id)) id = nextId();
      seen.add(id);
      return { ...n, id };
    });
    return normalized.length
      ? normalized
      : [{ id: nextId(), label: 'Step 1', type: 'step', branchId: lanes[0]?.id || 'branch-1' }];
  });

  const [edges, setEdges] = useState<Record<string, { label: string; color: string }>>(
    () => initialEdges || {},
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingConnector, setEditingConnector] = useState<{ fromId: string; toId: string } | null>(
    null,
  );
  const [editingConnectorValue, setEditingConnectorValue] = useState('');

  const onChangeRef = useRef<Props['onChange']>(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current?.({ nodes, edges, lanes });
  }, [nodes, edges, lanes]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const laneIds = useMemo(() => lanes.map((l) => l.id), [lanes]);
  const laneIdForNode = (n: FlowNode) => n.branchId || laneIds[0] || 'branch-1';

  const nodesByLane = useMemo(() => {
    const map = new Map<string, FlowNode[]>();
    laneIds.forEach((id) => map.set(id, []));
    nodes.forEach((n) => {
      const bid = laneIdForNode(n);
      if (!map.has(bid)) map.set(bid, []);
      map.get(bid)!.push(n);
    });
    return map;
  }, [nodes, laneIds]);

  type LayoutRect = { x: number; y: number; w: number; h: number; laneId: string; col: number };
  const layout = useMemo(() => {
    const map = new Map<string, LayoutRect>();
    lanes.forEach((lane, laneIdx) => {
      const branchNodes = nodesByLane.get(lane.id) || [];
      branchNodes.forEach((n, col) => {
        const isDiamond = n.type === 'validation' || n.type === 'branch';
        const baseX = col * (NODE_WIDTH + GAP_X);
        const baseY = laneIdx * (ROW_HEIGHT + GAP_Y);
        const w = isDiamond ? DIAMOND_SIZE : NODE_WIDTH;
        const h = isDiamond ? DIAMOND_SIZE : NODE_HEIGHT;
        const x = isDiamond ? baseX + (NODE_WIDTH - DIAMOND_SIZE) / 2 : baseX;
        const y = isDiamond ? baseY : baseY + (ROW_HEIGHT - NODE_HEIGHT) / 2;
        map.set(n.id, { x, y, w, h, laneId: lane.id, col });
      });
    });
    return map;
  }, [lanes, nodesByLane]);

  // --- Auto labels for validation exits (match NexusCanvas) ---
  const pendingAutoLabelsRef = useRef<Record<string, { label: string; color: string }> | null>(null);
  useEffect(() => {
    if (!pendingAutoLabelsRef.current) return;
    const next = pendingAutoLabelsRef.current;
    pendingAutoLabelsRef.current = null;
    setEdges((prev) => ({ ...prev, ...next }));
  });

  const beginEditConnectorLabel = (fromId: string, toId: string) => {
    const k = edgeKey(fromId, toId);
    setEditingConnector({ fromId, toId });
    setEditingConnectorValue(edges[k]?.label ?? '');
  };

  const commitConnectorEdit = () => {
    if (!editingConnector) return;
    const { fromId, toId } = editingConnector;
    const k = edgeKey(fromId, toId);
    const val = editingConnectorValue.trim();
    setEdges((prev) =>
      val
        ? { ...prev, [k]: { label: val, color: prev[k]?.color || '#0f172a' } }
        : Object.fromEntries(Object.entries(prev).filter(([kk]) => kk !== k)),
    );
    setEditingConnector(null);
    setEditingConnectorValue('');
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const addLane = () => {
    const id = nextLaneId();
    const nextLane: LaneDef = { id, label: `Lane ${lanes.length + 1}` };
    setLanes((prev) => [...prev, nextLane]);
    // start lane with a single step
    setNodes((prev) => [...prev, { id: nextId(), label: 'Step 1', type: 'step', branchId: id }]);
  };

  const addStepAfter = (laneId: string, afterNodeId?: string): string => {
    const laneNodes = (nodesByLane.get(laneId) || []).filter((n) => laneIdForNode(n) === laneId);
    const insertAfterId = afterNodeId || laneNodes[laneNodes.length - 1]?.id;
    const globalIdx = insertAfterId ? nodes.findIndex((n) => n.id === insertAfterId) : nodes.length - 1;
    const insertAt = globalIdx >= 0 ? globalIdx + 1 : nodes.length;
    const label = `Step ${laneNodes.length + 1}`;
    const newNodeId = nextId();
    setNodes((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, { id: newNodeId, label, type: 'step', branchId: laneId });
      return next;
    });
    return newNodeId;
  };

  const forkFromNode = (sourceNodeId: string): string | null => {
    const sourceNode = nodeById.get(sourceNodeId);
    if (!sourceNode) return null;
    const sourceLaneId = laneIdForNode(sourceNode);
    const sourceLaneIndex = lanes.findIndex((l) => l.id === sourceLaneId);
    if (sourceLaneIndex === -1) return null;
    const sourceLaneNodes = nodesByLane.get(sourceLaneId) || [];
    const idxInLane = sourceLaneNodes.findIndex((n) => n.id === sourceNodeId);
    if (idxInLane === -1) return null;

    // Create a new lane and ensure it appears after the continuation subtree (shared rule).
    const forkColumn = idxInLane + 1;
    const newLaneId = nextLaneId();
    const newLane: LaneDef = { id: newLaneId, label: `Lane ${lanes.length + 1}` };
    const newNodeId = nextId();
    const forkNode: FlowNode = {
      id: newNodeId,
      label: `Step ${forkColumn + 1}${String.fromCharCode(97 + lanes.length)}`,
      type: 'step',
      branchId: newLaneId,
      forkSourceId: sourceNodeId,
    };

    // Build a minimal forkMeta for ordering only (based on forkSourceId + column).
    const forkMeta: Record<string, { sourceNodeId: string; offsetColumns: number }> = {};
    lanes.forEach((l) => {
      const laneNodes = nodesByLane.get(l.id) || [];
      const first = laneNodes[0];
      if (first?.forkSourceId) {
        // offsetColumns approximated as its starting column (0-based + 1)
        forkMeta[l.id] = { sourceNodeId: first.forkSourceId, offsetColumns: 1 };
      }
    });
    forkMeta[newLaneId] = { sourceNodeId: sourceNodeId, offsetColumns: forkColumn };

    const insertIndex = getBranchInsertIndexForFork({
      branches: lanes,
      nodes,
      forkMeta,
      sourceBranchId: sourceLaneId,
      forkColumn,
    });

    setLanes((prev) => {
      const next = [...prev];
      next.splice(insertIndex, 0, newLane);
      return next;
    });
    setNodes((prev) => [...prev, forkNode]);

    if (autoPromptConnectorLabelOnFork) {
      // prompt after paint
      setTimeout(() => beginEditConnectorLabel(sourceNodeId, newNodeId), 0);
    }
    return newNodeId;
  };

  // --- Render ---
  const svgHeight = Math.max(500, lanes.length * (ROW_HEIGHT + GAP_Y) + 200);
  const svgWidth = 4000;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-gray-600">
          Process-node flow format · Validation exits: <span className="font-semibold">Yes</span> (top) /{' '}
          <span className="font-semibold">No</span> (bottom). Double-click a connector to add details.
        </div>
        <button
          type="button"
          onClick={addLane}
          className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800"
        >
          <Plus size={12} /> Add Lane
        </button>
      </div>

      <div className="relative border border-slate-300 rounded-lg bg-slate-50/80 overflow-hidden min-h-[260px]">
        {/* Lane legend */}
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
          {lanes.map((lane, idx) => (
            <div
              key={lane.id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm bg-white/90 border-slate-200"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] text-white">
                {String.fromCharCode(65 + idx)}
              </span>
              <input
                type="text"
                value={lane.label}
                onChange={(e) =>
                  setLanes((prev) => prev.map((l) => (l.id === lane.id ? { ...l, label: e.target.value } : l)))
                }
                className="w-24 truncate border-none bg-transparent text-[10px] font-medium text-slate-700 focus:outline-none focus:ring-0"
                placeholder="Lane label"
              />
              <button
                type="button"
                onClick={() => {
                  const laneNodes = nodesByLane.get(lane.id) || [];
                  const last = laneNodes[laneNodes.length - 1];
                  const newId = addStepAfter(lane.id, last?.id);
                  setSelectedNodeId(newId);
                }}
                className="ml-1 p-0.5 text-[9px] opacity-70 hover:opacity-100"
                title="Add step"
              >
                <Plus size={10} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (lanes.length <= 1) return;
                  setLanes((prev) => prev.filter((l) => l.id !== lane.id));
                  setNodes((prev) => prev.filter((n) => laneIdForNode(n) !== lane.id));
                }}
                className="p-0.5 text-[9px] opacity-70 hover:opacity-100"
                title="Remove lane"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div
          className="relative h-[360px] w-full overflow-auto"
          tabIndex={0}
          onKeyDown={(e) => {
            if (editingConnector) return;
            const selected = selectedNodeId ? nodeById.get(selectedNodeId) : null;
            const laneId = selected ? laneIdForNode(selected) : lanes[0]?.id;
            if (!laneId) return;

            if (e.key === 'Tab') {
              e.preventDefault();
              const newId = addStepAfter(laneId, selected?.id);
              setSelectedNodeId(newId);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (selected) {
                const newId = forkFromNode(selected.id);
                if (newId) setSelectedNodeId(newId);
              }
            }
          }}
        >
          <div className="relative p-8">
            <svg className="pointer-events-none" width={svgWidth} height={svgHeight}>
              <defs>
                <marker
                  id="flow-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 8 5 L 0 10"
                    fill="none"
                    stroke="#000000"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              </defs>

              {/* Sequential connectors per lane */}
              {lanes.flatMap((lane) => {
                const laneNodes = nodesByLane.get(lane.id) || [];
                return laneNodes.map((n, idx) => {
                  if (idx === 0) return null;
                  const prev = laneNodes[idx - 1];
                  const from = layout.get(prev.id);
                  const to = layout.get(n.id);
                  if (!from || !to) return null;

                  const fromType = prev.type;
                  const toType = n.type;
                  const childIndex = fromType === 'validation' ? 0 : 0;

                  const start = getOutgoingConnectionPoint(fromType, from.x, from.y, from.w, from.h, childIndex);
                  const end = getIncomingConnectionPoint(toType, to.x, to.y, to.w, to.h);

                  const k = edgeKey(prev.id, n.id);
                  let label = edges[k];
                  if (fromType === 'validation' && (!label || !label.label)) {
                    pendingAutoLabelsRef.current = { ...(pendingAutoLabelsRef.current || {}), [k]: { label: 'Yes', color: '#000000' } };
                    label = { label: 'Yes', color: '#000000' };
                  }

                  let pathD: string;
                  if (fromType === 'validation') {
                    const verticalDistance = Math.abs(end.y - start.y);
                    const horizontalDistance = Math.abs(end.x - start.x);
                    const curveDistance = Math.max(Math.min(verticalDistance, horizontalDistance) * 0.5, 40);
                    const c1x = start.x;
                    const c1y = start.y - curveDistance; // Yes exits from TOP
                    const c2x = end.x < start.x ? end.x + curveDistance : end.x - curveDistance;
                    const c2y = end.y;
                    pathD = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
                  } else {
                    const c1x = start.x + (end.x - start.x) / 2;
                    pathD = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c1x} ${end.y}, ${end.x} ${end.y}`;
                  }

                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2;

                  return (
                    <g
                      key={`seq-${prev.id}-${n.id}`}
                      className="cursor-pointer"
                      onDoubleClick={(ev) => {
                        ev.stopPropagation();
                        beginEditConnectorLabel(prev.id, n.id);
                      }}
                    >
                      <path d={pathD} stroke="#000000" strokeWidth={2} fill="none" markerEnd="url(#flow-arrow)" style={{ pointerEvents: 'stroke' }} />
                      {label?.label?.trim() ? (
                        <g>
                          <rect x={midX - 40} y={midY - 10} rx={0} ry={0} width={80} height={20} fill="#000000" />
                          <text x={midX} y={midY + 3} textAnchor="middle" fill="#ffffff" fontSize={10}>
                            {label.label}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                });
              })}

              {/* Fork connectors (No path) */}
              {nodes
                .filter((n) => !!n.forkSourceId)
                .map((n) => {
                  const fromNode = n.forkSourceId ? nodeById.get(n.forkSourceId) : null;
                  if (!fromNode) return null;
                  const from = layout.get(fromNode.id);
                  const to = layout.get(n.id);
                  if (!from || !to) return null;

                  const fromType = fromNode.type;
                  const childIndex = fromType === 'validation' ? 1 : 0;

                  const start = getOutgoingConnectionPoint(fromType, from.x, from.y, from.w, from.h, childIndex);
                  const end = getIncomingConnectionPoint(n.type, to.x, to.y, to.w, to.h);

                  const k = edgeKey(fromNode.id, n.id);
                  let label = edges[k];
                  if (fromType === 'validation' && (!label || !label.label)) {
                    pendingAutoLabelsRef.current = { ...(pendingAutoLabelsRef.current || {}), [k]: { label: 'No', color: '#000000' } };
                    label = { label: 'No', color: '#000000' };
                  }

                  let pathD: string;
                  if (fromType === 'validation') {
                    const verticalDistance = Math.abs(end.y - start.y);
                    const horizontalDistance = Math.abs(end.x - start.x);
                    const curveDistance = Math.max(Math.min(verticalDistance, horizontalDistance) * 0.5, 40);
                    const c1x = start.x;
                    const c1y = start.y + curveDistance; // No exits from BOTTOM
                    const c2x = end.x < start.x ? end.x + curveDistance : end.x - curveDistance;
                    const c2y = end.y;
                    pathD = `M ${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
                  } else {
                    const c1x = start.x + (end.x - start.x) / 2;
                    pathD = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c1x} ${end.y}, ${end.x} ${end.y}`;
                  }

                  const midX = (start.x + end.x) / 2;
                  const midY = (start.y + end.y) / 2;

                  return (
                    <g
                      key={`fork-${fromNode.id}-${n.id}`}
                      className="cursor-pointer"
                      onDoubleClick={(ev) => {
                        ev.stopPropagation();
                        beginEditConnectorLabel(fromNode.id, n.id);
                      }}
                    >
                      <path d={pathD} stroke="#000000" strokeWidth={2} fill="none" markerEnd="url(#flow-arrow)" style={{ pointerEvents: 'stroke' }} />
                      {label?.label?.trim() ? (
                        <g>
                          <rect x={midX - 40} y={midY - 10} rx={0} ry={0} width={80} height={20} fill="#000000" />
                          <text x={midX} y={midY + 3} textAnchor="middle" fill="#ffffff" fontSize={10}>
                            {label.label}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}
            </svg>

            {/* Nodes */}
            {nodes.map((n) => {
              const r = layout.get(n.id);
              if (!r) return null;
              const isDiamond = n.type === 'validation' || n.type === 'branch';
              const isSelected = selectedNodeId === n.id;
              return (
                <div
                  key={n.id}
                  className={`absolute border transition-all ${
                    isDiamond
                      ? 'flex items-center justify-center'
                      : 'px-3 py-2 rounded-md flex flex-col items-center justify-center'
                  } ${isSelected ? 'border-blue-500 ring-1 ring-blue-300' : 'border-slate-200'} bg-white hover:bg-slate-50 hover:shadow-md cursor-pointer`}
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    ...(isDiamond
                      ? { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }
                      : {}),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(n.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // cycle types quick (process-node style)
                    const order: FlowNodeType[] = ['step', 'time', 'loop', 'action', 'validation', 'goto', 'end'];
                    const idx = Math.max(0, order.indexOf(n.type));
                    const next = order[(idx + 1) % order.length];
                    updateNode(n.id, { type: next });
                  }}
                  title="Double-click to cycle type"
                >
                  {n.type === 'time' ? <Clock size={20} className="text-slate-500" /> : null}
                  {n.type === 'loop' ? <Repeat size={20} className="text-slate-500" /> : null}
                  <div className={`${isDiamond ? 'text-center' : ''} text-sm font-medium text-slate-900`}>
                    {n.label || 'Step'}
                  </div>
                  <div className="absolute right-2 top-2 text-slate-400">
                    <ArrowLeftRight size={14} />
                  </div>
                </div>
              );
            })}

            {/* Inline editor for connector labels */}
            {editingConnector && (() => {
              const { fromId, toId } = editingConnector;
              const from = layout.get(fromId);
              const to = layout.get(toId);
              if (!from || !to) return null;
              const startX = from.x + from.w;
              const startY = from.y + from.h / 2;
              const endX = to.x;
              const endY = to.y + to.h / 2;
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;
              return (
                <div
                  key="connector-label-editor"
                  style={{ position: 'absolute', left: midX - 80, top: midY - 18, width: 160 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    type="text"
                    value={editingConnectorValue}
                    onChange={(e) => setEditingConnectorValue(e.target.value)}
                    onBlur={commitConnectorEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitConnectorEdit();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingConnector(null);
                        setEditingConnectorValue('');
                      }
                    }}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Connector detail…"
                  />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

