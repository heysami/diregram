import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import {
  ExpandedGridNodeRuntime,
  ExpandedGridRelationCardinality,
  ExpandedGridRelationKind,
  ExpandedGridUiType,
  loadExpandedGridNodesFromDoc,
  saveExpandedGridNodesToDoc,
} from '@/lib/expanded-grid-storage';
import { createDataObject, loadDataObjects, upsertDataObject } from '@/lib/data-object-storage';
import { loadExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { DataObjectAttributeMultiSelect } from '@/components/DataObjectAttributeMultiSelect';

const UI_TYPES: Array<{ value: ExpandedGridUiType; label: string }> = [
  { value: 'content', label: 'Content' },
  { value: 'list', label: 'List' },
  { value: 'button', label: 'Button' },
  { value: 'navOut', label: 'Navigation out' },
  { value: 'filter', label: 'Filter' },
  { value: 'tabs', label: 'Tabs' },
];

const COLORS = ['slate', 'gray', 'blue', 'green', 'red', 'purple', 'orange', 'pink', 'cyan', 'yellow'] as const;
type ColorName = (typeof COLORS)[number];

const colorChipClass: Record<ColorName, string> = {
  slate: 'mac-fill--dots-3',
  gray: 'mac-fill--dots-2',
  blue: 'mac-fill--dots-1',
  green: 'mac-fill--dots-3',
  red: 'mac-fill--dots-2',
  purple: 'mac-fill--hatch',
  orange: 'mac-fill--hatch2',
  pink: 'mac-fill--stripes-h',
  cyan: 'mac-fill--stripes-v',
  yellow: 'mac-fill--checker',
};

export type SelectedExpandedGridNode = {
  runningNumber: number;
  gridNodeKey: string;
  parentNodeLabel?: string;
  parentNodeId?: string;
};

interface Props {
  doc: Y.Doc;
  selection: SelectedExpandedGridNode;
  // Optional: node map + parent node id allow showing "pick from children" suggestions
  nodeMap?: Map<string, import('@/types/nexus').NexusNode>;
  onClose: () => void;
}

export function ExpandedGridNodePanel({ doc, selection, nodeMap, onClose }: Props) {
  const { runningNumber, gridNodeKey } = selection;

  const [gridNodes, setGridNodes] = useState<ExpandedGridNodeRuntime[]>(() => {
    const loaded = loadExpandedGridNodesFromDoc(doc, runningNumber);
    return loaded.nodes;
  });
  const [dataObjectStore, setDataObjectStore] = useState(() => loadDataObjects(doc));
  const [newDataObjectName, setNewDataObjectName] = useState('');
  const [parentDataObjectId, setParentDataObjectId] = useState<string | undefined>(() => {
    const m = loadExpandedNodeMetadata(doc, runningNumber);
    return m.dataObjectId;
  });

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      setGridNodes(loadExpandedGridNodesFromDoc(doc, runningNumber).nodes);
    };
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, runningNumber]);

  const selectedNode = useMemo(
    () => gridNodes.find((n) => (n.key || n.id) === gridNodeKey) || null,
    [gridNodes, gridNodeKey],
  );

  const siblingLinkedObjects = useMemo(() => {
    const ids = new Set<string>();
    gridNodes.forEach((n) => {
      const k = (n.key || n.id) as string;
      if (k === gridNodeKey) return;
      if (n.dataObjectId) ids.add(n.dataObjectId);
    });
    return Array.from(ids)
      .map((id) => dataObjectStore.objects.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o);
  }, [gridNodes, gridNodeKey, dataObjectStore.objects]);

  const childNodeLinkedObjects = useMemo(() => {
    if (!nodeMap || !selection.parentNodeId) return [];
    const parent = nodeMap.get(selection.parentNodeId);
    if (!parent) return [];
    const ids = new Set<string>();
    parent.children.forEach((c) => {
      if (c.dataObjectId) ids.add(c.dataObjectId);
    });
    return Array.from(ids)
      .map((id) => dataObjectStore.objects.find((o) => o.id === id))
      .filter((o): o is NonNullable<typeof o> => !!o);
  }, [nodeMap, selection.parentNodeId, dataObjectStore.objects]);

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      setDataObjectStore(loadDataObjects(doc));
      setParentDataObjectId(loadExpandedNodeMetadata(doc, runningNumber).dataObjectId);
    };
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, runningNumber]);

  if (!selectedNode) {
    return (
      <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">Expanded Node</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="p-4 text-xs">Selection not found (it may have been deleted).</div>
      </div>
    );
  }

  const commit = (patch: Partial<ExpandedGridNodeRuntime>) => {
    const updated = gridNodes.map((n) => ((n.key || n.id) === gridNodeKey ? { ...n, ...patch } : n));
    saveExpandedGridNodesToDoc(doc, runningNumber, updated);
  };

  const linkedObject = selectedNode.dataObjectId
    ? dataObjectStore.objects.find((o) => o.id === selectedNode.dataObjectId) || null
    : null;

  const parentObject = parentDataObjectId
    ? dataObjectStore.objects.find((o) => o.id === parentDataObjectId) || null
    : null;

  const deriveRelation = (): { kind: ExpandedGridRelationKind; cardinality?: ExpandedGridRelationCardinality } => {
    // Only meaningful if both sides have data objects.
    if (!parentDataObjectId || !selectedNode.dataObjectId) return { kind: 'none' };
    const ui = selectedNode.uiType || 'content';
    if (ui === 'list') return { kind: 'relation', cardinality: (selectedNode.relationCardinality as ExpandedGridRelationCardinality) || 'manyToMany' };
    if (ui === 'navOut') return { kind: 'none' };
    return { kind: 'attribute' };
  };

  const relation = deriveRelation();

  return (
    <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Expanded Node</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onClose} className="mac-btn" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="text-[11px] opacity-80 truncate mb-3">
          {selection.parentNodeLabel ? `${selection.parentNodeLabel} · ` : ''}#{runningNumber}
        </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Icon (emoji / ascii)</label>
        <input
          type="text"
          defaultValue={selectedNode.icon || ''}
          onBlur={(e) => commit({ icon: e.target.value.trim() || undefined })}
          placeholder="e.g. 🙂 or [*]"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Text</label>
        <textarea
          defaultValue={selectedNode.content}
          onBlur={(e) => commit({ content: e.target.value.trim() || 'New Node' })}
          className="w-full min-h-[60px] text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white resize-y"
        />
      </div>

      <div className="mb-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">Linked data object</label>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => commit({ dataObjectId: undefined, dataObjectAttributeIds: [] })}
              className={`text-[11px] px-2 py-1 rounded-md border ${selectedNode.dataObjectId ? 'border-gray-200 text-gray-600 hover:bg-gray-100' : 'border-blue-300 bg-blue-50 text-blue-700'}`}
            >
              None
            </button>
            {childNodeLinkedObjects.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => commit({ dataObjectId: o.id, dataObjectAttributeIds: [] })}
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  selectedNode.dataObjectId === o.id
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
                title="From this expanded node's direct tree children"
              >
                {o.name}
              </button>
            ))}
            {siblingLinkedObjects.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => commit({ dataObjectId: o.id, dataObjectAttributeIds: [] })}
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  selectedNode.dataObjectId === o.id
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
                title="Pick from other inner nodes under this expanded node"
              >
                {o.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <DataObjectSearchSelect
              className="flex-1"
              value={selectedNode.dataObjectId || ''}
              onChange={(nextId) => commit({ dataObjectId: nextId || undefined, dataObjectAttributeIds: [] })}
              objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
              placeholder="Other…"
              includeNoneOption={true}
              noneLabel="None"
            />
          </div>

          {childNodeLinkedObjects.length === 0 && (
            <div className="text-[10px] text-gray-500">
              Tip: link data objects on the expanded node&apos;s direct child nodes to see them here.
            </div>
          )}
        </div>
      </div>

      {selectedNode.dataObjectId ? (
        <DataObjectAttributeMultiSelect
          objectId={selectedNode.dataObjectId}
          objects={dataObjectStore.objects}
          value={selectedNode.dataObjectAttributeIds || []}
          onChange={(next) => commit({ dataObjectAttributeIds: next })}
          label="Linked attributes"
        />
      ) : null}

      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={newDataObjectName}
          onChange={(e) => setNewDataObjectName(e.target.value)}
          placeholder="New data object name…"
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => {
            const name = newDataObjectName.trim();
            if (!name) return;
            const obj = createDataObject(doc, name);
            setNewDataObjectName('');
            commit({ dataObjectId: obj.id, dataObjectAttributeIds: [] });
          }}
          className="text-[11px] px-2 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Create
        </button>
      </div>

      {selectedNode.dataObjectId && (
        <div className="mb-6">
          <div className="text-[11px] text-gray-600">
            Type: <span className="font-medium">{UI_TYPES.find((t) => t.value === (selectedNode.uiType || 'content'))?.label || 'Content'}</span>
          </div>
        </div>
      )}

      <details className="border-t pt-4">
        <summary className="cursor-pointer text-[11px] font-medium text-gray-600 hover:text-gray-800">
          More properties
        </summary>

        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select
            value={selectedNode.uiType || 'content'}
            onChange={(e) => {
              const nextType = e.target.value as ExpandedGridUiType;
              const nextPatch: Partial<ExpandedGridNodeRuntime> = { uiType: nextType };
              // Keep relationship fields constrained: only lists can carry relation cardinality.
              if (nextType !== 'list') {
                nextPatch.relationKind = undefined;
                nextPatch.relationCardinality = undefined;
              } else {
                nextPatch.relationKind = 'relation';
                nextPatch.relationCardinality = selectedNode.relationCardinality || 'manyToMany';
              }
              commit(nextPatch);
            }}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {UI_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-700 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const selected = (selectedNode.color || 'slate') === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => commit({ color: c })}
                  className={`w-6 h-6 rounded-full border ${selected ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-200'} ${colorChipClass[c]}`}
                  title={c}
                />
              );
            })}
            <button
              type="button"
              onClick={() => commit({ color: undefined })}
              className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
              title="Clear color"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Relationship</div>
          <div className="text-[11px] text-gray-600 mb-2">
            {parentObject ? (
              <>
                Parent (main) data: <span className="font-medium">{parentObject.name}</span> ({parentObject.id})
              </>
            ) : (
              <>No parent data object linked on the main node yet.</>
            )}
          </div>

          <div className="text-[11px] text-gray-700 mb-2">
            Inferred:{" "}
            <span className="font-medium">
              {relation.kind === 'relation' ? 'Relation to parent' : relation.kind === 'attribute' ? 'Attribute of parent' : 'None'}
            </span>
          </div>

          {/* Only allow editing when it's a relation-to-parent, and only between many-to-many and one-to-many */}
          {relation.kind === 'relation' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!parentDataObjectId || !selectedNode.dataObjectId}
                onClick={() => commit({ relationKind: 'relation', relationCardinality: 'manyToMany' })}
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  (selectedNode.relationCardinality || 'manyToMany') === 'manyToMany'
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                Many-to-many
              </button>
              <button
                type="button"
                disabled={!parentDataObjectId || !selectedNode.dataObjectId}
                onClick={() => commit({ relationKind: 'relation', relationCardinality: 'oneToMany' })}
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  (selectedNode.relationCardinality || 'manyToMany') === 'oneToMany'
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                } disabled:opacity-50`}
              >
                One-to-many
              </button>
            </div>
          )}
        </div>
      </details>

      {linkedObject && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-gray-600 hover:text-gray-800">
            Advanced: data object JSON
          </summary>
          <div className="mt-2">
            <textarea
              defaultValue={JSON.stringify(linkedObject.data ?? {}, null, 2)}
              onBlur={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  upsertDataObject(doc, { ...linkedObject, data: parsed });
                } catch {
                  // ignore invalid json on blur
                }
              }}
              className="w-full min-h-[140px] text-xs font-mono border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <div className="mt-1 text-[10px] text-gray-500">
              Shared object: any node linked to <span className="font-medium">{linkedObject.id}</span> will see updates.
            </div>
          </div>
        </details>
      )}
      </div>
    </div>
  );
}

