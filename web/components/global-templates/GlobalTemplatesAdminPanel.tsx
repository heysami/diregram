'use client';

import { Shield, Trash2 } from 'lucide-react';

export function GlobalTemplatesAdminPanel(props: {
  loading: boolean;
  onRefresh: () => void;
  onClearAll: () => void;
}) {
  const { loading, onRefresh, onClearAll } = props;
  return (
    <div className="mac-window mac-double-outline p-4 bg-white">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="mac-double-outline inline-flex p-2 bg-white">
            <Shield size={16} />
          </div>
          <div>
            <div className="text-xs font-semibold">Admin tools</div>
            <div className="text-[11px] opacity-70">Manage the global templates list.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="mac-btn h-8" disabled={loading} onClick={onRefresh} title="Refresh list">
            Refresh
          </button>
          <button
            type="button"
            className="mac-btn h-8 flex items-center gap-1.5"
            disabled={loading}
            onClick={onClearAll}
            title="Delete everything in the global templates list"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

