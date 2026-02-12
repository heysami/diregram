import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import type { NexusNode } from '@/types/nexus';
import { bulkConvertNodesToDataObjects } from '@/lib/bulk-convert-nodes-to-data-objects';
import { bulkDeleteNodes } from '@/lib/bulk-delete-nodes';
import { bulkAddTag, bulkRemoveTag, bulkSetTags } from '@/lib/node-tags';
import { bulkSetUiTypeTag, type UiTypeTagValue } from '@/lib/ui-type-tags';
import { createTag, loadTagStore, type NexusTag, type NexusTagGroup, type NexusTagStore } from '@/lib/tag-store';

interface Props {
  doc: Y.Doc;
  selectedNodeIds: string[];
  nodeMap: Map<string, NexusNode>;
  onClose: () => void;
}

export function MainNodeMultiSelectPanel({ doc, selectedNodeIds, nodeMap, onClose }: Props) {
  const selectedNodes = useMemo(() => {
    const nodes: NexusNode[] = [];
    selectedNodeIds.forEach((id) => {
      const n = nodeMap.get(id);
      if (n) nodes.push(n);
    });
    return nodes;
  }, [nodeMap, selectedNodeIds]);

  const alreadyLinkedCount = useMemo(() => selectedNodes.filter((n) => !!n.dataObjectId).length, [selectedNodes]);
  const blockedDeleteNodes = useMemo(() => selectedNodes.filter((n) => n.children.length > 0), [selectedNodes]);
  const canDeleteAll = selectedNodes.length > 0 && blockedDeleteNodes.length === 0;

  const [tagStore, setTagStore] = useState<NexusTagStore>(() => loadTagStore(doc));
  const [tagMode, setTagMode] = useState<'assign' | 'remove' | 'set'>('assign');
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [tagSet, setTagSet] = useState<Set<string>>(() => new Set());
  const [uiType, setUiType] = useState<UiTypeTagValue | ''>('');

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setTagStore(loadTagStore(doc));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  const tagGroups: NexusTagGroup[] = useMemo(() => {
    return [...tagStore.groups];
  }, [tagStore.groups]);

  const flatTags = useMemo(() => {
    const groupNameById = new Map(tagGroups.map((g) => [g.id, g.name]));
    return tagStore.tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        groupId: t.groupId,
        groupName: groupNameById.get(t.groupId) || t.groupId,
      }))
      .sort((a, b) => (a.name.localeCompare(b.name) || a.groupName.localeCompare(b.groupName)));
  }, [tagStore.tags, tagGroups]);

  const filteredTagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return flatTags.slice(0, 8);
    return flatTags
      .filter((t) => t.name.toLowerCase().includes(q) || `${t.groupName}/${t.name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [flatTags, tagInput]);

  const exactMatchTagId = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return null;
    const matches = flatTags.filter((t) => t.name.trim().toLowerCase() === q);
    if (matches.length === 1) return matches[0].id;
    return null;
  }, [flatTags, tagInput]);

  const tagById = useMemo(() => new Map(tagStore.tags.map((t) => [t.id, t])), [tagStore.tags]);

  const convertSelectedToDataObjects = () => {
    bulkConvertNodesToDataObjects(doc, selectedNodes);
  };

  const deleteSelected = () => {
    if (!canDeleteAll) return;
    bulkDeleteNodes(doc, selectedNodes);
    onClose();
  };

  return (
    <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Selection</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onClose} className="mac-btn" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">

      <div className="mb-4 text-xs text-gray-700">
        Selected: <span className="font-medium">{selectedNodes.length}</span>
        {alreadyLinkedCount > 0 && (
          <span className="text-[11px] text-gray-500"> · already linked: {alreadyLinkedCount}</span>
        )}
      </div>

      <div className="space-y-2">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="text-[11px] font-semibold text-gray-700 mb-2">UI type</div>
          <div className="flex items-center gap-2">
            <select
              className="flex-1 h-8 rounded-md border border-gray-300 bg-white px-2 text-[11px] text-gray-700"
              value={uiType}
              onChange={(e) => setUiType(e.target.value as UiTypeTagValue | '')}
            >
              <option value="">None</option>
              <option value="view-item">view item</option>
              <option value="list">list</option>
              <option value="form">form</option>
              <option value="popup">pop up</option>
            </select>
            <button
              type="button"
              onClick={() => bulkSetUiTypeTag(doc, selectedNodes, uiType ? (uiType as UiTypeTagValue) : null)}
              className="h-8 px-3 rounded-md border border-gray-200 bg-white text-[11px] text-gray-700 hover:bg-gray-50"
              title="Apply UI type to selected nodes"
            >
              Apply
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={deleteSelected}
          disabled={!canDeleteAll}
          className={`w-full text-[11px] px-3 py-2 rounded-md border ${
            canDeleteAll ? 'border-red-200 text-red-700 hover:bg-red-50 bg-white' : 'border-gray-200 text-gray-400 bg-gray-50'
          }`}
        >
          Delete selected
        </button>

        {!canDeleteAll && blockedDeleteNodes.length > 0 && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            Some selected nodes can’t be deleted because they have children. Remove/move their children first.
          </div>
        )}

        <button
          type="button"
          onClick={convertSelectedToDataObjects}
          disabled={selectedNodes.length === 0}
          className="w-full text-[11px] px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Convert to data object (reuse by name)
        </button>

        <div className="text-[10px] text-gray-500">
          Uses each selected node’s text as the data object name. If a data object with the same name already exists, it links instead of creating.
        </div>

        <details className="mt-3 bg-white border border-gray-200 rounded">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-gray-700 flex items-center justify-between">
            Tags <span className="text-[10px] text-gray-500">assign / remove / set</span>
          </summary>
          <div className="px-2 pb-2">
            <div className="mt-2 flex items-center gap-1">
              {(['assign', 'remove', 'set'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTagMode(m)}
                  className={`text-[11px] px-2 py-1 rounded-md border ${
                    tagMode === m ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m === 'assign' ? 'Assign' : m === 'remove' ? 'Remove' : 'Set'}
                </button>
              ))}
            </div>

            {/* Shared autocomplete input */}
            <div className="mt-2 relative">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  setTagSuggestionIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setTagSuggestionIndex((i) => Math.min(i + 1, Math.max(filteredTagSuggestions.length - 1, 0)));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setTagSuggestionIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Escape') {
                    setTagInput('');
                    return;
                  }
                  if (e.key !== 'Enter') return;
                  e.preventDefault();

                  const pick = filteredTagSuggestions[tagSuggestionIndex];
                  const tagId = exactMatchTagId || pick?.id || null;

                  if (tagMode === 'remove') {
                    if (!tagId) return;
                    bulkRemoveTag(doc, selectedNodes, tagId);
                    setTagInput('');
                    return;
                  }

                  if (tagMode === 'assign') {
                    if (tagId) {
                      bulkAddTag(doc, selectedNodes, tagId);
                      setTagInput('');
                      return;
                    }
                    const created = createTag(doc, 'tg-ungrouped', tagInput);
                    if (!created) return;
                    bulkAddTag(doc, selectedNodes, created.id);
                    setTagInput('');
                    return;
                  }

                  // tagMode === 'set' -> add to the pending set
                  if (tagId) {
                    setTagSet((prev) => new Set(prev).add(tagId));
                    setTagInput('');
                    return;
                  }
                  const created = createTag(doc, 'tg-ungrouped', tagInput);
                  if (!created) return;
                  setTagSet((prev) => new Set(prev).add(created.id));
                  setTagInput('');
                }}
                placeholder={
                  tagMode === 'assign'
                    ? 'Assign tag… (Enter adds/creates)'
                    : tagMode === 'remove'
                      ? 'Remove tag… (Enter removes)'
                      : 'Add tag to set… (Enter adds/creates)'
                }
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {filteredTagSuggestions.length > 0 && tagInput.trim().length > 0 ? (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
                  {filteredTagSuggestions.map((t, idx) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (tagMode === 'remove') {
                          bulkRemoveTag(doc, selectedNodes, t.id);
                        } else if (tagMode === 'assign') {
                          bulkAddTag(doc, selectedNodes, t.id);
                        } else {
                          setTagSet((prev) => new Set(prev).add(t.id));
                        }
                        setTagInput('');
                      }}
                      className={`w-full text-left px-2 py-1 text-[11px] ${
                        idx === tagSuggestionIndex ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                      title={t.id}
                    >
                      <span className="font-medium">{t.name}</span> <span className="text-gray-400">· {t.groupName}</span>
                    </button>
                  ))}
                  {tagMode !== 'remove' && !exactMatchTagId ? (
                    <div className="px-2 py-1 text-[10px] text-gray-500 border-t border-gray-100">
                      Press Enter to create <span className="font-medium">“{tagInput.trim()}”</span> in <span className="font-medium">ungrouped</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Set mode UI */}
            {tagMode === 'set' ? (
              <div className="mt-2">
                {tagSet.size > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {Array.from(tagSet)
                      .slice()
                      .sort((a, b) => a.localeCompare(b))
                      .map((id) => {
                        const t = tagById.get(id);
                        const label = t ? t.name : id;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] bg-white border-gray-200 text-gray-700">
                            <span className="truncate max-w-[160px]">{label}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setTagSet((prev) => {
                                  const next = new Set(prev);
                                  next.delete(id);
                                  return next;
                                })
                              }
                              className="text-gray-400 hover:text-gray-700"
                              title="Remove from set"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500">No tags selected for the set yet.</div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedNodes.length === 0}
                    onClick={() => bulkSetTags(doc, selectedNodes, Array.from(tagSet))}
                    className="text-[11px] px-2 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Apply set
                  </button>
                  <button
                    type="button"
                    disabled={tagSet.size === 0}
                    onClick={() => setTagSet(new Set())}
                    className="text-[11px] px-2 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Clear set
                  </button>
                  <button
                    type="button"
                    disabled={selectedNodes.length === 0}
                    onClick={() => bulkSetTags(doc, selectedNodes, [])}
                    className="text-[11px] px-2 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    title="Remove all tags from all selected nodes"
                  >
                    Remove all
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[10px] text-gray-500">
                {tagMode === 'assign'
                  ? 'Enter adds the tag to all selected nodes (creates it in ungrouped if missing).'
                  : 'Enter removes the tag from all selected nodes.'}
              </div>
            )}
          </div>
        </details>

        <div className="mt-3">
          <div className="text-[11px] font-medium text-gray-600 mb-1">Selected nodes</div>
          <div className="space-y-1">
            {selectedNodes.slice(0, 10).map((n) => (
              <div key={n.id} className="text-[11px] text-gray-700 truncate">
                {n.content}
                {n.dataObjectId ? <span className="text-[10px] text-gray-500"> · {n.dataObjectId}</span> : null}
              </div>
            ))}
            {selectedNodes.length > 10 && (
              <div className="text-[10px] text-gray-500">…and {selectedNodes.length - 10} more</div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

