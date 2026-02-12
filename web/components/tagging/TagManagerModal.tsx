import { GripVertical, Plus, Trash2, X } from 'lucide-react';
import * as Y from 'yjs';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTagStore } from '@/hooks/use-tag-store';
import {
  createTag,
  createTagGroup,
  deleteTag,
  deleteTagGroup,
  moveTagToGroup,
  reorderTagGroups,
  renameTag,
  renameTagGroup,
  type NexusTag,
  type NexusTagGroup,
} from '@/lib/tag-store';

type Props = {
  doc: Y.Doc;
  isOpen: boolean;
  onClose: () => void;
};

export function TagManagerModal({ doc, isOpen, onClose }: Props) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const tagStore = useTagStore(doc);
  const tagGroups: NexusTagGroup[] = useMemo(() => [...tagStore.groups], [tagStore.groups]);

  const tagsByGroup = useMemo(() => {
    const map = new Map<string, NexusTag[]>();
    tagStore.tags.forEach((t) => {
      const arr = map.get(t.groupId) || [];
      arr.push(t);
      map.set(t.groupId, arr);
    });
    map.forEach((arr, gid) => {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      map.set(gid, arr);
    });
    return map;
  }, [tagStore.tags]);

  const [tagManagerNewGroupName, setTagManagerNewGroupName] = useState('');
  const [tagManagerNewTagNameByGroup, setTagManagerNewTagNameByGroup] = useState<Record<string, string>>({});
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dragOverGroupColumnId, setDragOverGroupColumnId] = useState<string | null>(null);

  useEffect(() => {
    setDragOverGroupId(null);
    setDragOverGroupColumnId(null);
  }, [tagStore.groups]);

  if (!isClient || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close tag manager" />
      <div className="relative w-[860px] max-w-[95vw] max-h-[85vh] overflow-hidden mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">Tag manager</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b">
          <div className="text-[11px] opacity-80">Reorder groups, move tags, rename, delete</div>
        </div>

        <div className="p-4 overflow-auto max-h-[calc(85vh-56px)]">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={tagManagerNewGroupName}
              onChange={(e) => setTagManagerNewGroupName(e.target.value)}
              placeholder="New group…"
              className="mac-field flex-1"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const created = createTagGroup(doc, tagManagerNewGroupName);
                if (!created) return;
                setTagManagerNewGroupName('');
              }}
            />
            <button
              type="button"
              onClick={() => {
                const created = createTagGroup(doc, tagManagerNewGroupName);
                if (!created) return;
                setTagManagerNewGroupName('');
              }}
              className="mac-btn"
              title="Add group"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {tagGroups.map((g) => {
              const tags = tagsByGroup.get(g.id) || [];
              const canDeleteGroup = g.id !== 'tg-ungrouped';
              const isDragOver = draggingTagId ? dragOverGroupId === g.id : draggingGroupId ? dragOverGroupColumnId === g.id : false;
              const newTagName = tagManagerNewTagNameByGroup[g.id] || '';
              return (
                <div
                  key={g.id}
                  className={`min-w-[240px] w-[240px] border rounded-md bg-white ${
                    isDragOver ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggingTagId) setDragOverGroupId(g.id);
                    if (draggingGroupId) setDragOverGroupColumnId(g.id);
                  }}
                  onDragLeave={() => {
                    setDragOverGroupId((prev) => (prev === g.id ? null : prev));
                    setDragOverGroupColumnId((prev) => (prev === g.id ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingGroupId) {
                      const from = draggingGroupId;
                      const to = g.id;
                      if (from !== to) {
                        const ids = tagGroups.map((x) => x.id);
                        const fromIdx = ids.indexOf(from);
                        const toIdx = ids.indexOf(to);
                        if (fromIdx !== -1 && toIdx !== -1) {
                          ids.splice(fromIdx, 1);
                          ids.splice(toIdx, 0, from);
                          reorderTagGroups(doc, ids);
                        }
                      }
                      setDraggingGroupId(null);
                      setDragOverGroupColumnId(null);
                      return;
                    }
                    if (draggingTagId) {
                      moveTagToGroup(doc, draggingTagId, g.id);
                      setDraggingTagId(null);
                      setDragOverGroupId(null);
                    }
                  }}
                  title={g.id}
                >
                  <div className="px-2 py-2 border-b border-gray-100 flex items-center gap-2">
                    <button
                      type="button"
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', g.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingGroupId(g.id);
                      }}
                      onDragEnd={() => {
                        setDraggingGroupId(null);
                        setDragOverGroupColumnId(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 cursor-grab"
                      title="Drag to reorder group"
                    >
                      <GripVertical size={14} />
                    </button>
                    <input
                      type="text"
                      defaultValue={g.name}
                      onBlur={(e) => renameTagGroup(doc, g.id, e.target.value)}
                      className="flex-1 text-[11px] font-medium border border-transparent rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent"
                    />
                    <button
                      type="button"
                      disabled={!canDeleteGroup}
                      onClick={() => deleteTagGroup(doc, g.id)}
                      className="p-1.5 rounded-md hover:bg-gray-50 text-gray-500 disabled:opacity-40"
                      title={canDeleteGroup ? 'Delete group (tags move to ungrouped)' : 'Ungrouped cannot be deleted'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="p-2 space-y-1 max-h-[46vh] overflow-auto">
                    {tags.length ? (
                      tags.map((t) => {
                        const isDragging = draggingTagId === t.id;
                        return (
                          <div
                            key={t.id}
                            className={`flex items-center gap-2 border rounded px-2 py-1 ${
                              isDragging ? 'opacity-60 border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
                            }`}
                            draggable={true}
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', t.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDraggingTagId(t.id);
                            }}
                            onDragEnd={() => {
                              setDraggingTagId(null);
                              setDragOverGroupId(null);
                            }}
                            title={t.id}
                          >
                            <div className="text-gray-400 cursor-grab" title="Drag to move">
                              <GripVertical size={14} />
                            </div>
                            <input
                              type="text"
                              defaultValue={t.name}
                              onBlur={(e) => renameTag(doc, t.id, e.target.value)}
                              className="flex-1 text-[11px] border border-transparent rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent"
                            />
                            <button
                              type="button"
                              onClick={() => deleteTag(doc, t.id)}
                              className="p-1 rounded-md hover:bg-gray-50 text-gray-500"
                              title="Delete tag"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[11px] text-gray-500 px-1 py-2">No tags.</div>
                    )}
                  </div>

                  <div className="px-2 py-2 border-t border-gray-100 flex items-center gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) =>
                        setTagManagerNewTagNameByGroup((prev) => ({
                          ...prev,
                          [g.id]: e.target.value,
                        }))
                      }
                      placeholder="New tag…"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const created = createTag(doc, g.id, newTagName);
                        if (!created) return;
                        setTagManagerNewTagNameByGroup((prev) => ({ ...prev, [g.id]: '' }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const created = createTag(doc, g.id, newTagName);
                        if (!created) return;
                        setTagManagerNewTagNameByGroup((prev) => ({ ...prev, [g.id]: '' }));
                      }}
                      className="p-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
                      title="Add tag"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

