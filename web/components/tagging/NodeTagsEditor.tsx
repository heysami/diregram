import { useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import type { NexusNode } from '@/types/nexus';
import { useTagStore } from '@/hooks/use-tag-store';
import { createTag, type NexusTag, type NexusTagGroup } from '@/lib/tag-store';
import { setNodeTags } from '@/lib/node-tags';

type Props = {
  doc: Y.Doc;
  node: NexusNode;
  /** Optional: tighter spacing for small panels */
  compact?: boolean;
};

export function NodeTagsEditor({ doc, node, compact = true }: Props) {
  const tagStore = useTagStore(doc);
  const tagGroups: NexusTagGroup[] = useMemo(() => [...tagStore.groups], [tagStore.groups]);

  const [activeGroupId, setActiveGroupId] = useState<string>('tg-ungrouped');
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);

  const effectiveActiveGroupId = useMemo(() => {
    if (tagGroups.some((g) => g.id === activeGroupId)) return activeGroupId;
    return tagGroups[0]?.id || 'tg-ungrouped';
  }, [activeGroupId, tagGroups]);

  const tagsById = useMemo(() => new Map(tagStore.tags.map((t) => [t.id, t])), [tagStore.tags]);
  const groupNameById = useMemo(
    () => new Map(tagGroups.map((g) => [g.id, g.name])),
    [tagGroups],
  );

  const attachedTagIds = useMemo(() => {
    const ids = node.tags || [];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  }, [node.tags]);

  const flatTags = useMemo(() => {
    return tagStore.tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        groupId: t.groupId,
        groupName: groupNameById.get(t.groupId) || t.groupId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.groupName.localeCompare(b.groupName));
  }, [tagStore.tags, groupNameById]);

  const filteredSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) {
      return flatTags
        .filter((t) => t.groupId === effectiveActiveGroupId)
        .slice(0, 8);
    }
    return flatTags
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          `${t.groupName}/${t.name}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [flatTags, tagInput, effectiveActiveGroupId]);

  const exactMatchTagId = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return null;
    const matches = flatTags.filter((t) => t.name.trim().toLowerCase() === q);
    if (matches.length === 1) return matches[0].id;
    return null;
  }, [flatTags, tagInput]);

  const attachTagId = (tagId: string) => {
    const next = Array.from(new Set([...attachedTagIds, tagId]));
    setNodeTags(doc, node, next);
  };

  const detachTagId = (tagId: string) => {
    const next = attachedTagIds.filter((x) => x !== tagId);
    setNodeTags(doc, node, next);
  };

  const commitAddFromInput = () => {
    const q = tagInput.trim();
    if (!q) return;
    const pick = filteredSuggestions[tagSuggestionIndex];
    const toAttachId = exactMatchTagId || pick?.id || null;
    if (toAttachId) {
      attachTagId(toAttachId);
      setTagInput('');
      setTagSuggestionIndex(0);
      return;
    }
    const created = createTag(doc, effectiveActiveGroupId, q);
    if (!created) return;
    attachTagId(created.id);
    setTagInput('');
    setTagSuggestionIndex(0);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-800">Tags</div>
        {tagGroups.length > 1 ? (
          <select
            className="mac-field h-7 text-[11px]"
            value={effectiveActiveGroupId}
            onChange={(e) => setActiveGroupId(e.target.value)}
            title="Tag group"
          >
            {tagGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {attachedTagIds.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {attachedTagIds
            .slice()
            .sort((a, b) => a.localeCompare(b))
            .map((id) => {
              const t = tagsById.get(id);
              const label = t ? `${groupNameById.get(t.groupId) || t.groupId}/${t.name}` : id;
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                    t ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}
                  title={id}
                >
                  <span className="truncate max-w-[170px]">{label}</span>
                  <button
                    type="button"
                    onClick={() => detachTagId(id)}
                    className="text-gray-400 hover:text-gray-700"
                    title="Remove tag"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
        </div>
      ) : (
        <div className="text-[11px] text-slate-500">No tags</div>
      )}

      <div className="relative">
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
              setTagSuggestionIndex((i) => Math.min(i + 1, Math.max(filteredSuggestions.length - 1, 0)));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setTagSuggestionIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              commitAddFromInput();
              return;
            }
            if (e.key === 'Escape') {
              setTagInput('');
              setTagSuggestionIndex(0);
            }
          }}
          placeholder="Add tag… (Enter to add / create)"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        {filteredSuggestions.length > 0 && tagInput.trim().length > 0 ? (
          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
            {filteredSuggestions.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  attachTagId(t.id);
                  setTagInput('');
                  setTagSuggestionIndex(0);
                }}
                className={`w-full text-left px-2 py-1 text-[11px] ${
                  idx === tagSuggestionIndex ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                }`}
                title={t.id}
              >
                <span className="font-medium">{t.name}</span>{' '}
                <span className="text-gray-400">· {t.groupName}</span>
              </button>
            ))}
            {!exactMatchTagId && (
              <div className="px-2 py-1 text-[10px] text-gray-500 border-t border-gray-100">
                Press Enter to create <span className="font-medium">“{tagInput.trim()}”</span>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

