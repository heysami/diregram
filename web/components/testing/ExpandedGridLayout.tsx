'use client';

import type { ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';
import { singleLine } from '@/lib/testing/text';

export function ExpandedGridLayout({
  cols,
  rows,
  nodes,
  onClickNode,
  highlightKey,
}: {
  cols: number;
  rows: number;
  nodes: ExpandedGridNodeRuntime[];
  onClickNode: (n: ExpandedGridNodeRuntime) => void;
  highlightKey?: string;
}) {
  const filtered = nodes.filter((n) => (n.uiType || 'content') !== 'navOut');
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
          return (
            <button
              key={key}
              type="button"
              onClick={() => onClickNode(n)}
              className={`rounded-md border p-2 text-left hover:bg-slate-50 overflow-hidden ${
                isHighlight ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
              }`}
              style={{
                gridColumn: `${Math.max(1, (n.gridX || 0) + 1)} / span ${Math.max(1, n.gridWidth || 1)}`,
                gridRow: `${Math.max(1, (n.gridY || 0) + 1)} / span ${Math.max(1, n.gridHeight || 1)}`,
              }}
              title="Click inner node"
            >
              <div className="text-[11px] font-semibold text-slate-900">{singleLine(n.content)}</div>
              <div className="mt-1 text-[10px] text-slate-500 truncate">&nbsp;</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

