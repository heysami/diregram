'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X, Database, ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import type { NexusNode } from '@/types/nexus';
import { buildMergedDataObjectGraph, type DataObjectEdge } from '@/lib/data-object-graph';
import { createDataObject, deleteDataObjectAndCleanupReferences } from '@/lib/data-object-storage';

interface Props {
  doc: Y.Doc;
  roots: NexusNode[];
  onClose: () => void;
}

function edgeLabel(edge: DataObjectEdge): string {
  if (edge.kind === 'attribute') return `attribute · ${edge.cardinality || 'one'}`;
  return `relation · ${edge.cardinality || 'unknown'}`;
}

export function DataObjectsPanel({ doc, roots, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [graph, setGraph] = useState(() => buildMergedDataObjectGraph(doc, roots));

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setGraph(buildMergedDataObjectGraph(doc, roots));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, roots]);

  const objectById = useMemo(() => new Map(graph.objects.map((o) => [o.id, o])), [graph.objects]);

  const filteredObjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return graph.objects;
    return graph.objects.filter((o) => o.id.toLowerCase().includes(q) || (o.name || '').toLowerCase().includes(q));
  }, [graph.objects, query]);

  const effectiveSelectedId = selectedId && objectById.has(selectedId) ? selectedId : null;
  const selected = effectiveSelectedId ? objectById.get(effectiveSelectedId) || null : null;

  const outgoing = useMemo(
    () => (effectiveSelectedId ? graph.edges.filter((e) => e.fromId === effectiveSelectedId) : []),
    [graph.edges, effectiveSelectedId],
  );
  const incoming = useMemo(
    () => (effectiveSelectedId ? graph.edges.filter((e) => e.toId === effectiveSelectedId) : []),
    [graph.edges, effectiveSelectedId],
  );

  const outgoingAttributes = outgoing.filter((e) => e.kind === 'attribute');
  const outgoingRelations = outgoing.filter((e) => e.kind === 'relation');
  const incomingRelations = incoming.filter((e) => e.kind === 'relation');

  return (
    <div className="w-96 border-l bg-gray-50 p-4 flex flex-col shrink-0 overflow-y-auto relative">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-gray-500" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Data Objects</div>
            <div className="text-[11px] text-gray-600">
              {graph.objects.length} objects · {graph.edges.length} links (merged)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt('Data object name?', 'New object') || '';
              const obj = createDataObject(doc, name);
              setSelectedId(obj.id);
            }}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
            title="New data object"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              const id = (effectiveSelectedId || '').trim();
              if (!id) return;
              const ok = window.confirm(
                `Delete data object "${id}"?\n\nThis will also remove any node/expanded-grid links to it.`,
              );
              if (!ok) return;
              deleteDataObjectAndCleanupReferences(doc, id);
              setSelectedId(null);
            }}
            className={`p-1.5 rounded-md hover:bg-gray-100 ${effectiveSelectedId ? 'text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}
            title={effectiveSelectedId ? 'Delete selected data object' : 'Select an object to delete'}
            disabled={!effectiveSelectedId}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or id…"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 min-h-0 flex-1">
        <div className="min-h-0">
          <div className="text-[11px] font-semibold text-gray-600 mb-2">Objects</div>
          <div className="space-y-1 overflow-y-auto pr-1 max-h-[55vh]">
            {filteredObjects.map((o) => {
              const isSelected = selectedId === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left px-2 py-1.5 rounded border text-[11px] ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                  title={o.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-medium">{o.name || o.id}</span>
                      <span className="text-[10px] text-gray-500"> · {o.id}</span>
                    </div>
                    {o.missing ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                        missing
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {filteredObjects.length === 0 && <div className="text-[11px] text-gray-500">No matches.</div>}
          </div>
        </div>

        <div className="min-h-0">
          <div className="text-[11px] font-semibold text-gray-600 mb-2">Details</div>

          {!selected ? (
            <div className="text-[11px] text-gray-500">Select an object to view attributes & relationships.</div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded p-2">
                <div className="text-xs font-semibold text-gray-800 truncate">{selected.name}</div>
                <div className="text-[11px] text-gray-500">{selected.id}</div>
              </div>

              <details className="bg-white border border-gray-200 rounded">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-gray-700 flex items-center justify-between">
                  Attributes <span className="text-[10px] text-gray-500">{outgoingAttributes.length}</span>
                </summary>
                <div className="px-2 pb-2 space-y-1">
                  {outgoingAttributes.map((e, idx) => {
                    const to = objectById.get(e.toId);
                    return (
                      <div key={`${e.fromId}-${e.toId}-${idx}`} className="text-[11px] text-gray-700 flex items-center gap-2">
                        <ArrowRightLeft size={12} className="text-gray-400" />
                        <div className="truncate">
                          <span className="font-medium">{to?.name || e.toId}</span>
                          <span className="text-[10px] text-gray-500"> · {e.toId}</span>
                        </div>
                      </div>
                    );
                  })}
                  {outgoingAttributes.length === 0 && <div className="text-[11px] text-gray-500">None.</div>}
                </div>
              </details>

              <details className="bg-white border border-gray-200 rounded" open>
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-gray-700 flex items-center justify-between">
                  Outgoing relationships <span className="text-[10px] text-gray-500">{outgoingRelations.length}</span>
                </summary>
                <div className="px-2 pb-2 space-y-1">
                  {outgoingRelations.map((e, idx) => {
                    const to = objectById.get(e.toId);
                    return (
                      <div key={`${e.fromId}-${e.toId}-${idx}`} className="text-[11px] text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            {edgeLabel(e)}
                          </span>
                          <div className="truncate">
                            <span className="font-medium">{to?.name || e.toId}</span>
                            <span className="text-[10px] text-gray-500"> · {e.toId}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {outgoingRelations.length === 0 && <div className="text-[11px] text-gray-500">None.</div>}
                </div>
              </details>

              <details className="bg-white border border-gray-200 rounded">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-gray-700 flex items-center justify-between">
                  Incoming relationships <span className="text-[10px] text-gray-500">{incomingRelations.length}</span>
                </summary>
                <div className="px-2 pb-2 space-y-1">
                  {incomingRelations.map((e, idx) => {
                    const from = objectById.get(e.fromId);
                    return (
                      <div key={`${e.fromId}-${e.toId}-${idx}`} className="text-[11px] text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            {edgeLabel(e)}
                          </span>
                          <div className="truncate">
                            <span className="font-medium">{from?.name || e.fromId}</span>
                            <span className="text-[10px] text-gray-500"> · {e.fromId}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {incomingRelations.length === 0 && <div className="text-[11px] text-gray-500">None.</div>}
                </div>
              </details>

              <details className="bg-white border border-gray-200 rounded">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-gray-700 flex items-center justify-between">
                  Raw JSON <span className="text-[10px] text-gray-500">view</span>
                </summary>
                <div className="px-2 pb-2">
                  <pre className="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-48">
                    {JSON.stringify(selected.data ?? {}, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 text-[10px] text-gray-500">
        Links are derived from node assignments + expanded grid metadata.
      </div>
    </div>
  );
}

