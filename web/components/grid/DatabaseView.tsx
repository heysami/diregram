'use client';

import { useMemo } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { GridDatabasePropertyType, GridSheetV1 } from '@/lib/gridjson';
import { addDbProperty, addDbRow, deleteDbProperty, deleteDbRow, moveDbProperty, moveDbRow, setDbCellValue } from '@/lib/grid/databaseModel';

export function DatabaseView({ sheet, onChange }: { sheet: GridSheetV1; onChange: (next: GridSheetV1) => void }) {
  const props = sheet.database.properties || [];
  const rows = sheet.database.rows || [];

  const activeView = useMemo(() => {
    const id = sheet.database.activeViewId;
    return sheet.database.views.find((v) => v.id === id) || sheet.database.views[0] || null;
  }, [sheet.database.activeViewId, sheet.database.views]);

  const addProperty = (type: GridDatabasePropertyType) => {
    onChange(addDbProperty(sheet, type));
  };

  const addRow = () => {
    onChange(addDbRow(sheet));
  };

  return (
    <div className="absolute inset-0 overflow-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{activeView ? activeView.name : 'Database'}</div>
        <div className="flex items-center gap-2">
          <button type="button" className="mac-btn h-7 flex items-center gap-1.5" onClick={addRow}>
            <Plus size={14} />
            Row
          </button>
          <div className="relative">
            <details>
              <summary className="mac-btn h-7 list-none cursor-pointer flex items-center gap-1.5">
                <Plus size={14} />
                Property
              </summary>
              <div className="absolute right-0 mt-1 z-50 mac-double-outline bg-white p-2 grid gap-1 min-w-[180px]">
                {(['text', 'number', 'select', 'multiSelect', 'checkbox', 'date'] as GridDatabasePropertyType[]).map((t) => (
                  <button key={t} type="button" className="mac-btn h-7 text-left" onClick={() => addProperty(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-auto mac-double-outline bg-white">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-200 px-2 py-1 text-left w-[96px]">#</th>
              {props.map((p, idx) => (
                <th key={p.id} className="border border-slate-200 px-2 py-1 text-left min-w-[120px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{p.name}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Move property left"
                        disabled={idx === 0}
                        onClick={() => onChange(moveDbProperty(sheet, p.id, 'left'))}
                      >
                        <ArrowLeft size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Move property right"
                        disabled={idx === props.length - 1}
                        onClick={() => onChange(moveDbProperty(sheet, p.id, 'right'))}
                      >
                        <ArrowRight size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete property"
                        onClick={() => {
                          const ok = window.confirm('Delete this property? This will remove the column from all rows.');
                          if (!ok) return;
                          onChange(deleteDbProperty(sheet, p.id));
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] opacity-60">{p.type}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rIdx) => (
              <tr key={r.id}>
                <td className="border border-slate-200 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular-nums opacity-80">{rIdx + 1}</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Move row up"
                        disabled={rIdx === 0}
                        onClick={() => onChange(moveDbRow(sheet, r.id, 'up'))}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Move row down"
                        disabled={rIdx === rows.length - 1}
                        onClick={() => onChange(moveDbRow(sheet, r.id, 'down'))}
                      >
                        <ArrowDown size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete row"
                        onClick={() => {
                          const ok = window.confirm('Delete this row?');
                          if (!ok) return;
                          onChange(deleteDbRow(sheet, r.id));
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </td>
                {props.map((p) => (
                  <td key={p.id} className="border border-slate-200 px-2 py-1">
                    {p.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={Boolean((r.cells || {})[p.id])}
                        onChange={(e) => {
                          onChange(setDbCellValue(sheet, r.id, p.id, e.target.checked));
                        }}
                      />
                    ) : (
                      <input
                        className="w-full bg-transparent outline-none"
                        value={(() => {
                          const raw = (r.cells || {})[p.id];
                          if (raw === null || raw === undefined) return '';
                          return typeof raw === 'string' ? raw : String(raw);
                        })()}
                        onChange={(e) => {
                          onChange(setDbCellValue(sheet, r.id, p.id, e.target.value));
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={1 + props.length} className="p-4 text-xs opacity-70">
                  No rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

