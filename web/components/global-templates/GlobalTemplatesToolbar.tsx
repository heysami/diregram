'use client';

import { LayoutTemplate, Search } from 'lucide-react';

export function GlobalTemplatesToolbar(props: {
  queryInput: string;
  onQueryInputChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  typeOptions: Array<{ id: string; label: string }>;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
}) {
  const { queryInput, onQueryInputChange, typeFilter, onTypeFilterChange, typeOptions, pageSize, onPageSizeChange } = props;

  return (
    <div className="mac-window mac-double-outline p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="mac-double-outline inline-flex p-2 bg-white">
            <LayoutTemplate size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight">Browse globally published templates</div>
            <div className="text-xs opacity-70">Search by name and filter by template type.</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60" />
            <input
              className="mac-field h-9 pl-7 w-[260px] max-w-[80vw]"
              value={queryInput}
              onChange={(e) => onQueryInputChange(e.target.value)}
              placeholder="Search name…"
            />
          </div>
          <select className="mac-field h-9" value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
            {typeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="mac-field h-9"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Math.max(6, Math.min(60, Number(e.target.value || 24))))}
            title="Items per page"
          >
            <option value="12">12 / page</option>
            <option value="24">24 / page</option>
            <option value="48">48 / page</option>
          </select>
        </div>
      </div>
    </div>
  );
}

