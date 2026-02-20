'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, Eye, FileText, FlaskConical, Network, Package, Pencil, Plus, Share2, Table } from 'lucide-react';

type MenuItem = {
  id: string;
  label: string;
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
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
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
  onNewGrid,
  onNewNote,
  onNewVision,
  onNewTest,
  onBuildKnowledgeBase,
  onCopyMcpAccountUrl,
  onCopyProjectLink,
  onExportBundle,
  onExportKg,
  onEditProject,
}: {
  projectTab: 'files' | 'templates';
  canEdit: boolean;
  onNewMap: () => void;
  onNewFromTemplate: () => void;
  onNewGrid: () => void;
  onNewNote: () => void;
  onNewVision: () => void;
  onNewTest: () => void;
  onBuildKnowledgeBase?: () => void | Promise<void>;
  onCopyMcpAccountUrl?: () => void | Promise<void>;
  onCopyProjectLink?: () => void | Promise<void>;
  onExportBundle: () => void | Promise<void>;
  onExportKg: () => void | Promise<void>;
  onEditProject: () => void;
}) {
  const newDisabled = projectTab !== 'files' || !canEdit;
  const newTitle = projectTab !== 'files' ? 'Switch to Files tab to create new files' : !canEdit ? 'No edit access' : 'Create new content';

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
        items={[
          { id: 'new-map', label: 'Map', icon: <Network size={14} />, onClick: onNewMap },
          { id: 'new-from-template', label: 'From template…', icon: <Copy size={14} />, onClick: onNewFromTemplate },
          { id: 'sep-1', label: '────────', disabled: true, onClick: () => {} },
          { id: 'new-grid', label: 'Grid', icon: <Table size={14} />, onClick: onNewGrid },
          { id: 'new-note', label: 'Note', icon: <FileText size={14} />, onClick: onNewNote },
          { id: 'new-vision', label: 'Vision', icon: <Eye size={14} />, onClick: onNewVision },
          { id: 'new-test', label: 'Test', icon: <FlaskConical size={14} />, onClick: onNewTest },
        ]}
      />

      <DropdownMenu
        label={<>Project</>}
        items={[
          {
            id: 'build-kb',
            label: 'Build knowledge base (RAG)',
            icon: <Share2 size={14} />,
            disabled: !onBuildKnowledgeBase,
            title: onBuildKnowledgeBase ? 'Generate embeddings + semantic KG for this project' : 'RAG ingestion is only available in Supabase mode',
            onClick: onBuildKnowledgeBase || (() => {}),
          },
          {
            id: 'copy-mcp-account',
            label: 'Copy MCP URL (account)',
            icon: <Copy size={14} />,
            disabled: !onCopyMcpAccountUrl,
            title: onCopyMcpAccountUrl ? 'Copy a single MCP URL that can access multiple projects (selection happens in tools)' : 'MCP sharing is only available in Supabase mode',
            onClick: onCopyMcpAccountUrl || (() => {}),
          },
          {
            id: 'copy-project-link',
            label: 'Copy project link',
            icon: <Copy size={14} />,
            disabled: !onCopyProjectLink,
            title: onCopyProjectLink ? 'Copy a link that opens this project in the Workspace' : undefined,
            onClick: onCopyProjectLink || (() => {}),
          },
          { id: 'export-bundle', label: 'Export bundle (.zip)', icon: <Package size={14} />, onClick: onExportBundle },
          { id: 'export-kg', label: 'Export semantic KG', icon: <Share2 size={14} />, onClick: onExportKg },
          { id: 'sep-2', label: '────────', disabled: true, onClick: () => {} },
          { id: 'edit-project', label: 'Edit project', icon: <Pencil size={14} />, disabled: !canEdit, title: !canEdit ? 'No edit access' : undefined, onClick: onEditProject },
        ]}
      />
    </div>
  );
}

