import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import {
  ExpandedGridNodeRuntime,
  loadExpandedGridNodesFromDoc,
  saveExpandedGridNodesToDoc,
} from '@/lib/expanded-grid-storage';
import { createDataObject, loadDataObjects } from '@/lib/data-object-storage';
import type { NexusNode } from '@/types/nexus';

export type SelectedExpandedGridNodes = {
  runningNumber: number;
  gridNodeKeys: string[];
  parentNodeLabel?: string;
  parentNodeId?: string;
};

interface Props {
  doc: Y.Doc;
  selection: SelectedExpandedGridNodes;
  nodeMap?: Map<string, NexusNode>;
  onClose: () => void;
}

export function ExpandedGridMultiSelectPanel({ doc, selection, nodeMap, onClose }: Props) {
  const { runningNumber, gridNodeKeys } = selection;
  const selectedKeySet = useMemo(() => new Set(gridNodeKeys), [gridNodeKeys]);

  const [gridNodes, setGridNodes] = useState<ExpandedGridNodeRuntime[]>(() => loadExpandedGridNodesFromDoc(doc, runningNumber).nodes);
  const [dataStore, setDataStore] = useState(() => loadDataObjects(doc));

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      setGridNodes(loadExpandedGridNodesFromDoc(doc, runningNumber).nodes);
      setDataStore(loadDataObjects(doc));
    };
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, runningNumber]);

  const childDataObjectIds = useMemo(() => {
    if (!nodeMap || !selection.parentNodeId) return new Set<string>();
    const parent = nodeMap.get(selection.parentNodeId);
    if (!parent) return new Set<string>();
    const ids = new Set<string>();
    parent.children.forEach((c) => {
      if (c.dataObjectId) ids.add(c.dataObjectId);
    });
    return ids;
  }, [nodeMap, selection.parentNodeId]);

  const selectedNodes = useMemo(() => {
    return gridNodes.filter((n) => selectedKeySet.has((n.key || n.id) as string));
  }, [gridNodes, selectedKeySet]);

  const lockedNodes = useMemo(() => {
    return selectedNodes.filter((n) => n.sourceChildDataObjectId && childDataObjectIds.has(n.sourceChildDataObjectId));
  }, [selectedNodes, childDataObjectIds]);

  const canDeleteAll = lockedNodes.length === 0;

  const deleteSelected = () => {
    if (!canDeleteAll) return;
    const remaining = gridNodes.filter((n) => !selectedKeySet.has((n.key || n.id) as string));
    saveExpandedGridNodesToDoc(doc, runningNumber, remaining);
  };

  const convertSelectedToDataObjects = () => {
    // For each selected node:
    // - if its content matches an existing object name (case-insensitive), link to that object
    // - else create new object with that name and link it
    const byNameLower = new Map<string, { id: string }>();
    dataStore.objects.forEach((o) => byNameLower.set(o.name.trim().toLowerCase(), { id: o.id }));

    let updated = [...gridNodes];
    selectedNodes.forEach((n) => {
      const key = (n.key || n.id) as string;
      const name = (n.content || '').trim();
      if (!name) return;
      if (n.dataObjectId) return; // already linked
      const hit = byNameLower.get(name.toLowerCase());
      const id = hit?.id || createDataObject(doc, name).id;
      byNameLower.set(name.toLowerCase(), { id });
      updated = updated.map((gn) => ((gn.key || gn.id) === key ? { ...gn, dataObjectId: id } : gn));
    });

    saveExpandedGridNodesToDoc(doc, runningNumber, updated);
  };

  return (
    <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Expanded Selection</div>
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

      <div className="mb-4 text-xs text-gray-700">
        Selected: <span className="font-medium">{selectedNodes.length}</span>
      </div>

      {!canDeleteAll && (
        <div className="mb-4 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
          Some selected nodes are locked because they are auto-created from direct child data nodes. Delete/unlink the child first.
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!canDeleteAll || selectedNodes.length === 0}
          className={`w-full text-[11px] px-3 py-2 rounded-md border ${
            canDeleteAll ? 'border-red-200 text-red-700 hover:bg-red-50 bg-white' : 'border-gray-200 text-gray-400 bg-gray-50'
          }`}
        >
          Delete selected
        </button>

        <button
          type="button"
          onClick={convertSelectedToDataObjects}
          disabled={selectedNodes.length === 0}
          className="w-full text-[11px] px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Convert to data object (reuse by name)
        </button>

        <div className="text-[10px] text-gray-500">
          Creates/links data objects using each node’s text. If a data object with the same name already exists, it links instead of creating.
        </div>
      </div>
      </div>
    </div>
  );
}

