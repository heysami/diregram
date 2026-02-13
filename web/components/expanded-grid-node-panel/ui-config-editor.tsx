'use client';

import type { ExpandedGridUiTab, ExpandedGridUiSection, ExpandedGridUiType } from '@/lib/expanded-grid-storage';
import type { UiModal, UiTabsType } from './ui-modal';
import { makeId } from './ui-utils';

export function ExpandedGridNodePanelUiConfigEditor({
  uiType,
  uiTabs,
  uiSections,
  setUiModalStack,
  onCommitUiTabs,
  onCommitUiSections,
}: {
  uiType: ExpandedGridUiType;
  uiTabs: ExpandedGridUiTab[];
  uiSections: ExpandedGridUiSection[];
  setUiModalStack: React.Dispatch<React.SetStateAction<UiModal[]>>;
  onCommitUiTabs: (next: ExpandedGridUiTab[]) => void;
  onCommitUiSections: (next: ExpandedGridUiSection[]) => void;
}) {
  if (uiType === 'tabs' || uiType === 'wizard' || uiType === 'sideNav' || uiType === 'dropdown') {
    const header =
      uiType === 'wizard'
        ? 'Wizard steps'
        : uiType === 'sideNav'
          ? 'Side nav sections'
          : uiType === 'dropdown'
            ? 'Dropdown sections'
            : 'Tabs';
    const tabs = uiTabs || [];
    return (
      <div className="mt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{header}</div>
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
          {tabs.length === 0 ? (
            <div className="p-2 text-[11px] text-gray-500">No sections yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tabs.map((t) => (
                <div key={t.id} className="p-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-gray-900 truncate">
                      {t.icon ? <span className="mr-1">{t.icon}</span> : null}
                      {t.label}
                      {t.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Items: <span className="font-medium">{(t.items || []).length}</span>
                      {t.dataObjectAttributeIds?.length ? (
                        <>
                          {' '}
                          · attrs: <span className="font-medium">{t.dataObjectAttributeIds.length}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUiModalStack((prev) => [
                        ...prev,
                        {
                          kind: 'tab',
                          mode: 'edit',
                          uiType: uiType as UiTabsType,
                          tabId: t.id,
                          draft: { ...t, items: [...(t.items || [])] },
                        },
                      ]);
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = tabs.filter((x) => x.id !== t.id);
                      onCommitUiTabs(next.length ? next : []);
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            const label = `${uiType === 'wizard' ? 'Step' : uiType === 'dropdown' ? 'Section' : 'Tab'} ${tabs.length + 1}`;
            const draft: ExpandedGridUiTab = {
              id: makeId('tab'),
              label,
              icon: undefined,
              items: [],
              dataObjectId: undefined,
              dataObjectAttributeIds: [],
              dataObjectAttributeMode: 'data',
            };
            setUiModalStack((prev) => [...prev, { kind: 'tab', mode: 'add', uiType: uiType as UiTabsType, tabId: draft.id, draft }]);
          }}
          className="mt-2 text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Add {uiType === 'wizard' ? 'step' : uiType === 'dropdown' ? 'section' : 'tab'}
        </button>
      </div>
    );
  }

  if (uiType === 'collapsible') {
    const sections = uiSections || [];
    return (
      <div className="mt-4">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Collapsible</div>
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
          {sections.length === 0 ? (
            <div className="p-2 text-[11px] text-gray-500">No sections yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sections.map((s) => (
                <div key={s.id} className="p-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-gray-900 truncate">
                      {s.icon ? <span className="mr-1">{s.icon}</span> : null}
                      {s.label}
                      {s.dataObjectId ? <span className="ml-1 text-[10px] text-blue-700">🔗</span> : null}
                      {s.collapsedByDefault ? <span className="ml-1 text-[10px] text-gray-500">(collapsed)</span> : null}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Items: <span className="font-medium">{(s.items || []).length}</span>
                      {s.dataObjectAttributeIds?.length ? (
                        <>
                          {' '}
                          · attrs: <span className="font-medium">{s.dataObjectAttributeIds.length}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUiModalStack((prev) => [
                        ...prev,
                        { kind: 'section', mode: 'edit', sectionId: s.id, draft: { ...s, items: [...(s.items || [])] } },
                      ]);
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = sections.filter((x) => x.id !== s.id);
                      onCommitUiSections(next.length ? next : []);
                    }}
                    className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            const draft: ExpandedGridUiSection = {
              id: makeId('section'),
              label: `Section ${sections.length + 1}`,
              icon: undefined,
              items: [],
              collapsedByDefault: false,
              dataObjectId: undefined,
              dataObjectAttributeIds: [],
              dataObjectAttributeMode: 'data',
            };
            setUiModalStack((prev) => [...prev, { kind: 'section', mode: 'add', sectionId: draft.id, draft }]);
          }}
          className="mt-2 text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Add section
        </button>
      </div>
    );
  }

  return null;
}

