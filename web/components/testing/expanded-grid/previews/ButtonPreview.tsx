'use client';

import type { ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';

export function ButtonPreview({
  node,
  onClick,
}: {
  node: ExpandedGridNodeRuntime;
  onClick: () => void;
}) {
  const title = String(node.content || '').replace(/\s+/g, ' ').trim();
  return (
    <div className="mt-2 flex-1 min-h-0 flex items-center justify-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="w-full max-w-full rounded-md border border-blue-600 bg-blue-600 text-white px-3 py-2 text-xs font-semibold hover:bg-blue-700 active:bg-blue-800"
      >
        {node.icon ? <span className="mr-1">{node.icon}</span> : null}
        {title || 'Button'}
      </button>
    </div>
  );
}

