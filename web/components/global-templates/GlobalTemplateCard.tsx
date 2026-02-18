'use client';

import { Trash2 } from 'lucide-react';
import { Download } from 'lucide-react';
import { LazyTemplateThumbnail } from '@/components/global-templates/LazyTemplateThumbnail';
import type { GlobalTemplateCardModel } from '@/components/global-templates/templateCardModel';

export function GlobalTemplateCard(props: {
  model: GlobalTemplateCardModel;
  isAdmin: boolean;
  onOpen: () => void;
  onInstall?: () => void;
  onDelete?: () => void;
}) {
  const { model: m, isAdmin, onOpen, onInstall, onDelete } = props;

  return (
    <div
      role="button"
      tabIndex={0}
      className="mac-window mac-double-outline overflow-hidden text-left hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-black/20"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open template preview: ${m.name}`}
      title="Open preview"
    >
      <div className="p-3 border-b bg-white relative">
        <div className="text-xs font-semibold truncate">{m.name}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="text-[11px] opacity-70 truncate">by {m.ownerLabel}</div>
          <div className="text-[11px] opacity-70 truncate">{m.typeLabel}</div>
        </div>
        {onInstall ? (
          <button
            type="button"
            className="absolute right-2 bottom-2 h-7 px-2 border flex items-center justify-center gap-1 bg-white hover:bg-gray-50 text-[11px]"
            title="Install to your Account Templates"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onInstall();
            }}
          >
            <Download size={14} />
            Install
          </button>
        ) : null}
        {isAdmin && onDelete ? (
          <button
            type="button"
            className="absolute right-2 top-2 h-7 w-7 border flex items-center justify-center bg-white hover:bg-gray-50"
            title="Delete from global list"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <div className="p-3 bg-slate-50">
        <LazyTemplateThumbnail header={m.header} rendered={m.rendered} heightPx={220} label={m.typeLabel} />
      </div>
    </div>
  );
}

