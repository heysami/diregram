import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { loadDataObjects, type NexusDataObject } from '@/lib/data-object-storage';
import {
  loadExpandedGridNodesFromMarkdown,
  type ExpandedGridNodeRuntime,
  type ExpandedGridRelationCardinality,
} from '@/lib/expanded-grid-storage';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';

export type DataObjectEdgeKind = 'attribute' | 'relation';
export type DataObjectCardinality = ExpandedGridRelationCardinality | 'unknown';

export type DataObjectEdgeSource =
  | { type: 'expanded-grid'; runningNumber: number; gridNodeKey: string; uiType?: string }
  | { type: 'tree'; parentNodeId: string; childNodeId: string };

export type DataObjectNode = {
  id: string;
  name: string;
  data: unknown;
  missing?: boolean;
};

export type DataObjectEdge = {
  fromId: string;
  toId: string;
  kind: DataObjectEdgeKind;
  cardinality?: DataObjectCardinality;
  source: DataObjectEdgeSource;
};

export type DataObjectGraph = {
  objects: DataObjectNode[];
  edges: DataObjectEdge[];
};

function getAllExpandedRunningNumbersFromMarkdown(markdown: string): number[] {
  const set = new Set<number>();

  // expanded grids
  const gridRe = /```expanded-grid-(\d+)\n/g;
  for (;;) {
    const m = gridRe.exec(markdown);
    if (!m) break;
    const rn = Number.parseInt(m[1], 10);
    if (Number.isFinite(rn)) set.add(rn);
  }

  // expanded metadata
  const metaRe = /```expanded-metadata-(\d+)\n/g;
  for (;;) {
    const m = metaRe.exec(markdown);
    if (!m) break;
    const rn = Number.parseInt(m[1], 10);
    if (Number.isFinite(rn)) set.add(rn);
  }

  return Array.from(set.values()).sort((a, b) => a - b);
}

function loadExpandedNodeMetadataFromMarkdown(markdown: string, runningNumber: number): { dataObjectId?: string } {
  const DEFAULT = { dataObjectId: undefined as string | undefined };
  const re = new RegExp(String.raw`\`\`\`expanded-metadata-${String(runningNumber)}\n([\s\S]*?)\n\`\`\``);
  const m = markdown.match(re);
  if (!m) return DEFAULT;
  try {
    const parsed = JSON.parse(m[1]);
    const rec = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}) as Record<string, unknown>;
    return {
      dataObjectId: typeof rec.dataObjectId === 'string' ? rec.dataObjectId : undefined,
    };
  } catch {
    return DEFAULT;
  }
}

function traverseAllNodes(roots: NexusNode[], fn: (node: NexusNode) => void) {
  const visit = (nodes: NexusNode[]) => {
    nodes.forEach((n) => {
      fn(n);
      if (n.isHub && n.variants) {
        n.variants.forEach((v) => {
          fn(v);
          visit(v.children);
        });
      } else {
        visit(n.children);
      }
    });
  };
  visit(roots);
}

function buildNodeMap(roots: NexusNode[]): Map<string, NexusNode> {
  const map = new Map<string, NexusNode>();
  traverseAllNodes(roots, (n) => {
    map.set(n.id, n);
  });
  return map;
}

function inferExpandedGridEdge(opts: {
  parentDataObjectId?: string;
  gridNode: ExpandedGridNodeRuntime;
  runningNumber: number;
}): DataObjectEdge | null {
  const { parentDataObjectId, gridNode, runningNumber } = opts;
  const childId = (gridNode.dataObjectId || '').trim();
  const parentId = (parentDataObjectId || '').trim();
  if (!childId || !parentId) return null;

  const uiType = gridNode.uiType || 'content';
  if (uiType === 'navOut') return null;

  // Prefer explicit semantics when present; this keeps UI guidance/checklists truthful.
  // - relationKind:"relation" is the primary signal that the user intends this to show as a linked object
  // - relationKind:"none" means purely UI (no domain linkage)
  if (gridNode.relationKind === 'none') return null;
  if (gridNode.relationKind === 'relation') {
    return {
      fromId: parentId,
      toId: childId,
      kind: 'relation',
      cardinality: (gridNode.relationCardinality || 'manyToMany') as ExpandedGridRelationCardinality,
      source: { type: 'expanded-grid', runningNumber, gridNodeKey: (gridNode.key || gridNode.id) as string, uiType },
    };
  }
  if (gridNode.relationKind === 'attribute') {
    return {
      fromId: parentId,
      toId: childId,
      kind: 'attribute',
      cardinality: 'one',
      source: { type: 'expanded-grid', runningNumber, gridNodeKey: (gridNode.key || gridNode.id) as string, uiType },
    };
  }

  // Fallback: infer from uiType (legacy behavior)
  if (uiType === 'list') {
    return {
      fromId: parentId,
      toId: childId,
      kind: 'relation',
      cardinality: (gridNode.relationCardinality || 'manyToMany') as ExpandedGridRelationCardinality,
      source: { type: 'expanded-grid', runningNumber, gridNodeKey: (gridNode.key || gridNode.id) as string, uiType },
    };
  }

  return {
    fromId: parentId,
    toId: childId,
    kind: 'attribute',
    cardinality: 'one',
    source: { type: 'expanded-grid', runningNumber, gridNodeKey: (gridNode.key || gridNode.id) as string, uiType },
  };
}

