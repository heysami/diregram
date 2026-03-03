import { X } from 'lucide-react';

interface Props {
  startNodeId: string;
  startLabel: string;
  lastLabel: string;
  isCollapsed: boolean;
  onToggleCollapsed: (startNodeId: string) => void;
  onClose: () => void;
}

export function SingleScreenStepsGroupPanel({
  startNodeId,
  startLabel,
  lastLabel,
  isCollapsed,
  onToggleCollapsed,
  onClose,
}: Props) {
  return (
    <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Single Screen Steps</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <button type="button" onClick={onClose} className="mac-btn" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        <div className="text-[11px] text-gray-700">
          <div className="text-[10px] uppercase tracking-wide opacity-70">Screen range</div>
          <div className="mt-1">
            <span className="text-gray-500">Start:</span>{' '}
            <span className="font-medium">{startLabel || startNodeId}</span>
          </div>
          <div className="mt-0.5">
            <span className="text-gray-500">Last:</span>{' '}
            <span className="font-medium">{lastLabel || 'Not set'}</span>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="text-[11px] font-semibold text-gray-700 mb-2">View</div>
          <button
            type="button"
            onClick={() => onToggleCollapsed(startNodeId)}
            className="w-full text-[11px] px-3 py-2 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            {isCollapsed ? 'Expand grouped steps' : 'Collapse grouped steps'}
          </button>
          <div className="mt-2 text-[10px] text-gray-500">
            Collapse hides inner steps and routes the flow through this screen.
          </div>
        </div>
      </div>
    </div>
  );
}

