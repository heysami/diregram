'use client';

import type { ExpandedGridUiItem } from '@/lib/expanded-grid-storage';
import type { RenderUiItem, UiSections } from '@/components/testing/expanded-grid/preview-types';
import { singleLine } from '@/lib/testing/text';

export function CollapsiblePreview({
  gridKey,
  sections,
  collapsedByGridKey,
  setCollapsedByGridKey,
  renderItem,
}: {
  gridKey: string;
  sections: UiSections;
  collapsedByGridKey: Record<string, Record<string, boolean>>;
  setCollapsedByGridKey: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
  renderItem: RenderUiItem;
}) {
  const safeSections = Array.isArray(sections) ? sections : [];
  if (safeSections.length === 0) return null;

  const currentCollapsed = collapsedByGridKey[gridKey] || {};
  const isCollapsed = (sectionId: string, defaultCollapsed?: boolean): boolean => {
    if (sectionId in currentCollapsed) return !!currentCollapsed[sectionId];
    const section = safeSections.find((s) => s.id === sectionId);
    return Boolean(defaultCollapsed ?? section?.collapsedByDefault);
  };
  const toggle = (sectionId: string) => {
    const next = !isCollapsed(sectionId);
    setCollapsedByGridKey((prev) => ({
      ...prev,
      [gridKey]: { ...(prev[gridKey] || {}), [sectionId]: next },
    }));
  };

  return (
    <div className="mt-1 border border-slate-200 bg-white rounded p-1 flex-1 min-h-0 overflow-auto">
      <div className="space-y-1">
        {safeSections.slice(0, 6).map((s) => {
          const collapsed = isCollapsed(s.id, s.collapsedByDefault);
          const items = (s.items || []) as ExpandedGridUiItem[];
          return (
            <div key={s.id} className="rounded border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(s.id);
                }}
                className="w-full flex items-center justify-between text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-800"
                title={s.label}
              >
                <span className="truncate">
                  {s.icon ? <span className="mr-1">{s.icon}</span> : null}
                  {singleLine(s.label)}
                </span>
                <span className="ml-2 text-slate-500">{collapsed ? '▸' : '▾'}</span>
              </button>
              {!collapsed ? (
                <div className="p-1 space-y-0.5">{items.slice(0, 8).map((it) => renderItem(it, `${gridKey}-${s.id}`))}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

