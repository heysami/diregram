import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Trash2, Clock, ArrowLeftRight, GitBranch, Repeat } from 'lucide-react';
import { useBranchHighlighting } from '@/hooks/use-branch-highlighting';
import { DIAMOND_SIZE } from '@/lib/process-flow-diamond';
import { getBranchInsertIndexForFork } from '@/lib/flow-branch-ordering';
import { buildCollapsedGotoPaths } from '@/lib/collapsed-goto-paths';

export type FlowNodeType = 'step' | 'time' | 'loop' | 'action' | 'validation' | 'branch' | 'end' | 'goto';

export interface FlowNode {
  id: string;
  label: string;
  type: FlowNodeType;
  branchId?: string;
  gotoTargetId?: string;
  loopTargetId?: string;
  forkSourceId?: string;
}

interface Props {
  initialNodes?: FlowNode[];
  initialEdges?: Record<string, { label: string; color: string }>;
  initialBranches?: { id: string; label: string }[];
  onChange?: (payload: {
    nodes: FlowNode[];
    edges: Record<string, { label: string; color: string }>;
    branches?: { id: string; label: string }[];
  }) => void;
  // Optional: connect node content to a specific dimension key & its values
  dimensionKey?: string;
  dimensionValues?: string[];
  // Optional: copy tweaks (used for non-dimension flows like Swimlanes)
  rowLabelSingular?: string; // default: "Branch"
  rowLabelPlural?: string; // default: "branches"
  autoPromptConnectorLabelOnFork?: boolean; // default: false (swimlanes want this on)
}

let localCounter = 1;
const nextId = () => `flow-${localCounter++}`;
let branchCounter = 1;
const nextBranchId = () => `branch-${branchCounter++}`;

