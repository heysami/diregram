'use client';

import { useMemo } from 'react';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { DataObjectAttributeMultiSelect } from '@/components/DataObjectAttributeMultiSelect';
import type { NexusDataObject } from '@/lib/data-object-storage';
import type {
  ExpandedGridUiTab,
  ExpandedGridUiSection,
  ExpandedGridAttributeRenderMode,
} from '@/lib/expanded-grid-storage';
import { makeId, sanitizeItems } from './ui-utils';

export type UiTabsType = 'tabs' | 'wizard' | 'sideNav' | 'dropdown';

export type UiItemDraft = {
  id: string;
  label: string;
  icon?: string;
  dataObjectId?: string;
  dataObjectAttributeIds?: string[];
  dataObjectAttributeMode?: ExpandedGridAttributeRenderMode;
};

export type UiModal =
  | { kind: 'tab'; mode: 'add' | 'edit'; uiType: UiTabsType; tabId: string; draft: ExpandedGridUiTab }
  | { kind: 'tabItem'; uiType: UiTabsType; tabId: string; itemId: string; draft: UiItemDraft }
  | { kind: 'section'; mode: 'add' | 'edit'; sectionId: string; draft: ExpandedGridUiSection }
  | { kind: 'sectionItem'; sectionId: string; itemId: string; draft: UiItemDraft }
  | {
      kind: 'mainAttrs';
      objectId: string;
      value: string[];
      mode: ExpandedGridAttributeRenderMode;
    };

