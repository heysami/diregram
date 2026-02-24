'use client';

import type { NexusNode } from '@/types/nexus';
import { singleLine } from '@/lib/testing/text';

export function NavigationCardGrid({
  nodes,
  onSelect,
  cardHeight = '25vh',
  minCardHeightPx = 140,
}: {
  nodes: NexusNode[];
  onSelect: (nodeId: string) => void;
  cardHeight?: string;
  minCardHeightPx?: number;
}) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
      {nodes.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className="border border-black/10 bg-white p-4 text-left hover:bg-black/5 flex flex-col transition-colors"
          style={{ height: cardHeight, minHeight: minCardHeightPx }}
          title="Open"
        >
          <div className="text-sm font-semibold text-neutral-900">{singleLine(c.content)}</div>
          {c.annotation ? (
            <div className="mt-2 text-[11px] text-neutral-600 overflow-hidden">
              <div className="line-clamp-4">{singleLine(c.annotation)}</div>
            </div>
          ) : null}
          <div className="mt-auto pt-3 text-[11px] text-neutral-500">{c.children?.length ? `${c.children.length} steps` : 'Open'}</div>
        </button>
      ))}
    </div>
  );
}