export function buildMergedDataObjectGraph(doc: Y.Doc, roots: NexusNode[]): DataObjectGraph {
  const yText = doc.getText('nexus');
  const markdown = yText.toString();

  const store = loadDataObjects(doc);
  const objById = new Map<string, NexusDataObject>();
  store.objects.forEach((o) => objById.set(o.id, o));

  const referencedIds = new Set<string>();
  const edges: DataObjectEdge[] = [];

  // Inherit expanded "parent/main" data object from the main canvas node's own dataObjectId,
  // using the persistent `<!-- expid:N -->` marker to bind runningNumber -> node lineIndex.
  const inheritedExpandedParentDoId = (() => {
    const lineToExpId = extractExpandedIdsFromMarkdown(markdown); // Map<lineIndex, runningNumber>
    const nodeByLineIndex = new Map<number, NexusNode>();
    traverseAllNodes(roots, (n) => nodeByLineIndex.set(n.lineIndex, n));
    const rnToDoId = new Map<number, string>();
    lineToExpId.forEach((rn, lineIndex) => {
      const node = nodeByLineIndex.get(lineIndex);
      const doid = (node?.dataObjectId || '').trim();
      if (doid) rnToDoId.set(rn, doid);
    });
    return rnToDoId;
  })();

  // 1) Relationships implied by expanded-grid nodes (across all expanded configurations)
  const runningNumbers = getAllExpandedRunningNumbersFromMarkdown(markdown);
  runningNumbers.forEach((rn) => {
    const meta = loadExpandedNodeMetadataFromMarkdown(markdown, rn);
    const parentDataObjectId = meta.dataObjectId || inheritedExpandedParentDoId.get(rn);
    const { nodes: gridNodes } = loadExpandedGridNodesFromMarkdown(markdown, rn);
    gridNodes.forEach((gn) => {
      if (parentDataObjectId) referencedIds.add(parentDataObjectId);
      if (gn.dataObjectId) referencedIds.add(gn.dataObjectId);
      const edge = inferExpandedGridEdge({ parentDataObjectId, gridNode: gn, runningNumber: rn });
      if (edge) edges.push(edge);
    });
  });

  // 2) Relationships implied by tree nesting (node assignments)
  const nodeMap = buildNodeMap(roots);
  traverseAllNodes(roots, (n) => {
    if (n.dataObjectId) referencedIds.add(n.dataObjectId);
    if (!n.parentId) return;
    if (!n.dataObjectId) return;
    const parent = nodeMap.get(n.parentId);
    if (!parent?.dataObjectId) return;

    referencedIds.add(parent.dataObjectId);
    edges.push({
      fromId: parent.dataObjectId,
      toId: n.dataObjectId,
      kind: 'relation',
      cardinality: 'unknown',
      source: { type: 'tree', parentNodeId: parent.id, childNodeId: n.id },
    });
  });

  // Objects = store objects, plus placeholders for any referenced-but-missing ids
  const objects: DataObjectNode[] = [];
  const allIds = new Set<string>([...objById.keys(), ...referencedIds.values()]);
  Array.from(allIds.values())
    .sort((a, b) => a.localeCompare(b))
    .forEach((id) => {
      const hit = objById.get(id);
      if (hit) {
        objects.push({ id: hit.id, name: hit.name, data: hit.data });
      } else {
        objects.push({ id, name: id, data: {}, missing: true });
      }
    });

  // De-dupe identical edges (same from/to/kind/cardinality)
  const seen = new Set<string>();
  const deduped: DataObjectEdge[] = [];
  edges.forEach((e) => {
    const key = `${e.fromId}__${e.toId}__${e.kind}__${String(e.cardinality ?? '')}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(e);
  });

  return { objects, edges: deduped };
}

