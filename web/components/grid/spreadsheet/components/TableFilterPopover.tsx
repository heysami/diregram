import { useEffect, useRef } from 'react';

export function TableFilterPopover({
  title,
  statsLabel,
  value,
  onChange,
  options,
  selected,
  onToggleValue,
  onSelectAll,
  onSelectNone,
  onClearAll,
  onClose,
}: {
  title: string;
  statsLabel?: string;
  value: string;
  onChange: (next: string) => void;
  options?: Array<{ group: string; value: string; count: number }>;
  selected?: Set<string>;
  onToggleValue?: (v: string) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  onClearAll?: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Ensure the input actually receives focus even if the sheet keeps focus.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Filter</div>
        <div className="flex-1" />
        <button type="button" className="mac-btn h-7" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="p-2 text-[12px] flex flex-col gap-2">
        <div className="text-[11px] opacity-70 truncate" title={title}>
          {title}
        </div>
        {statsLabel ? <div className="text-[11px] opacity-60 -mt-1">{statsLabel}</div> : null}
        <input
          ref={inputRef}
          className="mac-field h-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Contains…"
        />

        {options && options.length ? (
          <div className="border border-slate-200 rounded bg-white overflow-hidden">
            <div className="px-2 py-1 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold">Values</div>
              <div className="flex items-center gap-2">
                {onSelectAll ? (
                  <button type="button" className="mac-btn h-6" onClick={onSelectAll}>
                    All
                  </button>
                ) : null}
                {onSelectNone ? (
                  <button type="button" className="mac-btn h-6" onClick={onSelectNone}>
                    None
                  </button>
                ) : null}
              </div>
            </div>
            <div className="max-h-[220px] overflow-auto p-1">
              {(() => {
                const byGroup = new Map<string, Array<{ value: string; count: number }>>();
                options.forEach((o) => {
                  const arr = byGroup.get(o.group) || [];
                  arr.push({ value: o.value, count: o.count });
                  byGroup.set(o.group, arr);
                });
                const groups = Array.from(byGroup.entries());
                return groups.map(([g, arr]) => (
                  <div key={g} className="mb-1">
                    <div className="px-1 py-1 text-[10px] uppercase tracking-wide opacity-60">{g}</div>
                    {arr.map((o) => {
                      const isOn = selected ? selected.has(o.value) : false;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className="w-full text-left px-1.5 py-1 rounded hover:bg-slate-50 flex items-center gap-2"
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleValue?.(o.value);
                          }}
                        >
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded border ${isOn ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'}`}>
                            {isOn ? '✓' : ''}
                          </span>
                          <span className="flex-1 min-w-0 truncate">{o.value}</span>
                          <span className="text-[10px] opacity-60 tabular-nums">{o.count}</span>
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="mac-btn h-7" onClick={() => onChange('')}>
            Clear
          </button>
          {onClearAll ? (
            <button type="button" className="mac-btn h-7" onClick={onClearAll} title="Clear all filters for this table">
              Clear table
            </button>
          ) : null}
          <button type="button" className="mac-btn mac-btn--primary h-7" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

