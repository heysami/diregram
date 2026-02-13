'use client';

import type { RenderUiItem, UiTabs } from '@/components/testing/expanded-grid/preview-types';
import { singleLine } from '@/lib/testing/text';

export function DropdownPreview({
  gridKey,
  tabs,
  activeTabByGridKey,
  setActiveTabByGridKey,
  dropdownOpenByGridKey,
  setDropdownOpenByGridKey,
  renderItem,
}: {
  gridKey: string;
  tabs: UiTabs;
  activeTabByGridKey: Record<string, string>;
  setActiveTabByGridKey: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  dropdownOpenByGridKey: Record<string, boolean>;
  setDropdownOpenByGridKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  renderItem: RenderUiItem;
}) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const activeId = activeTabByGridKey[gridKey] || safeTabs[0]?.id || '';
  const active = safeTabs.find((t) => t.id === activeId) || safeTabs[0] || null;
  const items = active?.items || [];
  const setActive = (id: string) => setActiveTabByGridKey((prev) => ({ ...prev, [gridKey]: id }));

  if (safeTabs.length === 0) return null;

  const isOpen = Boolean(dropdownOpenByGridKey[gridKey]);

  return (
    <div className="mt-1 flex flex-col flex-1 min-h-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDropdownOpenByGridKey((prev) => ({ ...prev, [gridKey]: !isOpen }));
        }}
        className="w-full text-[10px] px-2 py-1 rounded border border-slate-200 bg-white text-left truncate"
        title="Dropdown (click to open/close)"
      >
        {active?.icon ? <span className="mr-1">{active.icon}</span> : null}
        {singleLine(active?.label || 'Select…')}
        <span className="float-right text-slate-500">{isOpen ? '▴' : '▾'}</span>
      </button>

      {isOpen ? (
        <div className="mt-1 border border-slate-200 bg-white rounded p-1 flex-1 min-h-0 overflow-auto">
          <div className="flex gap-2 min-h-0">
            <div className="w-1/3 min-w-[70px] shrink-0 border border-slate-200 bg-slate-50 rounded p-1 overflow-auto min-h-0">
              {safeTabs.slice(0, 12).map((t) => {
                const isActive = t.id === (active?.id || '');
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setActive(t.id);
                    }}
                    className={`w-full text-left text-[10px] px-1 py-0.5 rounded truncate ${
                      isActive ? 'bg-blue-600 text-white' : 'hover:bg-white text-slate-800'
                    }`}
                    title={t.label}
                  >
                    {t.icon ? <span className="mr-1">{t.icon}</span> : null}
                    {singleLine(t.label)}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 border border-slate-200 bg-white rounded p-1 overflow-auto min-h-0">
              <div className="space-y-0.5">{items.slice(0, 10).map((it) => renderItem(it, `${gridKey}-${active?.id || 'tab'}`))}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

