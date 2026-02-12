'use client';

import type { NexusNode } from '@/types/nexus';
import type { TreeTestRunState } from '@/lib/tree-testing';
import { singleLine } from '@/lib/testing/text';

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
    <div className="absolute inset-0 z-[80] bg-black/40 flex items-center justify-center">
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
            <div className="text-xs text-slate-500">No items.</div>
          ) : ui === 'list' ? (
            <div className="border border-slate-200 bg-white divide-y">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                >
                  {singleLine(c.content)}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                >
                  <div className="text-xs font-semibold text-slate-900">{singleLine(c.content)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