export function DimensionFlowEditor({
  initialNodes,
  initialEdges,
  initialBranches,
  onChange,
  dimensionKey,
  dimensionValues,
  rowLabelSingular = 'Branch',
  rowLabelPlural = 'branches',
  autoPromptConnectorLabelOnFork = false,
}: Props) {
  const hasDimensionValues = Array.isArray(dimensionValues) && dimensionValues.length > 0;
  const connectorColorOptions = [
    { value: '#000000', label: 'Black' },
  ];
  const [nodes, setNodes] = useState<FlowNode[]>(() => {
    if (initialNodes && initialNodes.length) {
      // Normalize any incoming nodes so their ids are unique and in the same
      // `flow-N` namespace as newly created nodes. This prevents duplicate
      // React keys when re-opening editors or reusing saved descriptions.
      const seen = new Set<string>();
      let maxNum = 0;

      // First pass: find the highest numeric suffix among existing flow-* ids
      initialNodes.forEach((n) => {
        const m = typeof n.id === 'string' ? n.id.match(/^flow-(\d+)$/) : null;
        if (m) {
          const num = Number(m[1]);
          if (Number.isFinite(num)) {
            maxNum = Math.max(maxNum, num);
          }
        }
      });

      // Ensure localCounter advances beyond any existing flow-* ids
      if (maxNum > 0) {
        localCounter = maxNum + 1;
      }

      const normalized: FlowNode[] = initialNodes.map((node) => {
        let id = node.id;
        if (!id || seen.has(id)) {
          // Assign a fresh flow-* id for missing/duplicate ids
          id = nextId();
        }
        seen.add(id);
        return { ...node, id };
      });

      return normalized;
    }
    const defaultBranch = nextBranchId();
    return [
      { id: nextId(), label: 'Step 1', type: 'step', branchId: defaultBranch },
      { id: nextId(), label: 'Step 2', type: 'step', branchId: defaultBranch },
    ];
  });
  const [branches, setBranches] = useState<{ id: string; label: string }[]>(() => {
    if (initialBranches && initialBranches.length) {
      // Ensure deterministic row order on reopen (by numeric suffix when possible)
      const sorted = [...initialBranches].sort((a, b) => {
        const aNum = Number(a.id.split('-').pop());
        const bNum = Number(b.id.split('-').pop());
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
        return a.id.localeCompare(b.id);
      });
      // Bump branchCounter beyond any existing branch-* ids so nextBranchId() won't collide.
      const numericMax =
        sorted
          .map((br) => {
            const m = br.id.match(/branch-(\d+)$/);
            return m ? Number(m[1]) : 0;
          })
          .reduce((max, n) => Math.max(max, Number.isFinite(n) ? n : 0), 0) || 0;
      if (numericMax > 0) branchCounter = numericMax + 1;
      return sorted;
    }

    if (initialNodes && initialNodes.length) {
      const map = new Map<string, { id: string; label: string }>();
      initialNodes.forEach((n) => {
        const bid = n.branchId || 'branch-1';
        if (!map.has(bid)) map.set(bid, { id: bid, label: rowLabelSingular });
      });
      const existing = Array.from(map.keys());
      const numericMax =
        existing
          .map((id) => {
            const parts = id.split('-');
            const num = Number(parts[parts.length - 1]);
            return Number.isFinite(num) ? num : 1;
          })
          .reduce((max, n) => Math.max(max, n), 1) || 1;
      // Ensure future nextBranchId() calls never collide with existing ids
      branchCounter = numericMax + 1;
      // Ensure deterministic row order on reopen by sorting by numeric suffix
      const sorted = Array.from(map.values()).sort((a, b) => {
        const aNum = Number(a.id.split('-').pop());
        const bNum = Number(b.id.split('-').pop());
        if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
        return a.id.localeCompare(b.id);
      });
      return sorted;
    }
    const id = 'branch-1';
    // First implicit branch uses 1, bump counter so the next generated id is branch-2
    branchCounter = 2;
    return [{ id, label: `${rowLabelSingular} A` }];
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [forkMeta, setForkMeta] = useState<
    Record<string, { sourceNodeId: string; offsetColumns: number }>
  >({});
  const [connectorLabels, setConnectorLabels] = useState<
    Record<string, { label: string; color: string }>
  >(() => initialEdges || {});
  const [editingConnector, setEditingConnector] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);
  const [editingConnectorValue, setEditingConnectorValue] = useState('');
  const [typeMenuForId, setTypeMenuForId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [readyToEditNodeId, setReadyToEditNodeId] = useState<string | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  

  // Canvas-like viewport state (aligned with main chart feel)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 32, y: 32 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const commit = (nextNodes: FlowNode[], nextBranches = branches) => {
    setNodes(nextNodes);
    setBranches(nextBranches);
  };

  // Avoid update-depth loops: parent often passes a new inline `onChange` each render.
  // We keep the latest callback in a ref and only trigger when editor state changes.
  const onChangeRef = useRef<Props['onChange']>(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onChangeRef.current?.({ nodes, edges: connectorLabels, branches });
  }, [nodes, connectorLabels, branches]);

  const edgeKey = (fromId: string, toId: string) => `${fromId}__${toId}`;

  // ---- Shared helpers ----
  const getBranchId = (node?: FlowNode | null) => node?.branchId || branches[0]?.id;
  const getBranchNodes = (branchId: string) =>
    nodes.filter((n) => (n.branchId || branches[0]?.id) === branchId);

  const applyConnectorLabel = (
    fromId: string,
    toId: string,
    label: string,
    color: string,
  ) => {
    const key = edgeKey(fromId, toId);
    setConnectorLabels((prev) => ({
      ...prev,
      [key]: {
        label,
        color,
      },
    }));
  };

  const getInsertIndexForFork = (opts: { sourceBranchId: string; forkColumn: number }): number =>
    getBranchInsertIndexForFork({
      branches,
      nodes,
      forkMeta,
      sourceBranchId: opts.sourceBranchId,
      forkColumn: opts.forkColumn,
    });

  const createForkBranch = ({
    sourceNodeId,
    sourceBranchId,
    idxInBranch,
    actualColumn,
    label,
    color,
  }: {
    sourceNodeId: string;
    sourceBranchId: string;
    idxInBranch: number;
    actualColumn: number;
    label?: string;
    color?: string;
  }) => {
    const newBranchId = nextBranchId();
    const branchLetter = String.fromCharCode(65 + branches.length + 1);
    const newBranchLabel = `${rowLabelSingular} ${branchLetter}`;
    const newStepIndex = idxInBranch + 2;
    const nextStepLabel = `Step ${newStepIndex}${branchLetter.toLowerCase()}`;
    const forkNode: FlowNode = {
      id: nextId(),
      label: nextStepLabel,
      type: 'step',
      branchId: newBranchId,
      forkSourceId: sourceNodeId,
    };

    const forkColumn = actualColumn + 1;
    const insertIndex = getInsertIndexForFork({
      sourceBranchId,
      forkColumn,
    });

    const nextBranches = [...branches];
    nextBranches.splice(insertIndex, 0, { id: newBranchId, label: newBranchLabel });
    const nextNodes = [...nodes, forkNode];
    // Use actualColumn + 1 to place the new branch in the next column after the source node
    const nextForkMeta = {
      ...forkMeta,
      [newBranchId]: { sourceNodeId, offsetColumns: forkColumn },
    };

    if (label) {
      applyConnectorLabel(
        sourceNodeId,
        forkNode.id,
        label,
        color || '#0f172a',
      );
    }

    return { nextBranches, nextNodes, nextForkMeta, newBranchId, forkNode };
  };

  const normalizeBranchIds = (
    nextBranches: { id: string; label: string }[],
    nextNodes: FlowNode[],
    nextForkMeta: Record<string, { sourceNodeId: string; offsetColumns: number }>,
  ) => {
    if (nextBranches.length === 0) {
      return { branches: nextBranches, nodes: nextNodes, forkMeta: nextForkMeta };
    }

    const mapping = new Map<string, string>();
    nextBranches.forEach((branch, idx) => {
      mapping.set(branch.id, `branch-${idx + 1}`);
    });

    const defaultOldId = nextBranches[0].id;
    const normalizedNodes = nextNodes.map((n) => {
      const oldId = n.branchId || defaultOldId;
      const newId = mapping.get(oldId) || oldId;
      return { ...n, branchId: newId };
    });

    const normalizedBranches = nextBranches.map((b, idx) => ({
      ...b,
      id: mapping.get(b.id) || `branch-${idx + 1}`,
    }));

    const normalizedForkMeta: Record<string, { sourceNodeId: string; offsetColumns: number }> = {};
    Object.entries(nextForkMeta).forEach(([oldId, meta]) => {
      const newId = mapping.get(oldId);
      if (newId) normalizedForkMeta[newId] = meta;
    });

    branchCounter = normalizedBranches.length + 1;

    return { branches: normalizedBranches, nodes: normalizedNodes, forkMeta: normalizedForkMeta };
  };

  const addBranch = () => {
    const id = nextBranchId();
    const label = `${rowLabelSingular} ${String.fromCharCode(64 + branches.length + 1)}`; // A, B, C...
    const nextBranches = [...branches, { id, label }];
    // Start each new branch with a single step
    const nextNodes: FlowNode[] = [
      ...nodes,
      { id: nextId(), label: 'Step 1', type: 'step', branchId: id } satisfies FlowNode,
    ];
    commit(nextNodes, nextBranches);
  };

  const removeBranch = (branchId: string) => {
    if (branches.length <= 1) return;
    const nextBranches = branches.filter((b) => b.id !== branchId);
    const nextNodes = nodes.filter((n) => n.branchId !== branchId);
    const { [branchId]: _removed, ...restForkMeta } = forkMeta;
    if (!nextNodes.length && nextBranches.length) {
      // Ensure at least one node exists
      const fallbackBranchId = nextBranches[0].id;
      nextNodes.push({
        id: nextId(),
        label: 'Step 1',
        type: 'step',
        branchId: fallbackBranchId,
      } as FlowNode);
    }
    const normalized = normalizeBranchIds(nextBranches, nextNodes, restForkMeta);
    setForkMeta(normalized.forkMeta);
    commit(normalized.nodes, normalized.branches);
  };

  const addNodeAfter = (branchId: string, afterId?: string) => {
    const branchNodes = getBranchNodes(branchId);
    const idx = afterId
      ? branchNodes.findIndex((n) => n.id === afterId)
      : branchNodes.length - 1;
    const globalIdx = afterId ? nodes.findIndex((n) => n.id === afterId) : nodes.length - 1;
    const insertAt = globalIdx >= 0 ? globalIdx + 1 : nodes.length; // fallback to end
    const label = `Step ${branchNodes.length + 1}`;
    const next = [...nodes];
    const newNodeId = nextId();
    next.splice(insertAt, 0, { id: newNodeId, label, type: 'step', branchId });
    commit(next);
    return newNodeId;
  };

  const insertNodeAfter = (
    baseNodes: FlowNode[],
    branchId: string,
    afterId?: string,
  ): { nodes: FlowNode[]; newNodeId: string } => {
    const branchNodes = baseNodes.filter(
      (n) => (n.branchId || branches[0]?.id) === branchId,
    );
    const idx = afterId
      ? branchNodes.findIndex((n) => n.id === afterId)
      : branchNodes.length - 1;
    const globalIdx = afterId
      ? baseNodes.findIndex((n) => n.id === afterId)
      : baseNodes.length - 1;
    const insertAt = globalIdx >= 0 ? globalIdx + 1 : baseNodes.length;
    const label = `Step ${branchNodes.length + 1}`;
    const newNodeId = nextId();
    const nextNodes = [...baseNodes];
    nextNodes.splice(insertAt, 0, { id: newNodeId, label, type: 'step', branchId });
    return { nodes: nextNodes, newNodeId };
  };

  const removeNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    // Prevent deleting if there is a fork branching out of this node
    const hasForkChild = Object.values(forkMeta).some(
      (meta) => meta.sourceNodeId === id,
    );
    if (hasForkChild) return;
    const branchId = getBranchId(node);
    const branchNodes = getBranchNodes(branchId);
    if (branchNodes.length <= 1 && branches.length === 1) return;

    const idx = branchNodes.findIndex((n) => n.id === id);
    if (idx === -1) return;

    // Prevent deleting if there are downstream steps in this branch
    const hasDownstream = idx < branchNodes.length - 1;
    // Prevent deleting if there is any fork that starts from this node
    const hasForkOut = Object.values(forkMeta).some((meta) => meta.sourceNodeId === id);
    if (hasDownstream || hasForkOut) return;

    const nextNodes = nodes.filter((n) => n.id !== id);

    // If this deletion empties the branch (and there are other branches),
    // automatically remove the branch itself.
    if (branches.length > 1) {
      const stillHasNodesInBranch = nextNodes.some(
        (n) => (n.branchId || branchId) === branchId,
      );
      if (!stillHasNodesInBranch && branchId) {
        const nextBranches = branches.filter((b) => b.id !== branchId);
        const { [branchId]: _removedFork, ...restForkMeta } = forkMeta;
        const normalized = normalizeBranchIds(nextBranches, nextNodes, restForkMeta);
        setForkMeta(normalized.forkMeta);
        commit(normalized.nodes, normalized.branches);
        return;
      }
    }

    commit(nextNodes);
  };

  const handleReorder = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const currentIdx = nodes.findIndex((n) => n.id === draggingId);
    const targetIdx = nodes.findIndex((n) => n.id === targetId);
    if (currentIdx === -1 || targetIdx === -1) return;
    const next = [...nodes];
    const [moved] = next.splice(currentIdx, 1);
    next.splice(targetIdx, 0, moved);
    commit(next);
  };

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    commit(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const forkFromNode = (
    nodeId: string,
    defaultEdgeLabel?: string,
    defaultEdgeColor?: string,
  ): string | null => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const sourceBranchId = getBranchId(node);
    if (!sourceBranchId) return null;

    const sourceBranchNodes = getBranchNodes(sourceBranchId);
    const idxInBranch = sourceBranchNodes.findIndex((n) => n.id === nodeId);
    if (idxInBranch === -1) return null;

    // Calculate the actual column position of the source node
    // Get the source node's current position from layout to get the true column
    const sourcePos = layout.get(nodeId);
    if (!sourcePos) return null; // Can't fork if source node has no position
    
    // Calculate actual column: stepIndex (0-based) + offsetColumns from the source branch
    // The stepIndex already accounts for the node's position within its branch
    // We need to add the branch's offsetColumns to get the true column
    const sourceForkMeta = forkMeta[sourceBranchId];
    const sourceOffsetColumns = sourceForkMeta?.offsetColumns ?? 0;
    const actualColumn = sourcePos.stepIndex + sourceOffsetColumns;

    const { nextBranches, nextNodes, nextForkMeta, forkNode } = createForkBranch({
      sourceNodeId: nodeId,
      sourceBranchId,
      idxInBranch,
      actualColumn,
      label: defaultEdgeLabel,
      color: defaultEdgeColor,
    });

    const normalized = normalizeBranchIds(nextBranches, nextNodes, nextForkMeta);
    setForkMeta(normalized.forkMeta);
    commit(normalized.nodes, normalized.branches);
    
    // Return the ID of the newly created fork node
    return forkNode.id;
  };

  // Layout for canvas-like rendering – mirror main chart layout-engine defaults
  const NODE_WIDTH = 150;
  const NODE_HEIGHT = 40;
  const GAP_X = 50;
  const LABEL_GAP_X = GAP_X * 2;
  const GAP_Y = 32;

  // Helper functions to get diamond corner points for validation and branch nodes
  const getDiamondCorner = (
    nodeType: FlowNodeType,
    corner: 'left' | 'right' | 'top' | 'bottom',
    x: number,
    y: number,
    width: number,
    height: number,
  ): { x: number; y: number } => {
    if (nodeType !== 'validation' && nodeType !== 'branch') {
      // For non-diamond nodes, return standard rectangle connection points
      switch (corner) {
        case 'left':
          return { x, y: y + height / 2 };
        case 'right':
          return { x: x + width, y: y + height / 2 };
        case 'top':
          return { x: x + width / 2, y };
        case 'bottom':
          return { x: x + width / 2, y: y + height };
        default:
          return { x: x + width / 2, y: y + height / 2 };
      }
    }
    
    // Diamond corners (rotated 45 degrees)
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    switch (corner) {
      case 'left':
        return { x, y: centerY };
      case 'right':
        return { x: x + width, y: centerY };
      case 'top':
        return { x: centerX, y };
      case 'bottom':
        return { x: centerX, y: y + height };
      default:
        return { x: centerX, y: centerY };
    }
  };

  // Get connection point for outgoing connections from a node
  const getOutgoingConnectionPoint = (
    node: FlowNode,
    x: number,
    y: number,
    branchIndex: number = 0, // 0 = first branch, 1 = second branch, etc.
  ): { x: number; y: number } => {
    const isDiamond = node.type === 'validation' || node.type === 'branch';
    const width = isDiamond ? DIAMOND_SIZE : NODE_WIDTH;
    const height = isDiamond ? DIAMOND_SIZE : NODE_HEIGHT;
    
    if (node.type === 'validation') {
      // Validation: first branch from top, second from bottom
      if (branchIndex === 0) {
        return getDiamondCorner(node.type, 'top', x, y, width, height);
      } else {
        return getDiamondCorner(node.type, 'bottom', x, y, width, height);
      }
    } else if (node.type === 'branch') {
      // Branch: all branches from right
      return getDiamondCorner(node.type, 'right', x, y, width, height);
    }
    // Default: right side for other node types
    return getDiamondCorner(node.type, 'right', x, y, width, height);
  };

  // Get connection point for incoming connections to a node
  const getIncomingConnectionPoint = (
    node: FlowNode,
    x: number,
    y: number,
  ): { x: number; y: number } => {
    const isDiamond = node.type === 'validation' || node.type === 'branch';
    const width = isDiamond ? DIAMOND_SIZE : NODE_WIDTH;
    const height = isDiamond ? DIAMOND_SIZE : NODE_HEIGHT;
    
    if (node.type === 'validation' || node.type === 'branch') {
      return getDiamondCorner(node.type, 'left', x, y, width, height);
    }
    // Default: left side for other node types
    return getDiamondCorner(node.type, 'left', x, y, width, height);
  };

  const branchOrder = useMemo(() => branches.map((b) => b.id), [branches]);

  const firstNodeByBranch = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((branch) => {
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branch.id,
      );
      if (branchNodes.length) {
        map.set(branch.id, branchNodes[0].id);
      }
    });
    return map;
  }, [branches, nodes]);

  // Calculate which nodes should be highlighted when hovering over a branch pill
  // Modularized in useBranchHighlighting hook to prevent breakage from other features
  const nodesByBranch = useBranchHighlighting(branches, nodes, forkMeta);

  const layout = useMemo(() => {
    const positions = new Map<
      string,
      { x: number; y: number; branchId: string; stepIndex: number }
    >();

    const labelByEdgeKey = new Set<string>(
      Object.entries(connectorLabels)
        .filter(([, v]) => v?.label?.trim())
        .map(([k]) => k),
    );
    const hasLabelForEdge = (fromId: string, toId: string) =>
      labelByEdgeKey.has(edgeKey(fromId, toId));

    branchOrder.forEach((branchId, branchIdx) => {
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branchId,
      );
      const forkForBranch = forkMeta[branchId];
      const offsetColumns = forkForBranch?.offsetColumns ?? 0;

      const prefixExtraByIndex = new Array(branchNodes.length).fill(0);
      const forkExtraStart = branchNodes.length
        ? hasLabelForEdge(
            forkForBranch?.sourceNodeId || '',
            branchNodes[0].id,
          )
          ? LABEL_GAP_X
          : 0
        : 0;
      for (let i = 1; i < branchNodes.length; i += 1) {
        const prev = branchNodes[i - 1];
        const curr = branchNodes[i];
        prefixExtraByIndex[i] =
          prefixExtraByIndex[i - 1] +
          (hasLabelForEdge(prev.id, curr.id) ? LABEL_GAP_X : 0);
      }

      branchNodes.forEach((n, stepIdx) => {
        const isDiamond = n.type === 'validation' || n.type === 'branch';
        const baseY = branchIdx * (NODE_HEIGHT + GAP_Y);
        // Match main-canvas process-flow layout semantics:
        // - Regular nodes are positioned by their top-left bounding box (`baseY`)
        // - Diamond nodes should be vertically centered on the same row center as regular nodes.
        //   So we shift their top upward by half the size delta.
        const diamondY = isDiamond ? baseY - (DIAMOND_SIZE - NODE_HEIGHT) / 2 : baseY;

        positions.set(n.id, {
          x:
            (stepIdx + offsetColumns) * (NODE_WIDTH + GAP_X) +
            prefixExtraByIndex[stepIdx] +
            forkExtraStart,
          y: diamondY,
          branchId,
          stepIndex: stepIdx,
        });
      });
    });

    // Prevent SVG clipping: if any node ends up above y=0 (e.g. diamond in first row),
    // shift the whole layout downward so all coordinates are >= 0.
    let minY = Infinity;
    positions.forEach((p) => {
      minY = Math.min(minY, p.y);
    });
    if (Number.isFinite(minY) && minY < 0) {
      const dy = -minY;
      const shifted = new Map<string, { x: number; y: number; branchId: string; stepIndex: number }>();
      positions.forEach((p, id) => {
        shifted.set(id, { ...p, y: p.y + dy });
      });
      return shifted;
    }

    return positions;
  }, [branchOrder, nodes, branches, forkMeta, connectorLabels]);

  const getNodeRect = useCallback(
    (node: FlowNode) => {
      const pos = layout.get(node.id);
      if (!pos) return null;
      const isDiamond = node.type === 'validation' || node.type === 'branch';
      const width = isDiamond ? DIAMOND_SIZE : NODE_WIDTH;
      const height = isDiamond ? DIAMOND_SIZE : NODE_HEIGHT;
      const left = isDiamond ? pos.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : pos.x;
      const top = pos.y;
      return { left, top, width, height };
    },
    [layout],
  );

  const loopDescendantsById = useMemo(() => {
    // "Children" for loop means nodes reachable downstream via:
    // - in-branch sequential continuation
    // - fork branches (first node in each forked branch)
    //
    // (We intentionally ignore `goto` jump edges here.)
    const nodesByBranchId = new Map<string, FlowNode[]>();
    branches.forEach((b) => {
      nodesByBranchId.set(
        b.id,
        nodes.filter((n) => (n.branchId || branches[0]?.id) === b.id),
      );
    });

    const getSequentialNextId = (id: string): string | null => {
      const node = nodeById.get(id);
      if (!node) return null;
      const branchId = node.branchId || branches[0]?.id;
      if (!branchId) return null;
      const branchNodes = nodesByBranchId.get(branchId) || [];
      const idx = branchNodes.findIndex((n) => n.id === id);
      if (idx === -1) return null;
      return branchNodes[idx + 1]?.id || null;
    };

    const getForkChildIds = (id: string): string[] => {
      const out: string[] = [];
      Object.entries(forkMeta).forEach(([branchId, meta]) => {
        if (meta.sourceNodeId !== id) return;
        const branchNodes = nodesByBranchId.get(branchId) || [];
        const first = branchNodes[0];
        if (first?.id) out.push(first.id);
      });
      return out;
    };

    const getOutgoingIds = (id: string): string[] => {
      const next: string[] = [];
      const seq = getSequentialNextId(id);
      if (seq) next.push(seq);
      next.push(...getForkChildIds(id));
      return Array.from(new Set(next));
    };

    const collectDescendants = (startId: string): FlowNode[] => {
      const seen = new Set<string>();
      const queue: string[] = [...getOutgoingIds(startId)];
      while (queue.length) {
        const cur = queue.shift()!;
        if (!cur || cur === startId) continue;
        if (seen.has(cur)) continue;
        seen.add(cur);
        getOutgoingIds(cur).forEach((nxt) => {
          if (!seen.has(nxt) && nxt !== startId) queue.push(nxt);
        });
      }

      const arr = Array.from(seen)
        .map((id) => nodeById.get(id))
        .filter(Boolean) as FlowNode[];

      // Deterministic sort: layout x then y (ties by id)
      arr.sort((a, b) => {
        const pa = layout.get(a.id);
        const pb = layout.get(b.id);
        const ax = pa?.x ?? 0;
        const bx = pb?.x ?? 0;
        if (ax !== bx) return ax - bx;
        const ay = pa?.y ?? 0;
        const by = pb?.y ?? 0;
        if (ay !== by) return ay - by;
        return a.id.localeCompare(b.id);
      });

      return arr;
    };

    const map = new Map<string, FlowNode[]>();
    nodes
      .filter((n) => n.type === 'loop')
      .forEach((loop) => {
        map.set(loop.id, collectDescendants(loop.id));
      });
    return map;
  }, [branches, forkMeta, layout, nodeById, nodes]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingNodeId) {
      const input = inputRefs.current.get(editingNodeId);
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [editingNodeId]);

  // Reconstruct fork offsets after a remount using explicit forkSourceId,
  // so forked branches keep their correct origin after reopening.
  useEffect(() => {
    if (!branches.length || !nodes.length) return;

    const nextForkMeta: Record<string, { sourceNodeId: string; offsetColumns: number }> = {};

    branches.forEach((branch) => {
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branch.id,
      );
      if (!branchNodes.length) return;
      const first = branchNodes[0];
      if (!first.forkSourceId) return;

      const sourceNode = nodes.find((n) => n.id === first.forkSourceId);
      if (!sourceNode) return;
      
      // Calculate the actual column position of the source node from layout
      // This ensures we get the true column position accounting for all offsets
      const sourcePos = layout.get(sourceNode.id);
      if (!sourcePos) return;
      
      // Calculate actual column: stepIndex (0-based) + offsetColumns from the source branch
      // The stepIndex already accounts for the node's position within its branch
      // We need to add the branch's offsetColumns to get the true column
      const sourceBranchId = sourceNode.branchId || branches[0]?.id;
      const sourceForkMeta = forkMeta[sourceBranchId];
      const sourceOffsetColumns = sourceForkMeta?.offsetColumns ?? 0;
      const actualColumn = sourcePos.stepIndex + sourceOffsetColumns;

      nextForkMeta[branch.id] = {
        sourceNodeId: sourceNode.id,
        offsetColumns: actualColumn + 1,
      };
    });

    const currentKeys = Object.keys(forkMeta);
    const nextKeys = Object.keys(nextForkMeta);
    const isSame =
      currentKeys.length === nextKeys.length &&
      currentKeys.every(
        (k) =>
          nextForkMeta[k] &&
          forkMeta[k]?.sourceNodeId === nextForkMeta[k].sourceNodeId &&
          forkMeta[k]?.offsetColumns === nextForkMeta[k].offsetColumns,
      );

    if (!isSame) {
      setForkMeta(nextForkMeta);
    }
  }, [branches, nodes, layout]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const zoomSpeed = 0.001;
      const nextScale = Math.max(0.5, Math.min(2, scale - e.deltaY * zoomSpeed));
      setScale(nextScale);
    } else {
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start panning when clicking the bare canvas, not on nodes
    if (e.target !== canvasRef.current) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    e.preventDefault();
    const { x, y, originX, originY } = panStartRef.current;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    setOffset({ x: originX + dx, y: originY + dy });
  };

  const endPan = () => {
    setIsPanning(false);
    panStartRef.current = null;
  };

  const beginEditConnectorLabel = (fromId: string, toId: string) => {
    const key = edgeKey(fromId, toId);
    setEditingConnector({ fromId, toId });
    setEditingConnectorValue(connectorLabels[key]?.label ?? '');
  };

  const commitConnectorEdit = () => {
    if (!editingConnector) return;
    const { fromId, toId } = editingConnector;
    const key = edgeKey(fromId, toId);
    const val = editingConnectorValue.trim();
    setConnectorLabels((prev) =>
      val
        ? {
            ...prev,
            [key]: {
              label: val,
              color: prev[key]?.color || '#0f172a',
            },
          }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
    );
    setEditingConnector(null);
    setEditingConnectorValue('');
  };

  const setupValidationExits = (node: FlowNode): boolean => {
    const branchId = node.branchId || branches[0]?.id;
    if (!branchId) return false;
    const branchNodes = nodes.filter((n) => (n.branchId || branchId) === branchId);
    const idx = branchNodes.findIndex((n) => n.id === node.id);
    if (idx === -1) return false;

    const expectedOffset = idx + 1;
    const validForkBranchIds = branches.filter((branch) => {
      const branchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === branch.id,
      );
      if (!branchNodes.length) return false;
      const first = branchNodes[0];
      if (!first.forkSourceId || first.forkSourceId !== node.id) return false;

      const sourceBranchId = node.branchId || branches[0]?.id;
      const sourceBranchNodes = nodes.filter(
        (n) => (n.branchId || branches[0]?.id) === sourceBranchId,
      );
      const sourceIdx = sourceBranchNodes.findIndex((n) => n.id === node.id);
      return sourceIdx !== -1 && sourceIdx + 1 === expectedOffset;
    }).map((b) => b.id);
    const hasYesTarget = !!branchNodes[idx + 1];
    const totalOutgoing = (hasYesTarget ? 1 : 0) + validForkBranchIds.length;

    if (totalOutgoing > 2) {
      console.warn('Validation nodes can only have Yes/No branches.');
      return false;
    }

    let nextNodes: FlowNode[] = nodes.map((n) =>
      n.id === node.id ? ({ ...n, type: 'validation' } satisfies FlowNode) : n,
    );
    let nextBranches = [...branches];
    let nextForkMeta = { ...forkMeta };

    // Ensure Yes path exists
    let yesTargetId = branchNodes[idx + 1]?.id;
    if (!yesTargetId) {
      const inserted = insertNodeAfter(nextNodes, branchId, node.id);
      nextNodes = inserted.nodes;
      yesTargetId = inserted.newNodeId;
    }

    // Ensure No branch exists if missing
    if (validForkBranchIds.length === 0) {
      const newBranchId = nextBranchId();
      const branchLetter = String.fromCharCode(65 + branches.length + 1);
      const newBranchLabel = `Branch ${branchLetter}`;
      const newStepIndex = idx + 2;
      const nextStepLabel = `Step ${newStepIndex}${branchLetter.toLowerCase()}`;
      const forkNode: FlowNode = {
        id: nextId(),
        label: nextStepLabel,
        type: 'step',
        branchId: newBranchId,
        forkSourceId: node.id,
      };

      const insertIndex = getInsertIndexForFork({
        sourceBranchId: branchId,
        forkColumn: expectedOffset,
      });

      nextBranches = [...nextBranches];
      nextBranches.splice(insertIndex, 0, { id: newBranchId, label: newBranchLabel });
      nextNodes = [...nextNodes, forkNode];
      nextForkMeta = {
        ...nextForkMeta,
        [newBranchId]: { sourceNodeId: node.id, offsetColumns: expectedOffset },
      };
    }

    const normalized = normalizeBranchIds(nextBranches, nextNodes, nextForkMeta);
    setForkMeta(normalized.forkMeta);
    commit(normalized.nodes, normalized.branches);

    // Apply connector labels after ensuring nodes exist
    if (yesTargetId) {
      const yesKey = edgeKey(node.id, yesTargetId);
      const yesLabel = connectorLabels[yesKey]?.label || 'Yes';
      const yesColor = '#000000';
      applyConnectorLabel(node.id, yesTargetId, yesLabel, yesColor);
    }

    const forkBranchId =
      validForkBranchIds[0] ||
      normalized.branches.find((branch) => {
        const branchNodes = normalized.nodes.filter(
          (n) => (n.branchId || normalized.branches[0]?.id) === branch.id,
        );
        const first = branchNodes[0];
        return first?.forkSourceId === node.id && first;
      })?.id;
    if (forkBranchId) {
      const forkBranchNodes = normalized.nodes.filter(
        (n) => (n.branchId || normalized.branches[0]?.id) === forkBranchId,
      );
      const first = forkBranchNodes[0];
      if (first) {
        const noKey = edgeKey(node.id, first.id);
        const noLabel = connectorLabels[noKey]?.label || 'No';
        const noColor = '#000000';
        applyConnectorLabel(node.id, first.id, noLabel, noColor);
      }
    }

    return true;
  };

  return (
    <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-600">
            Describe how this flow progresses over time. Use {rowLabelPlural} to express forks like
            &nbsp;<span className="font-semibold">1,2,3a,4a</span> &amp;
            &nbsp;<span className="font-semibold">1,2,3b,4b,5b</span>. Pan the canvas by dragging the
            background, zoom with <span className="font-mono">Cmd/Ctrl + scroll</span>.
          </div>
          <button
            type="button"
            onClick={addBranch}
            className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800"
          >
            <Plus size={12} /> Add {rowLabelSingular}
          </button>
        </div>

      <div className="relative border border-slate-300 rounded-lg bg-slate-50/80 overflow-hidden min-h-[260px]">
        {/* Row legend */}
        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-2">
          {branches.map((branch, idx) => (
            <div
              key={branch.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 shadow-sm cursor-pointer transition-all ${
                hoveredBranchId === branch.id
                  ? 'bg-blue-100 border-blue-300'
                  : 'bg-white/90 border-slate-200'
              }`}
              onMouseEnter={() => setHoveredBranchId(branch.id)}
              onMouseLeave={() => setHoveredBranchId(null)}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] text-white">
                {String.fromCharCode(65 + idx)}
                  </span>
                  <input
                    type="text"
                    value={branch.label}
                    onChange={(e) =>
                      setBranches((prev) =>
                    prev.map((b) => (b.id === branch.id ? { ...b, label: e.target.value } : b)),
                      )
                    }
                className="w-24 truncate border-none bg-transparent text-[10px] font-medium text-slate-700 focus:outline-none focus:ring-0"
                placeholder={`${rowLabelSingular} label`}
                  />
                  <button
                    type="button"
                    onClick={() => addNodeAfter(branch.id)}
                className="ml-1 p-0.5 text-[9px] opacity-70 hover:opacity-100"
                title={`Add step to this ${rowLabelSingular.toLowerCase()}`}
                  >
                <Plus size={10} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBranch(branch.id)}
                className="p-0.5 text-[9px] opacity-70 hover:opacity-100"
                title={`Remove ${rowLabelSingular.toLowerCase()}`}
                  >
                <Trash2 size={10} />
                  </button>
                </div>
          ))}
              </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative h-[320px] w-full cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => {
            handleMouseMove(e);
          }}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          onClick={() => {
            // Reset ready to edit when clicking on canvas
            if (readyToEditNodeId) {
              setReadyToEditNodeId(null);
            }
            setSelectedNodeId(null);
            setTypeMenuForId(null);
          }}
          tabIndex={0}
          onKeyDown={(e) => {
            if (editingConnector) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
              // Let field-level handlers manage editing, suggestions, etc.
              return;
            }
            const selected = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
            const branchId = selected?.branchId || branches[0]?.id;
            if (!branchId) return;

            const branchNodes = nodes.filter(
              (n) => (n.branchId || branches[0]?.id) === branchId,
            );

            const isCmd = e.metaKey || e.ctrlKey;

            // Arrow navigation between nodes (not editing)
            if (!isCmd && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              if (!branchNodes.length) return;

              if (!selected) {
                setSelectedNodeId(branchNodes[0].id);
                return;
              }

              const currentIdx = branchNodes.findIndex((n) => n.id === selected.id);

              if (e.key === 'ArrowLeft' && currentIdx > 0) {
                setSelectedNodeId(branchNodes[currentIdx - 1].id);
              } else if (e.key === 'ArrowRight' && currentIdx < branchNodes.length - 1) {
                setSelectedNodeId(branchNodes[currentIdx + 1].id);
              } else if (e.key === 'ArrowUp') {
                // Move to same index in previous branch (if exists)
                const currentBranchIdx = branches.findIndex((b) => b.id === branchId);
                if (currentBranchIdx > 0) {
                  const prevBranchId = branches[currentBranchIdx - 1].id;
                  const prevBranchNodes = nodes.filter(
                    (n) => (n.branchId || branches[0]?.id) === prevBranchId,
                  );
                  if (prevBranchNodes.length) {
                    const target = prevBranchNodes[Math.min(currentIdx, prevBranchNodes.length - 1)];
                    setSelectedNodeId(target.id);
                  }
                }
              } else if (e.key === 'ArrowDown') {
                // Move to same index in next branch (if exists)
                const currentBranchIdx = branches.findIndex((b) => b.id === branchId);
                if (currentBranchIdx < branches.length - 1) {
                  const nextBranchId = branches[currentBranchIdx + 1].id;
                  const nextBranchNodes = nodes.filter(
                    (n) => (n.branchId || branches[0]?.id) === nextBranchId,
                  );
                  if (nextBranchNodes.length) {
                    const target = nextBranchNodes[Math.min(currentIdx, nextBranchNodes.length - 1)];
                    setSelectedNodeId(target.id);
                  }
                }
              }
              return;
            }

            // Cmd/Ctrl + arrows: swap / reorder within branch
            if (isCmd && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selected) {
              e.preventDefault();
              const currentIdx = branchNodes.findIndex((n) => n.id === selected.id);
              if (currentIdx === -1) return;
              const targetIdx =
                e.key === 'ArrowLeft'
                  ? currentIdx - 1
                  : currentIdx + 1;
              if (targetIdx < 0 || targetIdx >= branchNodes.length) return;

              const targetNode = branchNodes[targetIdx];
              const newOrder = [...nodes];
              const aIdx = newOrder.findIndex((n) => n.id === selected.id);
              const bIdx = newOrder.findIndex((n) => n.id === targetNode.id);
              if (aIdx === -1 || bIdx === -1) return;
              const tmp = newOrder[aIdx];
              newOrder[aIdx] = newOrder[bIdx];
              newOrder[bIdx] = tmp;
              commit(newOrder, branches);
              setSelectedNodeId(selected.id);
              return;
            }

            // Structure creation keys (Tab / Enter / Delete) – operate on selection
            if (e.key === 'Tab') {
              e.preventDefault();
              if (selected) {
                const newNodeId = addNodeAfter(branchId, selected.id);
                // Auto-select the newly created node
                setTimeout(() => {
                  setSelectedNodeId(newNodeId);
                }, 0);
              } else if (nodes.length) {
                const newNodeId = addNodeAfter(branchId, nodes[nodes.length - 1].id);
                // Auto-select the newly created node
                setTimeout(() => {
                  setSelectedNodeId(newNodeId);
                }, 0);
              }
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (selected) {
                // Check if there's a node on the next step in the same branch
                const branchNodes = getBranchNodes(branchId);
                const currentIdx = branchNodes.findIndex((n) => n.id === selected.id);
                const hasNextStep = currentIdx < branchNodes.length - 1;
                
                // Only allow creating a branch if there's a node on the next step
                if (hasNextStep) {
                  const newNodeId = forkFromNode(selected.id);
                  // Auto-select the newly created fork node
                  if (newNodeId) {
                    setTimeout(() => {
                      setSelectedNodeId(newNodeId);
                      if (autoPromptConnectorLabelOnFork) {
                        // When forking into a new row (e.g. Swimlane lane change),
                        // immediately prompt for a connector detail label.
                        beginEditConnectorLabel(selected.id, newNodeId);
                      }
                    }, 0);
                  }
                }
              }
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
              // Delete only when a node is selected and we're not editing text
              if (selected) {
                e.preventDefault();
                removeNode(selected.id);
              }
            }
          }}
        >
          <div
            className="absolute origin-top-left transition-transform duration-75 ease-out will-change-transform"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          >
            {/* Loop "section" backgrounds (optional) */}
            {nodes
              .filter((n) => n.type === 'loop' && !!n.loopTargetId)
              .map((loopNode) => {
                const targetId = loopNode.loopTargetId!;
                const descendants = loopDescendantsById.get(loopNode.id) || [];
                const isValidTarget = descendants.some((d) => d.id === targetId);
                if (!isValidTarget) return null;

                const target = nodeById.get(targetId);
                if (!target) return null;
                const fromRect = getNodeRect(loopNode);
                const toRect = getNodeRect(target);
                if (!fromRect || !toRect) return null;

                const pad = 18;
                const left = Math.min(fromRect.left, toRect.left) - pad;
                const top = Math.min(fromRect.top, toRect.top) - pad;
                const right =
                  Math.max(fromRect.left + fromRect.width, toRect.left + toRect.width) + pad;
                const bottom =
                  Math.max(fromRect.top + fromRect.height, toRect.top + toRect.height) + pad;

                return (
                  <div
                    key={`loop-section-${loopNode.id}-${targetId}`}
                    className="pointer-events-none absolute rounded-md mac-double-outline mac-fill--dots-3 opacity-60"
                    style={{
                      left,
                      top,
                      width: Math.max(0, right - left),
                      height: Math.max(0, bottom - top),
                    }}
                  />
                );
              })}

            {/* Connectors */}
            <svg
              className="pointer-events-none"
              width="4000"
              height={Math.max(400, branches.length * (NODE_HEIGHT + GAP_Y) + DIAMOND_SIZE + 200)}
            >
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
              {/* In-branch sequential connectors */}
              {branches.map((branch) => {
                const branchNodes = nodes.filter(
                  (n) => (n.branchId || branches[0]?.id) === branch.id,
                );
                return branchNodes.map((node, idx) => {
                  if (idx === 0) return null;
                  const prev = branchNodes[idx - 1];
                  const from = layout.get(prev.id);
                  const to = layout.get(node.id);
                  if (!from || !to) return null;

                  // Get connection points using diamond corners for validation/branch nodes
                  // For diamonds, adjust position to account for the layout offset
                  const prevIsDiamond = prev.type === 'validation' || prev.type === 'branch';
                  const nodeIsDiamond = node.type === 'validation' || node.type === 'branch';
                  const fromX = prevIsDiamond ? from.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : from.x;
                  const fromY = prevIsDiamond ? from.y : from.y;
                  const toX = nodeIsDiamond ? to.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : to.x;
                  const toY = nodeIsDiamond ? to.y : to.y;
                  
                  const startPoint = getOutgoingConnectionPoint(prev, fromX, fromY, 0);
                  const endPoint = getIncomingConnectionPoint(node, toX, toY);
                  const startX = startPoint.x;
                  const startY = startPoint.y;
                  const endX = endPoint.x;
                  const endY = endPoint.y;
                  const c1x = startX + (endX - startX) / 2;
                  const key = edgeKey(prev.id, node.id);
                  const label = connectorLabels[key]?.label?.trim();
                  const labelColor = '#000000';
                  const midX = (startX + endX) / 2;
                  const midY = (startY + endY) / 2;
                  const isToCollapsedGoto =
                    node.type === 'goto' &&
                    !!node.gotoTargetId &&
                    selectedNodeId !== node.id;

                  return (
                    <g
                      key={`${prev.id}-${node.id}`}
                      className="cursor-pointer"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        beginEditConnectorLabel(prev.id, node.id);
                      }}
                    >
                      <path
                        d={`M ${startX} ${startY} C ${c1x} ${startY}, ${c1x} ${endY}, ${endX} ${endY}`}
                        stroke="#000000"
                        strokeWidth={2}
                        fill="none"
                        markerEnd={isToCollapsedGoto ? undefined : "url(#flow-arrow)"}
                        style={{ pointerEvents: 'stroke' }}
                      />
                      {label && (
                        <g>
                          <rect
                            x={midX - 40}
                            y={midY - 10}
                            rx={0}
                            ry={0}
                            width={80}
                            height={20}
                            fill={labelColor}
                          />
                          <text
                            x={midX}
                            y={midY + 3}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize={10}
                          >
                            {label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                });
              })}

              {/* Go-to connectors (dashed) */}
              {nodes.map((node) => {
                if (node.type !== 'goto' || !node.gotoTargetId) return null;
                const from = layout.get(node.id);
                const to = layout.get(node.gotoTargetId);
                if (!from || !to) return null;

                const isCollapsedGoto = selectedNodeId !== node.id;
                if (isCollapsedGoto) {
                  const { bridgePath, redirectPath } = buildCollapsedGotoPaths({
                    source: { x: from.x, y: from.y, width: NODE_WIDTH, height: NODE_HEIGHT },
                    target: { x: to.x, y: to.y, width: NODE_WIDTH, height: NODE_HEIGHT },
                  });

                  const handleExpand = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setSelectedNodeId(node.id);
                    setTypeMenuForId(null);
                  };

                  return (
                    <g key={`goto-collapsed-${node.id}-${node.gotoTargetId}`}>
                      <path
                        d={bridgePath}
                        stroke="#000000"
                        strokeWidth={selectedNodeId === node.id ? 3 : 2}
                        fill="none"
                        opacity={0.9}
                      />
                      <path
                        d={redirectPath}
                        stroke="#000000"
                        strokeWidth={selectedNodeId === node.id ? 3 : 2}
                        fill="none"
                        markerEnd="url(#flow-arrow)"
                        opacity={0.9}
                      />
                      <path
                        d={`${bridgePath} ${redirectPath}`}
                        stroke="transparent"
                        strokeWidth={14}
                        fill="none"
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onClick={handleExpand}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </g>
                  );
                }
                const fromMidY = from.y + NODE_HEIGHT / 2;
                const toMidY = to.y + NODE_HEIGHT / 2;
                const verticalDelta = toMidY - fromMidY;
                const startX = from.x + NODE_WIDTH / 2;
                const startY =
                  verticalDelta >= 0 ? from.y + NODE_HEIGHT : from.y;
                const endX = to.x + NODE_WIDTH / 2;
                const endY =
                  verticalDelta >= 0 ? to.y : to.y + NODE_HEIGHT;
                const c1y = startY + (endY - startY) / 2;

                return (
                  <path
                    key={`goto-${node.id}-${node.gotoTargetId}`}
                    d={`M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c1y}, ${endX} ${endY}`}
                    stroke="#000000"
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray="4 4"
                    markerEnd="url(#flow-arrow)"
                  />
                );
              })}

              {/* Fork connectors (true visual branching from a common source) */}
              {branches.map((branch, branchIdx) => {
                const meta = forkMeta[branch.id];
                if (!meta) return null;
                const branchNodes = nodes.filter(
                  (n) => (n.branchId || branches[0]?.id) === branch.id,
                );
                if (!branchNodes.length) return null;
                const sourceNode = nodes.find((n) => n.id === meta.sourceNodeId);
                const source = layout.get(meta.sourceNodeId);
                const first = layout.get(branchNodes[0].id);
                if (!source || !first || !sourceNode) return null;

                // Validation rule (match main-canvas semantics):
                // - "Yes" path is the in-branch sequential connector (exits from TOP corner)
                // - "No" path is the fork connector to a new branch (exits from BOTTOM corner)
                // Therefore, for fork connectors from validation nodes we always use branchIndex=1.
                const branchIndex = sourceNode.type === 'validation' ? 1 : 0;

                // Get connection points using diamond corners for validation/branch nodes
                // For diamonds, adjust position to account for the layout offset
                const sourceIsDiamond = sourceNode.type === 'validation' || sourceNode.type === 'branch';
                const targetIsDiamond = branchNodes[0].type === 'validation' || branchNodes[0].type === 'branch';
                const sourceX = sourceIsDiamond ? source.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : source.x;
                const sourceY = sourceIsDiamond ? source.y : source.y;
                const targetX = targetIsDiamond ? first.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : first.x;
                const targetY = targetIsDiamond ? first.y : first.y;
                
                const startPoint = getOutgoingConnectionPoint(sourceNode, sourceX, sourceY, branchIndex);
                const endPoint = getIncomingConnectionPoint(branchNodes[0], targetX, targetY);
                const startX = startPoint.x;
                const startY = startPoint.y;
                const endX = endPoint.x;
                const endY = endPoint.y;
                
                // For validation nodes, use vertical bezier at origin and horizontal at target
                let pathD: string;
                if (sourceNode.type === 'validation') {
                  // Vertical curve at origin (diamond corner), horizontal at target
                  const verticalDistance = Math.abs(endY - startY);
                  const horizontalDistance = Math.abs(endX - startX);
                  const curveDistance = Math.max(Math.min(verticalDistance, horizontalDistance) * 0.5, 40);
                  
                  // Control point 1: extend vertically from start
                  const c1x = startX;
                  // Deterministic direction at origin:
                  // - branchIndex 0 exits from TOP corner → curve UP
                  // - branchIndex 1 exits from BOTTOM corner → curve DOWN
                  const c1y = branchIndex === 0 ? startY - curveDistance : startY + curveDistance;
                  
                  // Control point 2: extend horizontally toward end
                  const c2x = endX < startX ? endX + curveDistance : endX - curveDistance;
                  const c2y = endY;
                  
                  pathD = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
                } else {
                  // Standard horizontal bezier for other node types
                  const c1x = startX + (endX - startX) / 2;
                  pathD = `M ${startX} ${startY} C ${c1x} ${startY}, ${c1x} ${endY}, ${endX} ${endY}`;
                }
                
                const key = edgeKey(meta.sourceNodeId, branchNodes[0].id);
                const label = connectorLabels[key]?.label?.trim();
    const labelColor = connectorLabels[key]?.color || '#0f172a';
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;

                return (
                  <g
                    key={`fork-${branch.id}-${meta.sourceNodeId}`}
                    className="cursor-pointer"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      beginEditConnectorLabel(meta.sourceNodeId, branchNodes[0].id);
                    }}
                  >
                    <path
                      d={pathD}
                      stroke="#000000"
                      strokeWidth={2}
                      fill="none"
                      markerEnd="url(#flow-arrow)"
                      style={{ pointerEvents: 'stroke' }}
                    />
                    {label && (
                      <g>
                        <rect
                          x={midX - 40}
                          y={midY - 10}
                          rx={0}
                          ry={0}
                          width={80}
                          height={20}
                          fill={labelColor}
                        />
                        <text
                          x={midX}
                          y={midY + 3}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={10}
                        >
                          {label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

            </svg>

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = layout.get(node.id);
              if (!pos) return null;
              const isSelected = selectedNodeId === node.id;
              const isEditing = editingNodeId === node.id;
              const isReadyToEdit = readyToEditNodeId === node.id;

              const isEnd = node.type === 'end';
              const isGoto = node.type === 'goto';
              const isLoop = node.type === 'loop';
              const isCollapsedGotoVisual =
                isGoto && !!node.gotoTargetId && selectedNodeId !== node.id;
              if (isCollapsedGotoVisual) return null;

              const isDiamond = node.type === 'validation' || node.type === 'branch';

              return (
                <div
                  key={node.id}
                  draggable
                  onDragStart={() => setDraggingId(node.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleReorder(node.id);
                  }}
                  className={`group absolute flex border transition-all ${
                    // Diamonds must be a true DIAMOND_SIZE square; min-width breaks connector math.
                    isDiamond
                      ? 'items-center justify-center p-0'
                      : 'min-w-[160px] max-w-[220px] flex-col items-stretch justify-between px-3 py-2 rounded-md'
                  } ${
                    isEditing 
                      ? 'cursor-text' 
                      : isReadyToEdit 
                        ? 'cursor-text' 
                        : 'cursor-pointer'
                  } ${
                    draggingId === node.id ? 'border-dashed opacity-60' : ''
                  } ${
                    isSelected
                      ? 'border-blue-500 ring-1 ring-blue-300'
                      : 'border-slate-200'
                  } ${
                    hoveredBranchId && nodesByBranch.get(hoveredBranchId)?.has(node.id)
                      ? 'ring-2 ring-blue-400 ring-offset-1 bg-blue-50 shadow-md'
                      : node.type === 'validation' || node.type === 'branch'
                        ? 'bg-white hover:bg-slate-50 hover:shadow-md'
                        : isEnd
                          ? 'bg-slate-300 hover:bg-slate-400 hover:shadow-md'
                          : isGoto
                            ? 'bg-slate-200 hover:bg-slate-300 hover:shadow-md'
                            : 'bg-white hover:bg-slate-50 hover:shadow-md'
                  }`}
                  style={{
                    left: isDiamond ? pos.x + (NODE_WIDTH - DIAMOND_SIZE) / 2 : pos.x,
                    // Diamonds are positioned so their CENTER matches the row center (same as regular nodes),
                    // by shifting their top upward in the layout calculation.
                    top: pos.y,
                    width: isDiamond ? DIAMOND_SIZE : NODE_WIDTH,
                    height: isDiamond ? DIAMOND_SIZE : undefined,
                    minHeight: isDiamond ? DIAMOND_SIZE : NODE_HEIGHT,
                    ...(isDiamond ? {
                      clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                      transform: 'rotate(0deg)',
                    } : {}),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Don't handle clicks if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT' || target.tagName === 'INPUT') {
                      return;
                    }
                    
                    setSelectedNodeId(node.id);
                    
                    // First click: set ready to edit (shows I-beam cursor)
                    if (!isEditing && !isReadyToEdit) {
                      setReadyToEditNodeId(node.id);
                    } 
                    // Second click: actually start editing
                    else if (!isEditing && isReadyToEdit) {
                      setEditingNodeId(node.id);
                      setReadyToEditNodeId(null);
                    }
                  }}
                  onDoubleClick={(e) => {
                    // Double-click to edit immediately (like NexusCanvas)
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'BUTTON' || target.tagName === 'SELECT') {
                      return;
                    }
                    e.stopPropagation();
                    if (!isEditing) {
                      setEditingNodeId(node.id);
                      setReadyToEditNodeId(null);
                    }
                  }}
                  onMouseLeave={() => {
                    // Reset ready to edit when mouse leaves (optional - helps with UX)
                    if (isReadyToEdit && !isEditing) {
                      setReadyToEditNodeId(null);
                    }
                  }}
                >
                  {node.type === 'time' && (
                    <div className="flex justify-center pb-1 pointer-events-none">
                      <Clock size={20} className="text-slate-500" />
                    </div>
                  )}
                  {node.type === 'loop' && (
                    <div className="flex justify-center pb-1 pointer-events-none">
                      <Repeat size={20} className="text-slate-500" />
                    </div>
                  )}

                  <div
                    className={`relative flex items-center ${
                      ['goto', 'time', 'loop', 'validation', 'branch'].includes(node.type)
                        ? 'justify-center text-center'
                        : ''
                    }`}
                  >
                    {node.type === 'end' ? (
                      <div className="w-full rounded border border-slate-300 bg-slate-300 px-1.5 py-0.5 text-xs text-white text-center">
                        End
                      </div>
                    ) : node.type === 'goto' ? (
                      <div className="flex w-full items-center justify-center gap-1 text-xs text-slate-900">
                        <span className="text-slate-600">Go to</span>
                        <select
                          value={node.gotoTargetId || ''}
                          onChange={(e) => {
                            const nextTargetId = e.target.value;
                            updateNode(node.id, { gotoTargetId: nextTargetId });
                          }}
                          className="appearance-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        >
                          <option value="" disabled>
                            Select…
                          </option>
                          {nodes
                            .filter((n) => n.id !== node.id)
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.label || n.id}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        {isEditing ? (
                          <input
                            ref={(el) => {
                              if (el) {
                                inputRefs.current.set(node.id, el);
                              } else {
                                inputRefs.current.delete(node.id);
                              }
                            }}
                            type="text"
                            value={node.label}
                            onFocus={() => {
                              setActiveSuggestionIndex(null);
                            }}
                            onBlur={() => {
                              if (editingNodeId === node.id) {
                                setEditingNodeId(null);
                                setReadyToEditNodeId(null);
                                setActiveSuggestionIndex(null);
                              }
                            }}
                            onChange={(e) => {
                              updateNode(node.id, { label: e.target.value });
                              setActiveSuggestionIndex(null);
                            }}
                            onKeyDown={(e) => {
                              // Keep arrow navigation inside the suggestion list
                              if (!hasDimensionValues || !dimensionValues) return;
                              const q = (e.currentTarget.value || '').toLowerCase();
                              const suggestions = dimensionValues.filter(
                                (val) =>
                                  q && val.toLowerCase().includes(q) && val.toLowerCase() !== q,
                              );
                              if (!suggestions.length) return;

                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setActiveSuggestionIndex((prev) => {
                                  if (prev == null) return 0;
                                  return Math.min(prev + 1, suggestions.length - 1);
                                });
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setActiveSuggestionIndex((prev) => {
                                  if (prev == null) return suggestions.length - 1;
                                  return Math.max(prev - 1, 0);
                                });
                              } else if (e.key === 'Enter' && activeSuggestionIndex != null) {
                                e.preventDefault();
                                const chosen = suggestions[activeSuggestionIndex];
                                updateNode(node.id, { label: chosen });
                                setActiveSuggestionIndex(null);
                              }
                            }}
                            className="w-full rounded border border-blue-400 pr-6 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-text"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="w-full px-1.5 py-0.5 text-xs text-slate-900">
                            {node.label || 'Describe this step...'}
                          </div>
                        )}
                      </>
                    )}
                    {/* Type menu trigger */}
                          <button
                            type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeMenuForId((prev) => (prev === node.id ? null : node.id));
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Change node type"
                    >
                      <ArrowLeftRight size={12} />
                          </button>
                  </div>

                  {/* Loop target dropdown (optional) */}
                  {isLoop && isSelected && (() => {
                    const options = loopDescendantsById.get(node.id) || [];
                    const selectedIsValid = !!node.loopTargetId && options.some((o) => o.id === node.loopTargetId);
                    return (
                      <div className="mt-1 flex w-full items-center justify-center gap-1 text-[11px] text-slate-900">
                        <span className="text-slate-600">Loop to</span>
                        <select
                          value={selectedIsValid ? (node.loopTargetId || '') : ''}
                          onChange={(e) => {
                            const nextTargetId = e.target.value;
                            updateNode(node.id, { loopTargetId: nextTargetId || undefined });
                          }}
                          className="appearance-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        >
                          <option value="">
                            {options.length ? 'Select…' : 'No children'}
                          </option>
                          {options.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.label || n.id}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  {hasDimensionValues &&
                    dimensionValues &&
                    node.label &&
                    isEditing &&
                    (() => {
                      const q = node.label.toLowerCase();
                      const suggestions = dimensionValues.filter(
                        (val) =>
                          val.toLowerCase().includes(q) && val.toLowerCase() !== q,
                      );
                      if (!suggestions.length) return null;
                      return (
                        <div className="mt-1 max-h-20 overflow-auto rounded-md border border-slate-200 bg-white text-[10px] shadow-lg">
                          {suggestions.map((val, idx) => (
                          <button
                              key={val}
                            type="button"
                              onMouseDown={(e) => {
                                // prevent input blur before click
                                e.preventDefault();
                              }}
                              onClick={() => {
                                updateNode(node.id, { label: val });
                                setActiveSuggestionIndex(null);
                              }}
                              className={`block w-full px-2 py-0.5 text-left ${
                                activeSuggestionIndex === idx
                                  ? 'bg-slate-100 text-slate-900'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {val}
                          </button>
                          ))}
                        </div>
                      );
                    })()}

                  {/* Inline type menu (popover) */}
                  {typeMenuForId === node.id && (
                    <div
                      className="absolute right-2 top-6 z-20 rounded-md border border-slate-200 bg-white py-1 text-[10px] shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                        {[
                          { value: 'step', label: 'Step' },
                        { value: 'time', label: 'Timer' },
                        { value: 'loop', label: 'Loop' },
                        { value: 'action', label: 'Action' },
                        { value: 'validation', label: 'Validation (Yes/No)' },
                        { value: 'branch', label: 'Use case (multi-case)' },
                        { value: 'end', label: 'End' },
                        { value: 'goto', label: 'Go To' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                          onClick={() => {
                            const nextType = opt.value as FlowNodeType;
                            if (nextType === 'validation') {
                              const ok = setupValidationExits(node);
                              setTypeMenuForId(null);
                              return;
                            }
                            updateNode(node.id, { type: nextType });
                            setTypeMenuForId(null);
                          }}
                          className={`block w-full px-2 py-0.5 text-left hover:bg-slate-50 ${
                            node.type === opt.value ? 'font-semibold text-slate-900' : 'text-slate-600'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                  )}
                    </div>
              );
            })}

            {/* Inline editor for connector labels (double-click any line, FigJam-style) */}
            {editingConnector && (() => {
              const { fromId, toId } = editingConnector;
              const fromNode = layout.get(fromId);
              const toNode = layout.get(toId);
              if (!fromNode || !toNode) return null;
              const currentColor =
                connectorLabels[edgeKey(fromId, toId)]?.color || '#0f172a';

              const startX = fromNode.x + NODE_WIDTH;
              const startY = fromNode.y + NODE_HEIGHT / 2;
              const endX = toNode.x;
              const endY = toNode.y + NODE_HEIGHT / 2;
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;

              return (
                <div
                  key="connector-label-editor"
                  style={{
                    position: 'absolute',
                    left: midX - 80,
                    top: midY - 18,
                    width: 160,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="h-5 w-5 rounded border border-slate-700"
                      style={{ backgroundColor: currentColor }}
                      title="Connector label color"
                      onClick={(e) => e.stopPropagation()}
                    />
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
                      className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      placeholder="Why does this path branch?"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {connectorColorOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`h-4 w-4 rounded border ${
                          currentColor === opt.value
                            ? 'border-white'
                            : 'border-slate-700'
                        }`}
                        style={{ backgroundColor: opt.value }}
                        title={opt.label}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const key = edgeKey(fromId, toId);
                          setConnectorLabels((prev) => ({
                            ...prev,
                            [key]: {
                              label: prev[key]?.label || editingConnectorValue || '',
                              color: opt.value,
                            },
                          }));
                        }}
                      />
                ))}
              </div>
            </div>
          );
            })()}
              </div>
            </div>
      </div>
    </div>
  );
}

