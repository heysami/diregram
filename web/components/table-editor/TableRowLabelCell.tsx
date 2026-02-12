import React from 'react';
import { Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { TableRow } from '../DimensionTableEditor';
import { getRowLabelCellBackground } from './cellStyles';

interface Props {
  row: TableRow;
  rowIndex: number;
  totalRows: number;
  onLabelChange: (rowId: string, label: string) => void;
  onRemoveRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
}

export function TableRowLabelCell({ row, rowIndex, totalRows, onLabelChange, onRemoveRow, onMoveRow }: Props) {
  const bgColor = getRowLabelCellBackground(row.rowType);
  const canMoveUp = rowIndex > 0;
  const canMoveDown = rowIndex < totalRows - 1;

  return (
    <td className={`border-r border-slate-200 px-2 py-1 text-[11px] text-slate-700 ${bgColor}`}>
      <div className="flex items-center gap-1">
        {row.rowType !== 'header' && (
          <input
            type="text"
            value={row.label}
            onChange={(e) => onLabelChange(row.id, e.target.value)}
            className="w-full text-[11px] border border-transparent rounded px-1 py-0.5 focus:outline-none focus:border-blue-500 bg-transparent"
            placeholder="Row label"
          />
        )}
        {row.rowType === 'header' && <div className="flex-1" />}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMoveRow(row.id, 'up')}
            disabled={!canMoveUp}
            className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move row up"
          >
            <ChevronUp size={10} />
          </button>
          <button
            type="button"
            onClick={() => onMoveRow(row.id, 'down')}
            disabled={!canMoveDown}
            className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move row down"
          >
            <ChevronDown size={10} />
          </button>
          <button
            type="button"
            onClick={() => onRemoveRow(row.id)}
            className="text-slate-300 hover:text-red-500"
            title="Remove row"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
    </td>
  );
}
