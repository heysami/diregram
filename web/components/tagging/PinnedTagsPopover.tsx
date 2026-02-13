import { Pin, PinOff } from 'lucide-react';
import * as Y from 'yjs';
import { useMemo, useState } from 'react';
import { useTagStore } from '@/hooks/use-tag-store';
import type { NexusTag, NexusTagGroup } from '@/lib/tag-store';
import { moveIdInArray } from '@/lib/array-utils';

type Props = {
  doc: Y.Doc;
  pinnedTagIds: string[];
  onPinnedTagIdsChange: (next: string[]) => void;
};

export function PinnedTagsPopover({ doc, pinnedTagIds, onPinnedTagIdsChange }: Props) {
  const tagStore = useTagStore(doc);
  const [activeGroupId, setActiveGroupId] = useState<string>('tg-ungrouped');
  const [dragId, setDragId] = useState<string | null>(null);

  const tagGroups: NexusTagGroup[] = useMemo(() => [...tagStore.groups], [tagStore.groups]);
  const effectiveGroupId = tagGroups.some((g) => g.id === activeGroupId)
    ? activeGroupId
    : tagGroups[0]?.id || 'tg-ungrouped';

  const tagsInActiveGroup: NexusTag[] = useMemo(() => {
    return tagStore.tags
      .filter((t) => t.groupId === effectiveGroupId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tagStore.tags, effectiveGroupId]);

  const pinnedSet = useMemo(() => new Set(pinnedTagIds), [pinnedTagIds]);
  const tagById = useMemo(() => new Map(tagStore.tags.map((t) => [t.id, t])), [tagStore.tags]);

  const pinnedLabels = useMemo(() => {
    return pinnedTagIds
      .map((id) => ({ id, name: tagById.get(id)?.name || id }))
      .filter((x) => !!x.id);
  }, [pinnedTagIds, tagById]);

  return (
    <div className="bg-white shadow-lg border border-gray-200 rounded-lg p-3 mb-2 w-[560px] max-w-[92vw] animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pinned tags</div>
        <button
          type="button"
          onClick={() => onPinnedTagIdsChange([])}
          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
          title="Clear all pinned tags"
          disabled={pinnedTagIds.length === 0}
        >
          Clear
        </button>
      </div>

      <div className="mb-3">
        {pinnedLabels.length === 0 ? (
          <div className="text-[11px] text-gray-500">No pinned tags yet. Pin tags below to show them above nodes.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {pinnedLabels.map((t) => (
              <div
                key={`pinned-${t.id}`}
                draggable
                onDragStart={(e) => {
                  setDragId(t.id);
                  try {
                    e.dataTransfer.setData('text/plain', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                  } catch {
                    // ignore
                  }
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  try {
                    e.dataTransfer.dropEffect = 'move';
                  } catch {
                    // ignore
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from =
                    dragId ||
                    (() => {
                      try {
                        return e.dataTransfer.getData('text/plain') || null;
                      } catch {
                        return null;
                      }
                    })();
                  if (!from) return;
                  onPinnedTagIdsChange(moveIdInArray(pinnedTagIds, from, t.id));
                  setDragId(null);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 cursor-grab active:cursor-grabbing"
                title="Drag to reorder"
              >
                <span className="text-[11px] text-gray-800 max-w-[180px] truncate">{t.name}</span>
                <button
                  type="button"
                  onClick={() => onPinnedTagIdsChange(pinnedTagIds.filter((id) => id !== t.id))}
                  className="p-1 rounded-md text-gray-500 hover:bg-gray-50"
                  title="Unpin"
                >
                  <PinOff size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {tagGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroupId(g.id)}
            className={`text-[11px] px-2 py-1 rounded-md border ${
              effectiveGroupId === g.id
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
            title={g.id}
          >
            {g.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {tagsInActiveGroup.length === 0 ? (
          <div className="text-[11px] text-gray-500">No tags in this group.</div>
        ) : (
          tagsInActiveGroup.map((t) => {
            const isPinned = pinnedSet.has(t.id);
            return (
              <div key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1">
                <span className="text-[11px] text-gray-800 max-w-[200px] truncate" title={t.id}>
                  {t.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (isPinned) {
                      onPinnedTagIdsChange(pinnedTagIds.filter((id) => id !== t.id));
                    } else {
                      onPinnedTagIdsChange([...pinnedTagIds, t.id]);
                    }
                  }}
                  className={`p-1 rounded-md ${isPinned ? 'text-slate-900 hover:bg-slate-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  title={isPinned ? 'Unpin' : 'Pin tag (show above nodes)'}
                >
                  <Pin size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

