'use client';

import type { ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';

export function TextPreview({ node }: { node: ExpandedGridNodeRuntime }) {
  return (
    <div
      className={`mt-1 whitespace-pre-wrap break-words flex-1 min-h-0 overflow-auto ${
        node.textAlign === 'right' ? 'text-right' : node.textAlign === 'center' ? 'text-center' : 'text-left'
      } ${
        node.textVariant === 'h1'
          ? 'text-lg font-extrabold'
          : node.textVariant === 'h2'
            ? 'text-base font-bold'
            : node.textVariant === 'h3'
              ? 'text-sm font-semibold'
              : node.textVariant === 'h4'
                ? 'text-xs font-semibold'
                : node.textVariant === 'h5'
                  ? 'text-xs font-medium'
                  : node.textVariant === 'h6'
                    ? 'text-[11px] font-medium'
                    : node.textVariant === 'small'
                      ? 'text-[10px] font-normal'
                      : 'text-xs font-normal'
      }`}
    >
      {node.content || ''}
    </div>
  );
}

