'use client';

import { OBJECT_NAME_ATTR_ID } from '@/lib/data-object-attribute-ids';
import type { ExpandedGridNodeRuntime } from '@/lib/expanded-grid-storage';

export function FilterPreview({
  node,
  getDataObjectAttributeLabel,
}: {
  node: ExpandedGridNodeRuntime;
  getDataObjectAttributeLabel?: (dataObjectId: string, attributeId: string) => string;
}) {
  const doid = String(node.dataObjectId || '').trim();
  const attrIds = Array.isArray(node.dataObjectAttributeIds)
    ? node.dataObjectAttributeIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  const labels =
    doid && attrIds.length
      ? attrIds.map((id) => {
          if (id === OBJECT_NAME_ATTR_ID) return 'Object name';
          return (getDataObjectAttributeLabel ? getDataObjectAttributeLabel(doid, id) : '') || id;
        })
      : ['Lorem', 'Ipsum', 'Dolor'];

  return (
    <div className="mt-2 flex-1 min-h-0 flex flex-col gap-2">
      <input
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400"
        placeholder="Search…"
        defaultValue=""
      />

      <div className="flex-1 min-h-0">
        <div className="overflow-x-auto">
          <div className="flex flex-nowrap items-center gap-2">
            {labels.slice(0, 24).map((label) => (
              <button
                key={label}
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

