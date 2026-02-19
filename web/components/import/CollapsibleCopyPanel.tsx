'use client';

import { Clipboard } from 'lucide-react';

export function CollapsibleCopyPanel(props: {
  title: string;
  description: string;
  copyLabel: string;
  textToCopy: string;
  childrenText: string;
  copy: (text: string) => Promise<void> | void;
}) {
  const { title, description, copyLabel, textToCopy, childrenText, copy } = props;
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50">
      <summary className="list-none cursor-pointer p-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{title}</div>
          <div className="mt-1 text-[12px] text-slate-600">{description}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            // Keep copy usable even when collapsed; avoid toggling <details>.
            e.preventDefault();
            e.stopPropagation();
            void copy(textToCopy);
          }}
          className="shrink-0 px-3 py-1.5 rounded-md bg-white border border-slate-200 text-[12px] font-semibold text-slate-800 hover:bg-slate-100 flex items-center gap-1.5"
        >
          <Clipboard size={14} />
          {copyLabel}
        </button>
      </summary>
      <div className="px-3 pb-3">
        <pre className="whitespace-pre-wrap text-[11px] leading-4 text-slate-700 font-mono max-h-[260px] overflow-auto rounded-md bg-white border border-slate-200 p-3">
          {childrenText}
        </pre>
      </div>
    </details>
  );
}

