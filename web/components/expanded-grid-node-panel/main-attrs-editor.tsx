'use client';

import type { ExpandedGridAttributeRenderMode } from '@/lib/expanded-grid-storage';
import type { UiModal } from './ui-modal';

export function ExpandedGridNodePanelMainAttrsEditor({
  dataObjectId,
  attributeIds,
  attributeMode,
  setUiModalStack,
}: {
  dataObjectId: string;
  attributeIds: string[];
  attributeMode?: ExpandedGridAttributeRenderMode;
  setUiModalStack: React.Dispatch<React.SetStateAction<UiModal[]>>;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-700">Linked attributes</div>
        <button
          type="button"
          onClick={() => {
            setUiModalStack((prev) => [
              ...prev,
              {
                kind: 'mainAttrs',
                objectId: dataObjectId,
                value: attributeIds || [],
                mode: (attributeMode || 'data') as ExpandedGridAttributeRenderMode,
              },
            ]);
          }}
          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
        >
          Edit attributes{attributeIds?.length ? ` (${attributeIds.length})` : ''}
        </button>
      </div>
      <div className="mt-1 text-[10px] text-gray-500">
        Mode:{' '}
        <span className="font-medium">{(attributeMode || 'data') === 'input' ? 'Input form' : 'Data only'}</span>
      </div>
    </div>
  );
}