export function ExpandedGridNodePanelUiModal({
  uiModalStack,
  setUiModalStack,
  objects,
  childNodeLinkedObjects,
  currentUiTabs,
  currentUiSections,
  onCommitUiTabs,
  onCommitUiSections,
  onCommitMainAttrs,
}: {
  uiModalStack: UiModal[];
  setUiModalStack: React.Dispatch<React.SetStateAction<UiModal[]>>;
  objects: NexusDataObject[];
  childNodeLinkedObjects: Array<{ id: string; name: string }>;
  currentUiTabs: ExpandedGridUiTab[];
  currentUiSections: ExpandedGridUiSection[];
  onCommitUiTabs: (next: ExpandedGridUiTab[]) => void;
  onCommitUiSections: (next: ExpandedGridUiSection[]) => void;
  onCommitMainAttrs: (payload: { ids: string[]; mode: ExpandedGridAttributeRenderMode }) => void;
}) {
  const uiModal = uiModalStack.length ? uiModalStack[uiModalStack.length - 1] : null;
  const closeModal = () => setUiModalStack((prev) => prev.slice(0, -1));
  const closeAllModals = () => setUiModalStack([]);

  const modalTitle = useMemo(() => {
    if (!uiModal) return '';
    if (uiModal.kind === 'tab') {
      const label = uiModal.uiType === 'wizard' ? 'step' : uiModal.uiType === 'dropdown' ? 'section' : 'tab';
      return `${uiModal.mode === 'add' ? 'Add' : 'Edit'} ${label}`;
    }
    if (uiModal.kind === 'tabItem') return 'Edit item';
    if (uiModal.kind === 'section') return `${uiModal.mode === 'add' ? 'Add' : 'Edit'} collapsible section`;
    if (uiModal.kind === 'sectionItem') return 'Edit item';
    if (uiModal.kind === 'mainAttrs') return 'Linked attributes';
    return '';
  }, [uiModal]);

  if (!uiModal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
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
            <div className="text-xs font-semibold text-gray-900 truncate">{modalTitle}</div>
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

              const safeItems = sanitizeItems<NonNullable<ExpandedGridUiTab['items']>[number]>(draft.items);

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
                        placeholder="Label"
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
                      objects={objects.map((o) => ({ id: o.id, name: o.name }))}
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
                        <label className="block text-[11px] font-medium text-gray-700 mb-1 mt-2">
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
                          objects={objects}
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
                            label: `Item ${safeItems.length + 1}`,
                            icon: undefined,
                            dataObjectId: undefined,
                            dataObjectAttributeIds: [],
                            dataObjectAttributeMode: 'data',
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
                      {safeItems.length === 0 ? (
                        <div className="p-2 text-[11px] text-gray-500">No items yet.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {safeItems.map((it) => (
                            <div key={it.id} className="p-2 flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] text-gray-900 truncate">
                                  {it.icon ? <span className="mr-1">{it.icon}</span> : null}
                                  {it.label}
                                  {it.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const asDraft: UiItemDraft = {
                                    id: it.id,
                                    label: it.label,
                                    icon: it.icon,
                                    dataObjectId: it.dataObjectId,
                                    dataObjectAttributeIds: it.dataObjectAttributeIds,
                                    dataObjectAttributeMode: it.dataObjectAttributeMode,
                                  };
                                  setUiModalStack((prev) => [
                                    ...prev,
                                    { kind: 'tabItem', uiType: uiModal.uiType, tabId: draft.id, itemId: it.id, draft: asDraft },
                                  ]);
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
                      )}
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
                        const normalized: ExpandedGridUiTab = {
                          ...draft,
                          label: (draft.label || '').trim() || 'Untitled',
                          items: safeItems,
                        };
                        const next =
                          uiModal.mode === 'add'
                            ? [...currentUiTabs, normalized]
                            : currentUiTabs.map((x) => (x.id === uiModal.tabId ? normalized : x));
                        onCommitUiTabs(next);
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
                      objects={objects.map((o) => ({ id: o.id, name: o.name }))}
                      placeholder="Link object…"
                      includeNoneOption={true}
                      noneLabel="No object"
                    />
                    {draft.dataObjectId ? (
                      <>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1 mt-2">
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
                          objects={objects}
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
                        // Update parent tab draft in stack (second-to-last), not the doc yet.
                        setUiModalStack((prev) => {
                          if (prev.length < 2) return prev.slice(0, -1);
                          const next = [...prev];
                          const item = next[next.length - 1] as Extract<UiModal, { kind: 'tabItem' }>;
                          const parent = next[next.length - 2] as Extract<UiModal, { kind: 'tab' }>;
                          const items = sanitizeItems<NonNullable<ExpandedGridUiTab['items']>[number]>(parent.draft.items);
                          const normalized: UiItemDraft = { ...item.draft, label: (item.draft.label || '').trim() || 'Untitled' };
                          const idx = items.findIndex((x) => x.id === item.itemId);
                          if (idx >= 0) items[idx] = normalized as unknown as NonNullable<ExpandedGridUiTab['items']>[number];
                          else items.push(normalized as unknown as NonNullable<ExpandedGridUiTab['items']>[number]);
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

              const safeItems = sanitizeItems<NonNullable<ExpandedGridUiSection['items']>[number]>(draft.items);

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
                    <input type="checkbox" checked={!!draft.collapsedByDefault} onChange={(e) => setDraft({ collapsedByDefault: e.target.checked })} />
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
                      objects={objects.map((o) => ({ id: o.id, name: o.name }))}
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
                        <label className="block text-[11px] font-medium text-gray-700 mb-1 mt-2">
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
                          objects={objects}
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
                            label: `Item ${safeItems.length + 1}`,
                            icon: undefined,
                            dataObjectId: undefined,
                            dataObjectAttributeIds: [],
                            dataObjectAttributeMode: 'data',
                          };
                          setUiModalStack((prev) => [...prev, { kind: 'sectionItem', sectionId: draft.id, itemId: newItem.id, draft: newItem }]);
                        }}
                        className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      >
                        Add item
                      </button>
                    </div>

                    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
                      {safeItems.length === 0 ? (
                        <div className="p-2 text-[11px] text-gray-500">No items yet.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {safeItems.map((it) => (
                            <div key={it.id} className="p-2 flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] text-gray-900 truncate">
                                  {it.icon ? <span className="mr-1">{it.icon}</span> : null}
                                  {it.label}
                                  {it.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const asDraft: UiItemDraft = {
                                    id: it.id,
                                    label: it.label,
                                    icon: it.icon,
                                    dataObjectId: it.dataObjectId,
                                    dataObjectAttributeIds: it.dataObjectAttributeIds,
                                    dataObjectAttributeMode: it.dataObjectAttributeMode,
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
                      )}
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
                        const normalized: ExpandedGridUiSection = {
                          ...draft,
                          label: (draft.label || '').trim() || 'Untitled',
                          items: safeItems,
                        };
                        const next =
                          uiModal.mode === 'add'
                            ? [...currentUiSections, normalized]
                            : currentUiSections.map((x) => (x.id === uiModal.sectionId ? normalized : x));
                        onCommitUiSections(next);
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
                      objects={objects.map((o) => ({ id: o.id, name: o.name }))}
                      placeholder="Link object…"
                      includeNoneOption={true}
                      noneLabel="No object"
                    />
                    {draft.dataObjectId ? (
                      <>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1 mt-2">
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
                          objects={objects}
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
                          const items = sanitizeItems<NonNullable<ExpandedGridUiSection['items']>[number]>(parent.draft.items);
                          const normalized: UiItemDraft = { ...item.draft, label: (item.draft.label || '').trim() || 'Untitled' };
                          const idx = items.findIndex((x) => x.id === item.itemId);
                          if (idx >= 0) items[idx] = normalized as unknown as NonNullable<ExpandedGridUiSection['items']>[number];
                          else items.push(normalized as unknown as NonNullable<ExpandedGridUiSection['items']>[number]);
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
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-700 mb-1">Attributes mode (applies to all selected)</label>
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
                objects={objects}
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
                    onCommitMainAttrs({ ids: uiModal.value, mode: uiModal.mode });
                    closeModal();
                  }}
                  className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

