'use client';

import type { ExpandedGridUiType } from '@/lib/expanded-grid-storage';
import type { RenderUiItem, UiTabs } from '@/components/testing/expanded-grid/preview-types';
import { singleLine } from '@/lib/testing/text';

export function TabsLikePreview({
  uiType,
  gridKey,
  tabs,
  activeTabByGridKey,
  setActiveTabByGridKey,
  renderItem,
}: {
  uiType: ExpandedGridUiType;
  gridKey: string;
  tabs: UiTabs;
  activeTabByGridKey: Record<string, string>;
  setActiveTabByGridKey: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  renderItem: RenderUiItem;
}) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const activeId = activeTabByGridKey[gridKey] || safeTabs[0]?.id || '';
  const active = safeTabs.find((t) => t.id === activeId) || safeTabs[0] || null;
  const items = active?.items || [];
  const setActive = (id: string) => setActiveTabByGridKey((prev) => ({ ...prev, [gridKey]: id }));

  if (safeTabs.length === 0) return null;

  if (uiType === 'sideNav') {
    return (
      <div className="mt-1 flex gap-2 flex-1 min-h-0">
        <div className="w-1/3 min-w-[60px] shrink-0 border border-slate-200 bg-slate-50 rounded p-1 overflow-auto min-h-0">
          {safeTabs.slice(0, 12).map((t) => {
            const isActive = t.id === (active?.id || '');
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
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
    );
  }

  // tabs / wizard (horizontal)
  return (
    <div className="mt-1 flex flex-col flex-1 min-h-0">
      <div className="flex flex-wrap gap-1">
        {safeTabs.slice(0, 8).map((t, idx) => {
          const isActive = t.id === (active?.id || '');
          const label = uiType === 'wizard' ? `Step ${idx + 1}` : singleLine(t.label);
          return (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActive(t.id);
              }}
              className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
              title={t.label}
            >
              {t.icon ? <span className="mr-1">{t.icon}</span> : null}
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-1 border border-slate-200 bg-white rounded p-1 flex-1 min-h-0 overflow-auto">
        <div className="space-y-0.5">{items.slice(0, 10).map((it) => renderItem(it, `${gridKey}-${active?.id || 'tab'}`))}</div>
      </div>
    </div>
  );
}

