'use client';

import type { TemplateLibraryScope } from '@/lib/template-library';

export function TemplateMoveControls({
  value,
  onChange,
  onMove,
  disabled,
  projectLabel = 'This project',
}: {
  value: TemplateLibraryScope;
  onChange: (next: TemplateLibraryScope) => void;
  onMove: () => void | Promise<void>;
  disabled?: boolean;
  projectLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">Library</div>
      <div className="flex items-center gap-2">
        <select
          className="mac-field h-9 flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value as TemplateLibraryScope)}
          title="Where this template should live"
          disabled={disabled}
        >
          <option value="project">{projectLabel}</option>
          <option value="account">Account</option>
        </select>
        <button type="button" className="mac-btn h-9" title="Move template to selected library" onClick={onMove} disabled={disabled}>
          Move
        </button>
      </div>
      <div className="text-[11px] opacity-70">Templates inherit access from the folder they’re in.</div>
    </div>
  );
}

