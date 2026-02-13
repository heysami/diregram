import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import {
  ExpandedGridNodeRuntime,
  ExpandedGridRelationCardinality,
  ExpandedGridRelationKind,
  ExpandedGridUiType,
  ExpandedGridUiTab,
  ExpandedGridUiSection,
  ExpandedGridTextAlign,
  ExpandedGridTextVariant,
  loadExpandedGridNodesFromDoc,
  saveExpandedGridNodesToDoc,
} from '@/lib/expanded-grid-storage';
import { createDataObject, loadDataObjects, upsertDataObject } from '@/lib/data-object-storage';
import { loadExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { ExpandedGridNodePanelUiModal, type UiModal } from '@/components/expanded-grid-node-panel/ui-modal';
import { ExpandedGridNodePanelUiConfigEditor } from '@/components/expanded-grid-node-panel/ui-config-editor';
import { ExpandedGridNodePanelMainAttrsEditor } from '@/components/expanded-grid-node-panel/main-attrs-editor';

const UI_TYPES: Array<{ value: ExpandedGridUiType; label: string }> = [
  { value: 'content', label: 'Content' },
  { value: 'list', label: 'List' },
  { value: 'button', label: 'Button' },
  { value: 'navOut', label: 'Navigation out' },
  { value: 'filter', label: 'Filter' },
  { value: 'tabs', label: 'Tabs' },
  { value: 'wizard', label: 'Wizard' },
  { value: 'sideNav', label: 'Side nav' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'collapsible', label: 'Collapsible' },
  { value: 'text', label: 'Text' },
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

  const ensureUiTabs = (current: ExpandedGridNodeRuntime): ExpandedGridUiTab[] => {
    const existing = (current as unknown as Record<string, unknown>).uiTabs as ExpandedGridUiTab[] | undefined;
    if (existing && Array.isArray(existing) && existing.length) return existing;
    return [{ id: 'tab-1', label: 'Tab 1', icon: undefined, items: [{ id: 'item-1', label: 'Item 1', icon: undefined }] }];
  };

  const ensureUiSections = (current: ExpandedGridNodeRuntime): ExpandedGridUiSection[] => {
    const existing = (current as unknown as Record<string, unknown>).uiSections as ExpandedGridUiSection[] | undefined;
    if (existing && Array.isArray(existing) && existing.length) return existing;
    return [{ id: 'section-1', label: 'Section 1', icon: undefined, items: [{ id: 'item-1', label: 'Item 1', icon: undefined }] }];
  };

  const TEXT_VARIANTS: Array<{ value: ExpandedGridTextVariant; label: string }> = [
    { value: 'h1', label: 'H1' },
    { value: 'h2', label: 'H2' },
    { value: 'h3', label: 'H3' },
    { value: 'h4', label: 'H4' },
    { value: 'h5', label: 'H5' },
    { value: 'h6', label: 'H6' },
    { value: 'normal', label: 'Normal' },
    { value: 'small', label: 'Small' },
  ];

  const TEXT_ALIGNS: Array<{ value: ExpandedGridTextAlign; label: string }> = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Middle' },
    { value: 'right', label: 'Right' },
  ];

  const [uiModalStack, setUiModalStack] = useState<UiModal[]>([]);

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
        <ExpandedGridNodePanelMainAttrsEditor
          dataObjectId={selectedNode.dataObjectId}
          attributeIds={selectedNode.dataObjectAttributeIds || []}
          attributeMode={selectedNode.dataObjectAttributeMode}
          setUiModalStack={setUiModalStack}
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
              if ((nextType === 'tabs' || nextType === 'wizard' || nextType === 'sideNav' || nextType === 'dropdown') && !selectedNode.uiTabs) {
                nextPatch.uiTabs = ensureUiTabs(selectedNode);
              }
              if (nextType === 'collapsible' && !selectedNode.uiSections) {
                nextPatch.uiSections = ensureUiSections(selectedNode);
              }
              if (nextType === 'text') {
                nextPatch.textVariant = (selectedNode.textVariant || 'normal') as ExpandedGridTextVariant;
                nextPatch.textAlign = (selectedNode.textAlign || 'left') as ExpandedGridTextAlign;
              }
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

        {(() => {
          const currentType = selectedNode.uiType || 'content';

          if (
            currentType === 'tabs' ||
            currentType === 'wizard' ||
            currentType === 'sideNav' ||
            currentType === 'dropdown' ||
            currentType === 'collapsible'
          ) {
            return (
              <ExpandedGridNodePanelUiConfigEditor
                uiType={currentType as ExpandedGridUiType}
                uiTabs={(selectedNode.uiTabs || []) as ExpandedGridUiTab[]}
                uiSections={(selectedNode.uiSections || []) as ExpandedGridUiSection[]}
                setUiModalStack={setUiModalStack}
                onCommitUiTabs={(next) => commit({ uiTabs: next })}
                onCommitUiSections={(next) => commit({ uiSections: next })}
              />
            );
          }

          if (currentType === 'text') {
            return (
              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Text</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Variant</label>
                    <select
                      value={(selectedNode.textVariant || 'normal') as ExpandedGridTextVariant}
                      onChange={(e) => commit({ textVariant: e.target.value as ExpandedGridTextVariant })}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {TEXT_VARIANTS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">Align</label>
                    <select
                      value={(selectedNode.textAlign || 'left') as ExpandedGridTextAlign}
                      onChange={(e) => commit({ textAlign: e.target.value as ExpandedGridTextAlign })}
                      className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {TEXT_ALIGNS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-gray-500">
                  Uses the node’s “Text” field as the content.
                </div>
              </div>
            );
          }

          return null;
        })()}

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

      <ExpandedGridNodePanelUiModal
        uiModalStack={uiModalStack}
        setUiModalStack={setUiModalStack}
        objects={dataObjectStore.objects}
        childNodeLinkedObjects={childNodeLinkedObjects.map((o) => ({ id: o.id, name: o.name }))}
        currentUiTabs={(selectedNode.uiTabs || []) as ExpandedGridUiTab[]}
        currentUiSections={(selectedNode.uiSections || []) as ExpandedGridUiSection[]}
        onCommitUiTabs={(next) => commit({ uiTabs: next })}
        onCommitUiSections={(next) => commit({ uiSections: next })}
        onCommitMainAttrs={({ ids, mode }) => commit({ dataObjectAttributeIds: ids, dataObjectAttributeMode: mode })}
      />

      {/* Inline modal implementation moved to `components/expanded-grid-node-panel/ui-modal.tsx`.
          Kept here commented-out for easier diff review; safe to delete later.
      {uiModal ? (
        <div
          className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
          onMouseDown={(e) => {
            // click outside closes
            if (e.target === e.currentTarget) closeAllModals();
          }}
        >
          <div className="w-full max-w-[680px] max-h-[85vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {uiModalStack.length > 1 ? (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    Back
                  </button>
                ) : null}
                <div className="text-xs font-semibold text-gray-900 truncate">
                  {uiModal.kind === 'tab'
                    ? `${uiModal.mode === 'add' ? 'Add' : 'Edit'} ${uiModal.uiType === 'wizard' ? 'step' : uiModal.uiType === 'dropdown' ? 'section' : 'tab'}`
                    : uiModal.kind === 'tabItem'
                      ? `${uiModal.itemId ? 'Edit' : 'Add'} item`
                      : uiModal.kind === 'section'
                        ? `${uiModal.mode === 'add' ? 'Add' : 'Edit'} collapsible section`
                        : 'Edit item'}
                </div>
              </div>
              <button
                type="button"
                onClick={closeAllModals}
                className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(85vh-44px)]">
              {uiModal.kind === 'tab' ? (
                (() => {
                  const draft = uiModal.draft;
                  const setDraft = (patch: Partial<ExpandedGridUiTab>) =>
                    setUiModalStack((prev) => {
                      const next = [...prev];
                      const top = next[next.length - 1] as Extract<UiModal, { kind: 'tab' }>;
                      next[next.length - 1] = { ...top, draft: { ...top.draft, ...patch } };
                      return next;
                    });

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Icon</label>
                          <input
                            value={draft.icon || ''}
                            onChange={(e) => setDraft({ icon: e.target.value.trim() || undefined })}
                            placeholder="🙂"
                            className="mac-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Label</label>
                          <input
                            value={draft.label || ''}
                            onChange={(e) => setDraft({ label: e.target.value })}
                            placeholder="Tab label"
                            className="mac-field w-full"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Linked data object</label>
                        <DataObjectSearchSelect
                          className="w-full"
                          value={draft.dataObjectId || ''}
                          onChange={(nextId) =>
                            setDraft({
                              dataObjectId: nextId || undefined,
                              dataObjectAttributeIds: [],
                              dataObjectAttributeMode: 'data',
                            })
                          }
                          objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
                          placeholder="Link object…"
                          includeNoneOption={true}
                          noneLabel="No object"
                        />
                        {childNodeLinkedObjects.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {childNodeLinkedObjects.slice(0, 8).map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => setDraft({ dataObjectId: o.id, dataObjectAttributeIds: [] })}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                  draft.dataObjectId === o.id
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {o.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {draft.dataObjectId ? (
                          <>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <div className="col-span-2">
                                <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                  Attributes mode (applies to all selected)
                                </label>
                                <select
                                  value={(draft.dataObjectAttributeMode || 'data') as ExpandedGridAttributeRenderMode}
                                  onChange={(e) => setDraft({ dataObjectAttributeMode: e.target.value as ExpandedGridAttributeRenderMode })}
                                  className="mac-field w-full"
                                >
                                  <option value="data">Data only</option>
                                  <option value="input">Input form</option>
                                </select>
                              </div>
                            </div>
                            <DataObjectAttributeMultiSelect
                              objectId={draft.dataObjectId}
                              objects={dataObjectStore.objects}
                              value={draft.dataObjectAttributeIds || []}
                              onChange={(nextAttrs) => setDraft({ dataObjectAttributeIds: nextAttrs })}
                              label="Linked attributes"
                            />
                          </>
                        ) : null}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11px] font-medium text-gray-700">Items</div>
                          <button
                            type="button"
                            onClick={() => {
                              const newItem: UiItemDraft = {
                                id: makeId('item'),
                                label: `Item ${(draft.items || []).length + 1}`,
                                icon: undefined,
                                dataObjectId: undefined,
                                dataObjectAttributeIds: [],
                              };
                              setUiModalStack((prev) => [
                                ...prev,
                                { kind: 'tabItem', uiType: uiModal.uiType, tabId: draft.id, itemId: newItem.id, draft: newItem },
                              ]);
                            }}
                            className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Add item
                          </button>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
                          {(() => {
                            const safeItems = Array.isArray(draft.items)
                              ? (draft.items as unknown[]).filter(
                                  (x): x is NonNullable<ExpandedGridUiTab['items']>[number] =>
                                    !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string'
                                )
                              : [];
                            if (safeItems.length === 0) {
                              return <div className="p-2 text-[11px] text-gray-500">No items yet.</div>;
                            }
                            return (
                              <div className="divide-y divide-gray-100">
                                {safeItems.map((it) => (
                                  <div key={it.id} className="p-2 flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] text-gray-900 truncate">
                                        {it.icon ? <span className="mr-1">{it.icon}</span> : null}
                                        {it.label}
                                        {it.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                                      </div>
                                      {it.dataObjectAttributeIds?.length ? (
                                        <div className="text-[10px] text-gray-500">
                                          attrs: <span className="font-medium">{it.dataObjectAttributeIds.length}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const asDraft: UiItemDraft = {
                                          id: it.id,
                                          label: it.label,
                                          icon: it.icon,
                                          dataObjectId: (it as unknown as Record<string, unknown>).dataObjectId as string | undefined,
                                          dataObjectAttributeIds: (it as unknown as Record<string, unknown>).dataObjectAttributeIds as string[] | undefined,
                                          dataObjectAttributeMode: (it as unknown as Record<string, unknown>).dataObjectAttributeMode as ExpandedGridAttributeRenderMode | undefined,
                                        };
                                        setUiModalStack((prev) => [...prev, { kind: 'tabItem', uiType: uiModal.uiType, tabId: draft.id, itemId: it.id, draft: asDraft }]);
                                      }}
                                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDraft({ items: safeItems.filter((x) => x.id !== it.id) })}
                                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const current = selectedNode.uiTabs || [];
                            const normalized: ExpandedGridUiTab = {
                              ...draft,
                              label: (draft.label || '').trim() || 'Untitled',
                              items: [...(draft.items || [])],
                            };
                            const next =
                              uiModal.mode === 'add'
                                ? [...current, normalized]
                                : current.map((x) => (x.id === uiModal.tabId ? normalized : x));
                            commit({ uiTabs: next });
                            closeModal();
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : uiModal.kind === 'tabItem' ? (
                (() => {
                  const draft = uiModal.draft;
                  const setDraft = (patch: Partial<UiItemDraft>) =>
                    setUiModalStack((prev) => {
                      const next = [...prev];
                      const top = next[next.length - 1] as Extract<UiModal, { kind: 'tabItem' }>;
                      next[next.length - 1] = { ...top, draft: { ...top.draft, ...patch } };
                      return next;
                    });

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Icon</label>
                          <input value={draft.icon || ''} onChange={(e) => setDraft({ icon: e.target.value.trim() || undefined })} className="mac-field w-full" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Label</label>
                          <input value={draft.label || ''} onChange={(e) => setDraft({ label: e.target.value })} className="mac-field w-full" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Linked data object</label>
                        <DataObjectSearchSelect
                          className="w-full"
                          value={draft.dataObjectId || ''}
                          onChange={(nextId) =>
                            setDraft({
                              dataObjectId: nextId || undefined,
                              dataObjectAttributeIds: [],
                              dataObjectAttributeMode: 'data',
                            })
                          }
                          objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
                          placeholder="Link object…"
                          includeNoneOption={true}
                          noneLabel="No object"
                        />
                        {draft.dataObjectId ? (
                          <>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">
                              Attributes mode (applies to all selected)
                            </label>
                            <select
                              value={(draft.dataObjectAttributeMode || 'data') as ExpandedGridAttributeRenderMode}
                              onChange={(e) => setDraft({ dataObjectAttributeMode: e.target.value as ExpandedGridAttributeRenderMode })}
                              className="mac-field w-full"
                            >
                              <option value="data">Data only</option>
                              <option value="input">Input form</option>
                            </select>
                            <DataObjectAttributeMultiSelect
                              objectId={draft.dataObjectId}
                              objects={dataObjectStore.objects}
                              value={draft.dataObjectAttributeIds || []}
                              onChange={(nextAttrs) => setDraft({ dataObjectAttributeIds: nextAttrs })}
                              label="Linked attributes"
                            />
                          </>
                        ) : null}
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Update the parent tab draft (second-to-last in stack), not the doc yet.
                            setUiModalStack((prev) => {
                              if (prev.length < 2) return prev.slice(0, -1);
                              const next = [...prev];
                              const item = next[next.length - 1] as Extract<UiModal, { kind: 'tabItem' }>;
                              const parent = next[next.length - 2] as Extract<UiModal, { kind: 'tab' }>;
                              const items = Array.isArray(parent.draft.items)
                                ? (parent.draft.items as unknown[]).filter(
                                    (x): x is NonNullable<ExpandedGridUiTab['items']>[number] =>
                                      !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string'
                                  )
                                : [];
                              const normalized: UiItemDraft = {
                                ...item.draft,
                                label: (item.draft.label || '').trim() || 'Untitled',
                              };
                              const idx = items.findIndex((x) => x.id === item.itemId);
                              if (idx >= 0) {
                                items[idx] = normalized as unknown as ExpandedGridUiTab['items'][number];
                              } else {
                                items.push(normalized as unknown as ExpandedGridUiTab['items'][number]);
                              }
                              next[next.length - 2] = { ...parent, draft: { ...parent.draft, items } };
                              next.pop();
                              return next;
                            });
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save item
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : uiModal.kind === 'section' ? (
                (() => {
                  const draft = uiModal.draft;
                  const setDraft = (patch: Partial<ExpandedGridUiSection>) =>
                    setUiModalStack((prev) => {
                      const next = [...prev];
                      const top = next[next.length - 1] as Extract<UiModal, { kind: 'section' }>;
                      next[next.length - 1] = { ...top, draft: { ...top.draft, ...patch } };
                      return next;
                    });

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Icon</label>
                          <input value={draft.icon || ''} onChange={(e) => setDraft({ icon: e.target.value.trim() || undefined })} className="mac-field w-full" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Label</label>
                          <input value={draft.label || ''} onChange={(e) => setDraft({ label: e.target.value })} className="mac-field w-full" />
                        </div>
                      </div>

                      <label className="text-[11px] text-gray-700 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!draft.collapsedByDefault}
                          onChange={(e) => setDraft({ collapsedByDefault: e.target.checked })}
                        />
                        Collapsed by default
                      </label>

                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Linked data object</label>
                        <DataObjectSearchSelect
                          className="w-full"
                          value={draft.dataObjectId || ''}
                          onChange={(nextId) =>
                            setDraft({
                              dataObjectId: nextId || undefined,
                              dataObjectAttributeIds: [],
                              dataObjectAttributeMode: 'data',
                            })
                          }
                          objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
                          placeholder="Link object…"
                          includeNoneOption={true}
                          noneLabel="No object"
                        />
                        {childNodeLinkedObjects.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {childNodeLinkedObjects.slice(0, 8).map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => setDraft({ dataObjectId: o.id, dataObjectAttributeIds: [], dataObjectAttributeMode: 'data' })}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md border ${
                                  draft.dataObjectId === o.id
                                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {o.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {draft.dataObjectId ? (
                          <>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">
                              Attributes mode (applies to all selected)
                            </label>
                            <select
                              value={(draft.dataObjectAttributeMode || 'data') as ExpandedGridAttributeRenderMode}
                              onChange={(e) => setDraft({ dataObjectAttributeMode: e.target.value as ExpandedGridAttributeRenderMode })}
                              className="mac-field w-full"
                            >
                              <option value="data">Data only</option>
                              <option value="input">Input form</option>
                            </select>
                            <DataObjectAttributeMultiSelect
                              objectId={draft.dataObjectId}
                              objects={dataObjectStore.objects}
                              value={draft.dataObjectAttributeIds || []}
                              onChange={(nextAttrs) => setDraft({ dataObjectAttributeIds: nextAttrs })}
                              label="Linked attributes"
                            />
                          </>
                        ) : null}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11px] font-medium text-gray-700">Items</div>
                          <button
                            type="button"
                            onClick={() => {
                              const newItem: UiItemDraft = {
                                id: makeId('item'),
                                label: `Item ${(draft.items || []).length + 1}`,
                                icon: undefined,
                                dataObjectId: undefined,
                                dataObjectAttributeIds: [],
                              };
                              setUiModalStack((prev) => [
                                ...prev,
                                { kind: 'sectionItem', sectionId: draft.id, itemId: newItem.id, draft: newItem },
                              ]);
                            }}
                            className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Add item
                          </button>
                        </div>
                        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
                          {(() => {
                            const safeItems = Array.isArray(draft.items)
                              ? (draft.items as unknown[]).filter(
                                  (x): x is NonNullable<ExpandedGridUiSection['items']>[number] =>
                                    !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string'
                                )
                              : [];
                            if (safeItems.length === 0) {
                              return <div className="p-2 text-[11px] text-gray-500">No items yet.</div>;
                            }
                            return (
                              <div className="divide-y divide-gray-100">
                                {safeItems.map((it) => (
                                  <div key={it.id} className="p-2 flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] text-gray-900 truncate">
                                        {it.icon ? <span className="mr-1">{it.icon}</span> : null}
                                        {it.label}
                                        {it.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                                      </div>
                                      {it.dataObjectAttributeIds?.length ? (
                                        <div className="text-[10px] text-gray-500">
                                          attrs: <span className="font-medium">{it.dataObjectAttributeIds.length}</span>
                                        </div>
                                      ) : null}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const asDraft: UiItemDraft = {
                                          id: it.id,
                                          label: it.label,
                                          icon: it.icon,
                                          dataObjectId: (it as unknown as Record<string, unknown>).dataObjectId as string | undefined,
                                          dataObjectAttributeIds: (it as unknown as Record<string, unknown>).dataObjectAttributeIds as string[] | undefined,
                                          dataObjectAttributeMode: (it as unknown as Record<string, unknown>).dataObjectAttributeMode as ExpandedGridAttributeRenderMode | undefined,
                                        };
                                        setUiModalStack((prev) => [...prev, { kind: 'sectionItem', sectionId: draft.id, itemId: it.id, draft: asDraft }]);
                                      }}
                                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDraft({ items: safeItems.filter((x) => x.id !== it.id) })}
                                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const current = selectedNode.uiSections || [];
                            const normalized: ExpandedGridUiSection = {
                              ...draft,
                              label: (draft.label || '').trim() || 'Untitled',
                              items: [...(draft.items || [])],
                            };
                            const next =
                              uiModal.mode === 'add'
                                ? [...current, normalized]
                                : current.map((x) => (x.id === uiModal.sectionId ? normalized : x));
                            commit({ uiSections: next });
                            closeModal();
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : uiModal.kind === 'sectionItem' ? (
                (() => {
                  const draft = uiModal.draft;
                  const setDraft = (patch: Partial<UiItemDraft>) =>
                    setUiModalStack((prev) => {
                      const next = [...prev];
                      const top = next[next.length - 1] as Extract<UiModal, { kind: 'sectionItem' }>;
                      next[next.length - 1] = { ...top, draft: { ...top.draft, ...patch } };
                      return next;
                    });

                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Icon</label>
                          <input value={draft.icon || ''} onChange={(e) => setDraft({ icon: e.target.value.trim() || undefined })} className="mac-field w-full" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1">Label</label>
                          <input value={draft.label || ''} onChange={(e) => setDraft({ label: e.target.value })} className="mac-field w-full" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">Linked data object</label>
                        <DataObjectSearchSelect
                          className="w-full"
                          value={draft.dataObjectId || ''}
                          onChange={(nextId) =>
                            setDraft({
                              dataObjectId: nextId || undefined,
                              dataObjectAttributeIds: [],
                              dataObjectAttributeMode: 'data',
                            })
                          }
                          objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
                          placeholder="Link object…"
                          includeNoneOption={true}
                          noneLabel="No object"
                        />
                        {draft.dataObjectId ? (
                          <>
                            <label className="block text-[11px] font-medium text-gray-700 mb-1">
                              Attributes mode (applies to all selected)
                            </label>
                            <select
                              value={(draft.dataObjectAttributeMode || 'data') as ExpandedGridAttributeRenderMode}
                              onChange={(e) => setDraft({ dataObjectAttributeMode: e.target.value as ExpandedGridAttributeRenderMode })}
                              className="mac-field w-full"
                            >
                              <option value="data">Data only</option>
                              <option value="input">Input form</option>
                            </select>
                            <DataObjectAttributeMultiSelect
                              objectId={draft.dataObjectId}
                              objects={dataObjectStore.objects}
                              value={draft.dataObjectAttributeIds || []}
                              onChange={(nextAttrs) => setDraft({ dataObjectAttributeIds: nextAttrs })}
                              label="Linked attributes"
                            />
                          </>
                        ) : null}
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUiModalStack((prev) => {
                              if (prev.length < 2) return prev.slice(0, -1);
                              const next = [...prev];
                              const item = next[next.length - 1] as Extract<UiModal, { kind: 'sectionItem' }>;
                              const parent = next[next.length - 2] as Extract<UiModal, { kind: 'section' }>;
                              const items = Array.isArray(parent.draft.items)
                                ? (parent.draft.items as unknown[]).filter(
                                    (x): x is NonNullable<ExpandedGridUiSection['items']>[number] =>
                                      !!x && typeof x === 'object' && typeof (x as Record<string, unknown>).id === 'string'
                                  )
                                : [];
                              const normalized: UiItemDraft = {
                                ...item.draft,
                                label: (item.draft.label || '').trim() || 'Untitled',
                              };
                              const idx = items.findIndex((x) => x.id === item.itemId);
                              if (idx >= 0) items[idx] = normalized as unknown as ExpandedGridUiSection['items'][number];
                              else items.push(normalized as unknown as ExpandedGridUiSection['items'][number]);
                              next[next.length - 2] = { ...parent, draft: { ...parent.draft, items } };
                              next.pop();
                              return next;
                            });
                          }}
                          className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Save item
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : uiModal.kind === 'mainAttrs' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Attributes mode (applies to all selected)
                    </label>
                    <select
                      value={uiModal.mode}
                      onChange={(e) => {
                        const mode = e.target.value as ExpandedGridAttributeRenderMode;
                        setUiModalStack((prev) => {
                          const next = [...prev];
                          const top = next[next.length - 1] as Extract<UiModal, { kind: 'mainAttrs' }>;
                          next[next.length - 1] = { ...top, mode };
                          return next;
                        });
                      }}
                      className="mac-field w-full"
                    >
                      <option value="data">Data only</option>
                      <option value="input">Input form</option>
                    </select>
                  </div>
                  <DataObjectAttributeMultiSelect
                    objectId={uiModal.objectId}
                    objects={dataObjectStore.objects}
                    value={uiModal.value}
                    onChange={(nextAttrs) => {
                      setUiModalStack((prev) => {
                        const next = [...prev];
                        const top = next[next.length - 1] as Extract<UiModal, { kind: 'mainAttrs' }>;
                        next[next.length - 1] = { ...top, value: nextAttrs };
                        return next;
                      });
                    }}
                    label="Linked attributes"
                  />
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        commit({
                          dataObjectAttributeIds: uiModal.value,
                          dataObjectAttributeMode: uiModal.mode,
                        });
                        closeModal();
                      }}
                      className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      */}
    </div>
  );
}


