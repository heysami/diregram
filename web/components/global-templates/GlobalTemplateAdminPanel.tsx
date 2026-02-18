'use client';

import { Shield, Trash2 } from 'lucide-react';

export function GlobalTemplateAdminPanel(props: { onDelete: () => void }) {
  const { onDelete } = props;
  return (
    <div className="mac-window mac-double-outline p-4 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="mac-double-outline inline-flex p-2 bg-white">
            <Shield size={16} />
          </div>
          <div>
            <div className="text-xs font-semibold">Admin tools</div>
            <div className="text-[11px] opacity-70">Manage this global template.</div>
          </div>
        </div>
        <button type="button" className="mac-btn h-8 flex items-center gap-1.5" onClick={onDelete} title="Delete this template from the global list">
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

