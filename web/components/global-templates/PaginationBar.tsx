'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PaginationBar(props: {
  loading: boolean;
  pageIndex: number;
  totalPages: number | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  leftLabel?: string;
}) {
  const { loading, pageIndex, totalPages, canPrev, canNext, onPrev, onNext, leftLabel } = props;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-xs opacity-80">{leftLabel || ''}</div>
      <div className="flex items-center gap-2">
        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" disabled={!canPrev || loading} onClick={onPrev}>
          <ChevronLeft size={14} />
          Prev
        </button>
        <div className="text-[11px] opacity-70">
          Page {pageIndex + 1}
          {totalPages ? ` / ${totalPages}` : ''}
        </div>
        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" disabled={!canNext || loading} onClick={onNext}>
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

