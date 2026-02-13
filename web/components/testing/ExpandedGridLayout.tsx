'use client';

import { useMemo, useState } from 'react';
import type {
  ExpandedGridNodeRuntime,
  ExpandedGridUiItem,
  ExpandedGridUiSection,
  ExpandedGridUiTab,
  ExpandedGridUiType,
} from '@/lib/expanded-grid-storage';
import { singleLine } from '@/lib/testing/text';
import { TextPreview } from '@/components/testing/expanded-grid/previews/TextPreview';
import { ButtonPreview } from '@/components/testing/expanded-grid/previews/ButtonPreview';
import { FilterPreview } from '@/components/testing/expanded-grid/previews/FilterPreview';
import { TabsLikePreview } from '@/components/testing/expanded-grid/previews/TabsLikePreview';
import { DropdownPreview } from '@/components/testing/expanded-grid/previews/DropdownPreview';
import { CollapsiblePreview } from '@/components/testing/expanded-grid/previews/CollapsiblePreview';

export function ExpandedGridLayout({
  cols,
  rows,
  nodes,
  onClickNode,
  highlightKey,
  onClickDataObjectId,
  getDataObjectAttributeLabel,
}: {
  cols: number;
  rows: number;
  nodes: ExpandedGridNodeRuntime[];
  onClickNode: (n: ExpandedGridNodeRuntime) => void;
  highlightKey?: string;
  onClickDataObjectId?: (dataObjectId: string) => void;
  getDataObjectAttributeLabel?: (dataObjectId: string, attributeId: string) => string;
}) {
  const filtered = useMemo(() => nodes.filter((n) => (n.uiType || 'content') !== 'navOut'), [nodes]);

  // Local-only UI state to make inner previews clickable (tabs/wizard/sidenav/collapsible/dropdown).
  const [activeTabByGridKey, setActiveTabByGridKey] = useState<Record<string, string>>({});
  const [collapsedByGridKey, setCollapsedByGridKey] = useState<Record<string, Record<string, boolean>>>({});
  const [dropdownOpenByGridKey, setDropdownOpenByGridKey] = useState<Record<string, boolean>>({});

  const renderItem = (it: ExpandedGridUiItem, keyPrefix: string) => {
    const label = singleLine(it.label);
    const doid = (it.dataObjectId || '').trim();
    const clickable = Boolean(onClickDataObjectId && doid);
    if (clickable) {
      return (
        <button
          key={`${keyPrefix}-${it.id}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!doid) return;
            onClickDataObjectId?.(doid);
          }}
          className="w-full text-left text-[10px] text-slate-800 hover:bg-slate-50 rounded px-1 py-0.5"
          title={`Open linked node for ${doid}`}
        >
          {it.icon ? <span className="mr-1">{it.icon}</span> : null}
          {label}
        </button>
      );
    }
    return (
      <div key={`${keyPrefix}-${it.id}`} className="text-[10px] text-slate-800 truncate px-1 py-0.5">
        {it.icon ? <span className="mr-1">{it.icon}</span> : null}
        {label}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 overflow-auto">
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.max(1, rows)}, 72px)`,
        }}
      >
        {filtered.map((n) => {
          const key = String(n.key || n.id);
          const isHighlight = highlightKey ? key === highlightKey : false;
          const ui = (n.uiType || 'content') as ExpandedGridUiType;
          const title = singleLine(n.content);
          const tabs = (n.uiTabs || []) as ExpandedGridUiTab[];
          const sections = (n.uiSections || []) as ExpandedGridUiSection[];
          const showHeaderTitle = ui !== 'text' && ui !== 'button';
          const showHeaderOpen = ui !== 'button';

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onClickNode(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClickNode(n);
                }
              }}
              className={`rounded-md border p-2 text-left hover:bg-slate-50 overflow-hidden outline-none focus:ring-2 focus:ring-blue-200 h-full flex flex-col ${
                isHighlight ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
              }`}
              style={{
                gridColumn: `${Math.max(1, (n.gridX || 0) + 1)} / span ${Math.max(1, n.gridWidth || 1)}`,
                gridRow: `${Math.max(1, (n.gridY || 0) + 1)} / span ${Math.max(1, n.gridHeight || 1)}`,
              }}
              title="Click inner node"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {showHeaderTitle ? (
                    <div className="text-[11px] font-semibold text-slate-900 truncate">{title}</div>
                  ) : null}
                </div>
                {showHeaderOpen && n.dataObjectId ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const doid = (n.dataObjectId || '').trim();
                      if (!doid) return;
                      onClickDataObjectId?.(doid);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    title={n.dataObjectId ? `Open linked node for ${n.dataObjectId}` : 'No data object link'}
                    disabled={!onClickDataObjectId || !n.dataObjectId}
                  >
                    Open
                  </button>
                ) : null}
              </div>

              {/* Filter is intentionally minimal: no link/mode pills */}
              {ui === 'filter' ? null : n.dataObjectId ? (
                <div className="mt-1 text-[10px] text-slate-500 truncate">
                  🔗 <span className="font-mono">{n.dataObjectId}</span>
                </div>
              ) : null}

              {ui === 'text' ? (
                <TextPreview node={n} />
              ) : ui === 'button' ? (
                <ButtonPreview
                  node={n}
                  onClick={() => {
                    const doid = (n.dataObjectId || '').trim();
                    if (doid && onClickDataObjectId) onClickDataObjectId(doid);
                    else onClickNode(n);
                  }}
                />
              ) : ui === 'filter' ? (
                <FilterPreview node={n} getDataObjectAttributeLabel={getDataObjectAttributeLabel} />
              ) : ui === 'dropdown' ? (
                <DropdownPreview
                  gridKey={key}
                  tabs={tabs}
                  activeTabByGridKey={activeTabByGridKey}
                  setActiveTabByGridKey={setActiveTabByGridKey}
                  dropdownOpenByGridKey={dropdownOpenByGridKey}
                  setDropdownOpenByGridKey={setDropdownOpenByGridKey}
                  renderItem={renderItem}
                />
              ) : ui === 'tabs' || ui === 'wizard' || ui === 'sideNav' ? (
                <TabsLikePreview
                  uiType={ui}
                  gridKey={key}
                  tabs={tabs}
                  activeTabByGridKey={activeTabByGridKey}
                  setActiveTabByGridKey={setActiveTabByGridKey}
                  renderItem={renderItem}
                />
              ) : ui === 'collapsible' ? (
                <CollapsiblePreview
                  gridKey={key}
                  sections={sections}
                  collapsedByGridKey={collapsedByGridKey}
                  setCollapsedByGridKey={setCollapsedByGridKey}
                  renderItem={renderItem}
                />
              ) : (
                <div className="mt-1 text-[10px] text-slate-500 truncate">&nbsp;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

