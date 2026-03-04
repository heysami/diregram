'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { ensureOpenAiApiKeyWithPrompt } from '@/lib/openai-key-browser';
import { sha256Hex } from '@/lib/diagram-ai-assist-client';

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
  fileId,
  projectFolderId,
  aiFeaturesEnabled = false,
  onTrackAsyncJob,
  graph,
  store,
  selectedId,
  onClose,
  onSelectId,
  onCreateNew,
  onDelete,
}: {
  doc: Y.Doc;
  fileId?: string | null;
  projectFolderId?: string | null;
  aiFeaturesEnabled?: boolean;
  onTrackAsyncJob?: (input: { id: string; kind: string; title?: string }) => void;
  graph: DataObjectGraph;
  store: NexusDataObjectStore;
  selectedId: string;
  onClose: () => void;
  onSelectId: (id: string) => void;
  onCreateNew?: () => void;
  onDelete?: (id: string) => void;
}) {
  // Remount the inner panel on selection changes to avoid setState-in-effect patterns.
  return (
    <DataObjectInspectorPanelInner
      key={selectedId}
      doc={doc}
      fileId={fileId || null}
      projectFolderId={projectFolderId || null}
      aiFeaturesEnabled={aiFeaturesEnabled}
      onTrackAsyncJob={onTrackAsyncJob}
      graph={graph}
      store={store}
      selectedId={selectedId}
      onClose={onClose}
      onSelectId={onSelectId}
      onCreateNew={onCreateNew}
      onDelete={onDelete}
    />
  );
}

function DataObjectInspectorPanelInner({
  doc,
  fileId,
  projectFolderId,
  aiFeaturesEnabled,
  onTrackAsyncJob,
  graph,
  store,
  selectedId,
  onClose,
  onSelectId,
  onCreateNew,
  onDelete,
}: {
  doc: Y.Doc;
  fileId: string | null;
  projectFolderId: string | null;
  aiFeaturesEnabled: boolean;
  onTrackAsyncJob?: (input: { id: string; kind: string; title?: string }) => void;
  graph: DataObjectGraph;
  store: NexusDataObjectStore;
  selectedId: string;
  onClose: () => void;
  onSelectId: (id: string) => void;
  onCreateNew?: () => void;
  onDelete?: (id: string) => void;
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const queueDiagramAssist = useCallback(
    async (input: { action: 'data_object_attributes' | 'status_descriptions'; selection: Record<string, unknown>; title: string }) => {
      if (!aiFeaturesEnabled || !fileId || !projectFolderId) {
        setAiError('Diagram AI is available only for synced Supabase projects.');
        return;
      }
      setAiBusy(true);
      setAiError(null);
      try {
        const openaiApiKey = await ensureOpenAiApiKeyWithPrompt();
        if (!openaiApiKey) {
          setAiError('Missing OpenAI API key.');
          return;
        }
        const res = await fetch('/api/ai/diagram-assist/execute', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-openai-api-key': openaiApiKey,
          },
          body: JSON.stringify({
            projectFolderId,
            fileId,
            action: input.action,
            selection: input.selection,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          setAiError(String(json.error || `Failed (${res.status})`));
          return;
        }
        const jobId = String(json.jobId || '').trim();
        if (!jobId) {
          setAiError('Missing async job id');
          return;
        }
        onTrackAsyncJob?.({ id: jobId, kind: 'ai_diagram_assist', title: input.title });
      } catch (e) {
        setAiError(e instanceof Error ? e.message : 'Failed to queue Diagram AI job');
      } finally {
        setAiBusy(false);
      }
    },
    [aiFeaturesEnabled, fileId, onTrackAsyncJob, projectFolderId],
  );

  const queueAttributeResearch = useCallback(async () => {
    const markdown = doc.getText('nexus').toString();
    const baseFileHash = await sha256Hex(markdown);
    await queueDiagramAssist({
      action: 'data_object_attributes',
      title: `Diagram AI: attributes (${objLabel})`,
      selection: {
        baseFileHash,
        targetObjectId: selectedId,
        targetObjectName: objLabel,
        triggerSource: 'data_object_inspector',
        linkedObjectIds: linkedIds,
        linkedObjectNames: linkedIds.map((id) => linkedById.get(id)?.name || id),
        existingAttributes: attrsDraft.map((a) => ({
          name: a.name,
          type: a.type === 'status' ? 'status' : 'text',
          sample: a.sample || '',
          values: a.type === 'status' ? a.values || [] : [],
        })),
      },
    });
  }, [attrsDraft, doc, linkedById, linkedIds, objLabel, queueDiagramAssist, selectedId]);

  const queueStatusGenerateBoth = useCallback(
    async (attr: DataObjectAttribute) => {
      if (attr.type !== 'status') return;
      const markdown = doc.getText('nexus').toString();
      const baseFileHash = await sha256Hex(markdown);
      await queueDiagramAssist({
        action: 'status_descriptions',
        title: `Diagram AI: status (${objLabel} / ${attr.name})`,
        selection: {
          baseFileHash,
          target: {
            kind: 'data_object_status',
            doId: selectedId,
            doName: objLabel,
            attrId: attr.id,
            attrName: attr.name,
            statusValues: attr.values || [],
          },
        },
      });
    },
    [doc, objLabel, queueDiagramAssist, selectedId],
  );

  return (
    <div
      className="absolute top-4 right-4 z-30 mac-window overflow-hidden w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col"
      data-safe-panel="right"
      data-safe-panel-view="dataObjects"
    >
      <div className="mac-titlebar">
        <div className="mac-title">Data Object</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <div className="flex items-center gap-1">
            {onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(selectedId)}
                className="mac-btn mac-btn--icon-sm"
                title="Delete data object"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="mac-btn mac-btn--icon-sm" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
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
                    className="w-full text-left px-2 py-1 mac-interactive-row"
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="mac-btn h-7 px-2"
                disabled={!aiFeaturesEnabled || !fileId || !projectFolderId || aiBusy}
                title={!aiFeaturesEnabled || !fileId || !projectFolderId ? 'Available only in synced Supabase projects.' : 'Research required attributes with RAG + web.'}
                onClick={() => void queueAttributeResearch()}
              >
                {aiBusy ? 'Queueing…' : 'AI Research'}
              </button>
              <button
                type="button"
                className="mac-btn h-7 px-2 inline-flex items-center gap-1"
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
          </div>
          {aiError ? <div className="mt-2 text-[11px] text-red-700">{aiError}</div> : null}

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
                    className="mac-btn mac-btn--icon-sm"
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
                        disabled={!aiFeaturesEnabled || !fileId || !projectFolderId || aiBusy}
                        title={!aiFeaturesEnabled || !fileId || !projectFolderId ? 'Available only in synced Supabase projects.' : 'Generate both flow and table with AI.'}
                        onClick={() => void queueStatusGenerateBoth(a)}
                      >
                        Generate both
                      </button>
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
      </div>

      {doAttrDesc.modals}
    </div>
  );
}
