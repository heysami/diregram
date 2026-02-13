'use client';

import { useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X, Plus, Trash2 } from 'lucide-react';
import type { DataObjectEdge, DataObjectGraph } from '@/lib/data-object-graph';
import type { NexusDataObjectStore } from '@/lib/data-object-storage';
import { ensureDataObject, upsertDataObject } from '@/lib/data-object-storage';
import {
  loadDataObjectAttributes,
  newDataObjectAttributeId,
  upsertDataObjectAttributes,
  type DataObjectAttribute,
  type DataObjectAttributeType,
} from '@/lib/data-object-attributes';
import { StatusValuesEditor } from '@/components/data-objects/StatusValuesEditor';
import { useDataObjectAttributeDescriptionModals } from '@/hooks/use-data-object-attribute-description-modals';

function edgeLabel(e: DataObjectEdge): string {
  if (e.kind === 'attribute') return 'attribute (1:1)';
  const c = e.cardinality || 'unknown';
  if (c === 'one') return 'relation (1:1)';
  if (c === 'oneToMany') return 'relation (1:many)';
  if (c === 'manyToMany') return 'relation (many:many)';
  return 'relation (unknown)';
}

export function DataObjectInspectorPanel({
  doc,
  graph,
  store,
  selectedId,
  onClose,
  onSelectId,
}: {
  doc: Y.Doc;
  graph: DataObjectGraph;
  store: NexusDataObjectStore;
  selectedId: string;
  onClose: () => void;
  onSelectId: (id: string) => void;
}) {
  // Remount the inner panel on selection changes to avoid setState-in-effect patterns.
  return (
    <DataObjectInspectorPanelInner
      key={selectedId}
      doc={doc}
      graph={graph}
      store={store}
      selectedId={selectedId}
      onClose={onClose}
      onSelectId={onSelectId}
    />
  );
}

