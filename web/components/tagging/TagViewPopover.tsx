import { Eye, EyeOff, Lightbulb, LightbulbOff, Tags } from 'lucide-react';
import * as Y from 'yjs';
import { useMemo } from 'react';
import { useTagStore } from '@/hooks/use-tag-store';
import type { TagViewState } from '@/types/tagging';
import type { NexusTag, NexusTagGroup } from '@/lib/tag-store';

type Props = {
  doc: Y.Doc;
  tagView: TagViewState;
  onTagViewChange: (next: TagViewState | ((prev: TagViewState) => TagViewState)) => void;
  onOpenManager: () => void;
};

export function TagViewPopover({ doc, tagView, onTagViewChange, onOpenManager }: Props) {
  const tagStore = useTagStore(doc);

  const tagGroups: NexusTagGroup[] = useMemo(() => [...tagStore.groups], [tagStore.groups]);
  const activeGroupId = tagGroups.some((g) => g.id === tagView.activeGroupId)
    ? tagView.activeGroupId
    : tagGroups[0]?.id || 'tg-ungrouped';

  const tagsInActiveGroup: NexusTag[] = useMemo(() => {
    return tagStore.tags
      .filter((t) => t.groupId === activeGroupId)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tagStore.tags, activeGroupId]);

  const visibleSet = useMemo(() => new Set(tagView.visibleTagIds), [tagView.visibleTagIds]);
  const highlightSet = useMemo(() => new Set(tagView.highlightedTagIds), [tagView.highlightedTagIds]);

  const toggleInSet = (kind: 'visible' | 'highlight', tagId: string, shiftKey: boolean) => {
    onTagViewChange((prev) => {
      const currVisible = new Set(prev.visibleTagIds);
      const currHighlight = new Set(prev.highlightedTagIds);
      const curr = kind === 'visible' ? currVisible : currHighlight;
      const other = kind === 'visible' ? currHighlight : currVisible;

      const had = curr.has(tagId);
      let nextSet: Set<string>;

      if (shiftKey) {
        nextSet = new Set(curr);
        if (had) nextSet.delete(tagId);
        else nextSet.add(tagId);
      } else {
        if (had && curr.size === 1) nextSet = new Set();
        else nextSet = new Set([tagId]);
      }

      // Mutual exclusivity per tag: if turned on in this kind, remove from other.
      const nextOther = new Set(other);
      if (nextSet.has(tagId)) nextOther.delete(tagId);

      return kind === 'visible'
        ? { ...prev, activeGroupId, visibleTagIds: Array.from(nextSet), highlightedTagIds: Array.from(nextOther) }
        : { ...prev, activeGroupId, highlightedTagIds: Array.from(nextSet), visibleTagIds: Array.from(nextOther) };
    });
  };

  return (
    <div className="bg-white shadow-lg border border-gray-200 rounded-lg p-3 mb-2 w-[520px] max-w-[92vw] animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tag view</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenManager}
            className="p-2 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Manage tags"
          >
            <Tags size={14} />
          </button>
          <button
            type="button"
            onClick={() => onTagViewChange((prev) => ({ ...prev, visibleTagIds: [], highlightedTagIds: [] }))}
            className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Clear tag view (show all / no dim)"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {tagGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onTagViewChange((prev) => ({ ...prev, activeGroupId: g.id }))}
            className={`text-[11px] px-2 py-1 rounded-md border ${
              activeGroupId === g.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
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
            const isShown = visibleSet.has(t.id);
            const isHighlighted = highlightSet.has(t.id);
            return (
              <div key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1">
                <span className="text-[11px] text-gray-800 max-w-[160px] truncate" title={t.id}>
                  {t.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => toggleInSet('visible', t.id, (e as unknown as MouseEvent).shiftKey)}
                  className={`p-1 rounded-md ${isShown ? 'text-blue-700 hover:bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  title={isShown ? 'Clear show for this tag' : 'Show only nodes with this tag'}
                >
                  {isShown ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  onClick={(e) => toggleInSet('highlight', t.id, (e as unknown as MouseEvent).shiftKey)}
                  className={`p-1 rounded-md ${
                    isHighlighted ? 'text-amber-700 hover:bg-amber-50' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                  title={isHighlighted ? 'Unhighlight' : 'Highlight'}
                >
                  {isHighlighted ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

