'use client';

import { useEffect, useRef, useState } from 'react';
import { AppWindow, ChevronDown, Copy, Eye, FileCode, FileText, FlaskConical, Network, Package, Pencil, Plus, Share2, Table } from 'lucide-react';

type MenuItem = {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onClick: () => void | Promise<void>;
};

function DropdownMenu({
  label,
  items,
  disabled,
  title,
}: {
  label: React.ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (ref.current && ref.current.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="mac-btn flex items-center gap-1.5"
        disabled={!!disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} <ChevronDown size={14} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 mac-window mac-double-outline overflow-hidden min-w-[240px] bg-white">
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 disabled:opacity-50 mac-menu-item"
              disabled={!!it.disabled}
              title={it.title}
              onClick={async () => {
                setOpen(false);
                await it.onClick();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectActionMenus({
  projectTab,
  canEdit,
  onNewMap,
  onNewFromTemplate,
  onImportMermaidDiagram,
  onNewGrid,
  onNewNote,
  onNewVision,
  onNewTest,
  onBuildKnowledgeBase,
  ragStatus,
  ragStatusText,
  onCopyProjectLink,
  onAiGenerateFiles,
  onExportBundle,
  onExportKg,
  onEditProject,
}: {
  projectTab: 'files' | 'templates' | 'import';
  canEdit: boolean;
  onNewMap: () => void;
  onNewFromTemplate: () => void;
  onImportMermaidDiagram: () => void | Promise<void>;
  onNewGrid: () => void;
  onNewNote: () => void;
  onNewVision: () => void;
  onNewTest: () => void;
  onBuildKnowledgeBase?: () => void | Promise<void>;
  ragStatus?: 'ready' | 'not_built' | 'loading' | 'building' | null;
  ragStatusText?: string | null;
  onCopyProjectLink?: () => void | Promise<void>;
  onAiGenerateFiles?: () => void | Promise<void>;
  onExportBundle: () => void | Promise<void>;
  onExportKg: () => void | Promise<void>;
  onEditProject: () => void;
}) {
  const newDisabled = projectTab !== 'files' || !canEdit;
  const newTitle = projectTab !== 'files' ? 'Switch to Files tab to create new files' : !canEdit ? 'No edit access' : 'Create new content';

  const ragPill =
    ragStatus === 'ready' ? (
      <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        Ready
      </span>
    ) : ragStatus === 'not_built' ? (
      <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
        Not built
      </span>
    ) : ragStatus === 'loading' ? (
      <span className="shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
        Checking…
      </span>
    ) : ragStatus === 'building' ? (
      <span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700" title={ragStatusText || 'Knowledge base is building in background'}>
        Building…
      </span>
    ) : null;

  const newItems: MenuItem[] = [
    { id: 'new-map', label: 'Map', icon: <Network size={14} />, onClick: onNewMap },
    { id: 'new-from-template', label: 'From template…', icon: <Copy size={14} />, onClick: onNewFromTemplate },
    { id: 'import-mermaid', label: 'Import Mermaid diagram…', icon: <FileCode size={14} />, onClick: onImportMermaidDiagram },
    ...(onAiGenerateFiles
      ? [
          {
            id: 'ai-generate-files',
            label: 'AI generate files…',
            icon: <FileText size={14} />,
            title: 'Generate notes and user-story grids asynchronously',
            onClick: onAiGenerateFiles,
          } satisfies MenuItem,
        ]
      : []),
    { id: 'sep-1', label: '────────', disabled: true, onClick: () => {} },
    { id: 'new-grid', label: 'Grid', icon: <Table size={14} />, onClick: onNewGrid },
    { id: 'new-note', label: 'Note', icon: <FileText size={14} />, onClick: onNewNote },
    { id: 'new-vision', label: 'Vision', icon: <Eye size={14} />, onClick: onNewVision },
    { id: 'new-test', label: 'Test', icon: <FlaskConical size={14} />, onClick: onNewTest },
  ];

  const ragItems: MenuItem[] = [
    ...(onBuildKnowledgeBase
      ? [
          {
            id: 'build-kb',
            label: (
              <span className="flex-1 flex items-center justify-between gap-2">
                <span>Build knowledge base (RAG)</span>
                {ragPill}
              </span>
            ),
            icon: <Share2 size={14} />,
            title: 'Generate embeddings + semantic KG for this project',
            onClick: onBuildKnowledgeBase,
          } satisfies MenuItem,
        ]
      : []),
    { id: 'export-kg', label: 'Export semantic KG', icon: <Share2 size={14} />, onClick: onExportKg },
    ...(onBuildKnowledgeBase
      ? [
          {
            id: 'open-account-mcp-setup',
            label: 'Open Account MCP setup',
            icon: <AppWindow size={14} />,
            title: 'Open /account#mcp-ssh-setup (MCP generation stays in Account)',
            onClick: async () => {
              if (typeof window === 'undefined') return;
              window.location.assign('/account#mcp-ssh-setup');
            },
          } satisfies MenuItem,
        ]
      : []),
  ];

  const projectItems: MenuItem[] = [
    ...(onCopyProjectLink
      ? [
          {
            id: 'copy-project-link',
            label: 'Copy project link',
            icon: <Copy size={14} />,
            title: 'Copy a link that opens this project in the Workspace',
            onClick: onCopyProjectLink,
          } satisfies MenuItem,
        ]
      : []),
    { id: 'export-bundle', label: 'Export bundle (.zip)', icon: <Package size={14} />, onClick: onExportBundle },
    { id: 'sep-2', label: '────────', disabled: true, onClick: () => {} },
    { id: 'edit-project', label: 'Edit project', icon: <Pencil size={14} />, disabled: !canEdit, title: !canEdit ? 'No edit access' : undefined, onClick: onEditProject },
  ];

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu
        label={
          <>
            <Plus size={14} /> New
          </>
        }
        disabled={newDisabled}
        title={newTitle}
        items={newItems}
      />

      <DropdownMenu
        label={<>RAG</>}
        items={ragItems}
      />

      <DropdownMenu
        label={<>Project</>}
        items={projectItems}
      />
    </div>
  );
}
