'use client';

import type { NexusNode } from '@/types/nexus';
import type { TreeTestRunState } from '@/lib/tree-testing';
import { singleLine } from '@/lib/testing/text';
import { NavigationCardGrid } from '@/components/testing/navigation/NavigationCardGrid';

export function TreeTestPopupModal({
  state,
  nodeId,
  onClose,
  onSelect,
}: {
  state: Extract<TreeTestRunState, { kind: 'ready' }>;
  nodeId: string;
  onClose: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const node: NexusNode | null = state.nodeById.get(nodeId) || null;
  if (!node) return null;
  const ui = state.uiTypeByNodeId.get(node.id) || null;
  const children = node.children || [];

  return (
    <div className="absolute inset-0 z-[80] bg-black/35 flex items-center justify-center">
      <div className="w-[92%] max-w-4xl max-h-[90%] flex flex-col overflow-hidden mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">{singleLine(node.content)}</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              Close
            </button>
          </div>
        </div>
        <div className="p-4 overflow-auto">
          {children.length === 0 ? (
            <div className="text-xs text-neutral-500">No items.</div>
          ) : ui === 'list' ? (
            <div className="border border-black/10 bg-white divide-y">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-black/5"
                >
                  {singleLine(c.content)}
                </button>
              ))}
            </div>
          ) : (
            <NavigationCardGrid nodes={children} onSelect={onSelect} />
          )}
        </div>
      </div>
    </div>
  );
}
