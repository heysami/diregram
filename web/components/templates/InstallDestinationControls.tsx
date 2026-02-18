'use client';

export function InstallDestinationControls({
  scope,
  onScopeChange,
  projectId,
  onProjectIdChange,
  projects,
  onInstall,
  disabled,
}: {
  scope: 'account' | 'project';
  onScopeChange: (next: 'account' | 'project') => void;
  projectId: string;
  onProjectIdChange: (next: string) => void;
  projects: Array<{ id: string; name: string; canEdit: boolean }>;
  onInstall: () => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-slate-700">Install destination</div>
      <div className="flex items-center gap-2">
        <select
          className="mac-field h-9 flex-1"
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as any)}
          title="Choose where to install this template"
          disabled={disabled}
        >
          <option value="account">Account Templates</option>
          <option value="project">Project Templates</option>
        </select>
      </div>
      {scope === 'project' ? (
        <select
          className="mac-field h-9 w-full"
          value={projectId}
          onChange={(e) => onProjectIdChange(e.target.value)}
          title="Choose project"
          disabled={disabled}
        >
          {projects.length === 0 ? <option value="">No projects found</option> : null}
          {projects.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.canEdit}>
              {p.name}
              {!p.canEdit ? ' (no edit access)' : ''}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        className="mac-btn mac-btn--primary w-full"
        title={scope === 'account' ? 'Install into Account Templates' : 'Install into selected project Templates folder'}
        onClick={onInstall}
        disabled={disabled}
      >
        Install
      </button>
    </div>
  );
}