function DataObjectInspectorPanelInner({
  doc,
  graph,
  store,
  selectedId,
  onClose,
  onSelectId,
}: {
  doc: Y.Doc;
  graph: DataObjectGraph;
  store: NexusDataObjectStore;
  selectedId: string;
  onClose: () => void;
  onSelectId: (id: string) => void;
}) {
  const graphNode = useMemo(() => graph.objects.find((o) => o.id === selectedId), [graph.objects, selectedId]);
  const existing = useMemo(() => store.objects.find((o) => o.id === selectedId), [store.objects, selectedId]);
  const isMissing = !existing;

  const [nameDraft, setNameDraft] = useState(existing?.name || graphNode?.name || selectedId);
  const [attrsDraft, setAttrsDraft] = useState<DataObjectAttribute[]>(() => loadDataObjectAttributes(existing?.data));
  const doAttrDesc = useDataObjectAttributeDescriptionModals({ doc });

  const directEdges = useMemo(
    () => graph.edges.filter((e) => e.fromId === selectedId || e.toId === selectedId),
    [graph.edges, selectedId],
  );

  const linkedIds = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    directEdges.forEach((e) => {
      const other = e.fromId === selectedId ? e.toId : e.fromId;
      if (seen.has(other)) return;
      seen.add(other);
      out.push(other);
    });
    return out;
  }, [directEdges, selectedId]);

  const linkedById = useMemo(() => {
    const map = new Map(graph.objects.map((o) => [o.id, o]));
    return map;
  }, [graph.objects]);

  const commitName = () => {
    const nextName = nameDraft.trim();
    if (!nextName) return;
    const obj = ensureDataObject(doc, selectedId, nextName);
    if (obj.name === nextName) return;
    upsertDataObject(doc, { ...obj, name: nextName });
  };

  const commitAttrs = (nextAttrs: DataObjectAttribute[]) => {
    const obj = ensureDataObject(doc, selectedId, nameDraft.trim() || selectedId);
    const nextData = upsertDataObjectAttributes(obj.data, nextAttrs);
    upsertDataObject(doc, { ...obj, data: nextData });
  };

  const objLabel = (existing?.name || graphNode?.name || nameDraft || selectedId).trim() || selectedId;

  return (
    <div
      className="absolute top-4 right-4 z-30 mac-window overflow-hidden w-[360px] max-w-[calc(100vw-2rem)]"
      data-safe-panel="right"
      data-safe-panel-view="dataObjects"
    >
      <div className="mac-titlebar">
        <div className="mac-title">Data Object</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onClose} className="mac-btn" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-[11px] text-gray-500">ID</div>
        <div className="text-xs font-mono text-gray-800 truncate">{selectedId}</div>
        {isMissing ? <div className="mt-1 text-[11px] text-red-700">Referenced but missing — create by editing & saving.</div> : null}

        <div className="mt-3 text-[11px] text-gray-500">Name</div>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setNameDraft(existing?.name || graphNode?.name || selectedId);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="mac-field mt-1 w-full"
          placeholder="Name…"
        />
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-500">Linked objects</div>
          <div className="text-[11px] text-gray-400">{directEdges.length} link(s)</div>
        </div>

        {linkedIds.length ? (
          <div className="mt-2 space-y-1">
            {linkedIds.map((id) => {
              const node = linkedById.get(id);
              const label = node?.name || id;
              const forEdge = directEdges.find((e) => (e.fromId === selectedId && e.toId === id) || (e.toId === selectedId && e.fromId === id));
              return (
                <button
                  key={id}
                  type="button"
                  className="w-full text-left px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                  onClick={() => onSelectId(id)}
                >
                  <div className="text-xs font-medium text-slate-900 truncate">{label}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {id}
                    {forEdge ? ` · ${edgeLabel(forEdge)}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 text-xs text-gray-500">No linked objects.</div>
        )}
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-500">Attributes</div>
          <button
            type="button"
            className="h-7 px-2 rounded-md border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
            onClick={() => {
              const next = [...attrsDraft, { id: newDataObjectAttributeId(), name: 'NewAttribute', sample: '' }];
              setAttrsDraft(next);
              commitAttrs(next);
            }}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {attrsDraft.length ? (
          <div className="mt-2 space-y-2">
            {attrsDraft.map((a, idx) => (
              <div key={a.id} className="rounded-md border border-slate-200 p-2 bg-white">
                <div className="flex items-center gap-2">
                  <input
                    value={a.name}
                    onChange={(e) => {
                      const next = attrsDraft.slice();
                      next[idx] = { ...a, name: e.target.value };
                      setAttrsDraft(next);
                    }}
                    onBlur={() => commitAttrs(attrsDraft)}
                    className="mac-field flex-1"
                    placeholder="Attribute name…"
                  />
                  <button
                    type="button"
                    className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
                    title="Remove attribute"
                    onClick={() => {
                      const next = attrsDraft.filter((x) => x.id !== a.id);
                      setAttrsDraft(next);
                      commitAttrs(next);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Type</div>
                    <select
                      value={(a.type || 'text') as DataObjectAttributeType}
                      onChange={(e) => {
                        const t = e.target.value as DataObjectAttributeType;
                        const next = attrsDraft.slice();
                        const prev = next[idx];
                        if (t === 'status') {
                          const prevSample = prev.sample || '';
                          const prevValues = prev.type === 'status' ? prev.values || [] : [];
                          next[idx] = {
                            id: prev.id,
                            name: prev.name,
                            type: 'status',
                            values: prevValues,
                            sample: prevSample || undefined,
                          } satisfies DataObjectAttribute;
                        } else {
                          next[idx] = {
                            id: prev.id,
                            name: prev.name,
                            type: 'text',
                            sample: prev.sample || '',
                          } satisfies DataObjectAttribute;
                        }
                        setAttrsDraft(next);
                        commitAttrs(next);
                      }}
                      className="mac-field w-full"
                    >
                      <option value="text">Text</option>
                      <option value="status">Status</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Sample value</div>
                    <input
                      value={a.sample || ''}
                      onChange={(e) => {
                        const next = attrsDraft.slice();
                        next[idx] = { ...a, sample: e.target.value };
                        setAttrsDraft(next);
                      }}
                      onBlur={() => commitAttrs(attrsDraft)}
                      className="mac-field w-full"
                      placeholder={'e.g. 123, "pending", 2026-01-01…'}
                      disabled={a.type === 'status'}
                    />
                  </div>
                </div>

                {a.type === 'status' ? (
                  <div className="mt-2">
                    <div className="text-[11px] text-gray-500 mb-1">Values</div>
                    <StatusValuesEditor
                      values={a.values || []}
                      onChange={(nextValues) => {
                        const next = attrsDraft.slice();
                        const cur = next[idx];
                        if (!cur || cur.type !== 'status') return;
                        next[idx] = { ...cur, values: nextValues };
                        setAttrsDraft(next);
                        commitAttrs(next);
                      }}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">Describe this status:</span>
                      <button
                        type="button"
                        className="mac-btn px-2 py-1 text-[10px]"
                        onClick={() =>
                          doAttrDesc.openTable({
                            doId: selectedId,
                            doName: objLabel,
                            attrId: a.id,
                            attrName: a.name,
                            values: a.values || [],
                          })
                        }
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        className="mac-btn px-2 py-1 text-[10px]"
                        onClick={() =>
                          doAttrDesc.openFlow({
                            doId: selectedId,
                            doName: objLabel,
                            attrId: a.id,
                            attrName: a.name,
                            values: a.values || [],
                          })
                        }
                      >
                        Flow
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-gray-500">No attributes yet.</div>
        )}
      </div>

      {doAttrDesc.modals}
    </div>
  );
}

