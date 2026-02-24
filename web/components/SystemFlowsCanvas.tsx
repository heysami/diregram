'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Pencil, Plus, Save, LayoutTemplate, Trash2 } from 'lucide-react';
import type { NexusNode } from '@/types/nexus';
import type { PresenceController } from '@/lib/presence';
import { SystemFlowEditor } from '@/components/SystemFlowEditor';
import type { ToolType } from '@/components/Toolbar';
import type { WorkspaceFileLite as TemplateWorkspaceFileLite } from '@/components/templates/InsertFromTemplateModal';
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { InsertFromTemplateModal } from '@/components/templates/InsertFromTemplateModal';
import { SaveTemplateModal } from '@/components/templates/SaveTemplateModal';
import { loadSystemFlowStateFromDoc, saveSystemFlowStateToDoc, type SystemFlowState } from '@/lib/system-flow-storage';
import { collectSystemFlowRootsFromMarkdown, deleteSystemFlowFromDoc, nextSystemFlowSfid } from '@/lib/nexus-systemflow-ops';
import { renameLineByTokenOrIndex } from '@/lib/nexus-markdown-edit';

export function SystemFlowsCanvas({
  doc,
  fileId: _fileId,
  presence,
  activeTool,
  showComments,
  showAnnotations,
  onOpenComments,
  templateScope,
  onTemplateScopeChange,
  templateFiles,
  loadTemplateMarkdown,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: {
  doc: Y.Doc;
  /** Current file id (reserved for clipboard constraints; not used by tech flow yet). */
  fileId: string | null;
  presence?: PresenceController | null;
  activeTool: ToolType;
  showComments: boolean;
  showAnnotations: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
  templateScope?: 'project' | 'account' | 'global';
  onTemplateScopeChange?: (next: 'project' | 'account' | 'global') => void;
  templateFiles?: TemplateWorkspaceFileLite[];
  loadTemplateMarkdown?: (fileId: string) => Promise<string>;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}) {
  const viewBarSpacer = <div className="h-12" aria-hidden />;
  const [systemFlowRoots, setSystemFlowRoots] = useState<NexusNode[]>([]);
  const [selectedSfid, setSelectedSfid] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [insertSystemFlowFromTemplateOpen, setInsertSystemFlowFromTemplateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [pendingTemplatePayload, setPendingTemplatePayload] = useState<string | null>(null);
  const [pendingTemplateHeaderBase, setPendingTemplateHeaderBase] = useState<Omit<NexusTemplateHeader, 'name'> | null>(null);
  const [pendingTemplateDefaultName, setPendingTemplateDefaultName] = useState<string>('Template');

  type SystemFlowTemplateV1 = {
    version: 1;
    name: string;
    state: SystemFlowState;
  };

  const parseSystemFlowTemplate = (rendered: string): SystemFlowTemplateV1 => {
    const src = String(rendered || '').replace(/\r\n?/g, '\n').trim();
    const m = src.match(/```nexus-systemflow[ \t]*\n([\s\S]*?)\n```/);
    const body = (m ? m[1] : src).trim();
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid tech flow template payload.');
    const r = parsed as Record<string, unknown>;
    if (r.version !== 1) throw new Error('Unsupported tech flow template version.');
    const name = typeof r.name === 'string' ? r.name : 'Tech Flow';
    const state = r.state as unknown;
    if (!state || typeof state !== 'object') throw new Error('Missing tech flow state.');
    return { version: 1, name, state: state as SystemFlowState };
  };

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const roots = collectSystemFlowRootsFromMarkdown(yText.toString());
      setSystemFlowRoots(roots);
      if (!selectedSfid && roots.length) {
        const sfid = (roots[0].metadata as any)?.sfid || roots[0].id;
        setSelectedSfid(sfid);
      }
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, selectedSfid]);

  const selectedRoot = useMemo(() => {
    if (!selectedSfid) return null;
    return systemFlowRoots.find((r) => ((r.metadata as any)?.sfid || r.id) === selectedSfid) || null;
  }, [systemFlowRoots, selectedSfid]);

  const commitRenameSelected = useCallback(
    (nextNameRaw: string) => {
      if (!selectedSfid) return;
      const nextName = nextNameRaw.trim();
      if (!nextName) return;
      const token = `<!-- sfid:${selectedSfid} -->`;
      renameLineByTokenOrIndex({
        doc,
        token,
        fallbackIndex: selectedRoot ? selectedRoot.lineIndex : -1,
        nextTitleRaw: nextName,
      });
    },
    [doc, selectedRoot, selectedSfid],
  );

  const deleteSelectedSystemFlow = useCallback(() => {
    if (!selectedSfid || !selectedRoot) return;
    const ok = window.confirm('Delete this tech flow? This removes the whole tech flow and its saved diagram state.');
    if (!ok) return;
    deleteSystemFlowFromDoc({ doc, sfid: selectedSfid, root: selectedRoot });

    setSelectedSfid(null);
  }, [doc, selectedRoot, selectedSfid]);

  const saveSelectedSystemFlowAsTemplate = useCallback(async () => {
    if (!selectedSfid || !selectedRoot) return;
    if (!onSaveTemplateFile) return;
    const state = loadSystemFlowStateFromDoc(doc, selectedSfid);
    const payload: SystemFlowTemplateV1 = { version: 1, name: selectedRoot.content || 'Tech Flow', state };
    const payloadMd = ['```nexus-systemflow', JSON.stringify(payload, null, 2), '```', ''].join('\n');
    const headerBase: Omit<NexusTemplateHeader, 'name'> = {
      version: 1,
      ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
      targetKind: 'diagram',
      mode: 'appendFragment',
      fragmentKind: 'systemFlow',
      tags: ['systemFlow'],
    };
    setPendingTemplatePayload(payloadMd);
    setPendingTemplateHeaderBase(headerBase);
    setPendingTemplateDefaultName(payload.name);
    setSaveTemplateOpen(true);
  }, [doc, onSaveTemplateFile, selectedRoot, selectedSfid, templateSourceLabel]);

  const insertSystemFlowFromTemplate = useCallback(
    async (rendered: string) => {
      const tpl = parseSystemFlowTemplate(rendered);
      const sfid = nextSystemFlowSfid(systemFlowRoots);
      const name = String(tpl.name || `Tech Flow ${sfid.split('-')[1]}`);
      const yText = doc.getText('nexus');
      const text = yText.toString();
      const sep = text.indexOf('\n---\n');
      const insertAt = sep !== -1 ? sep : text.length;
      const prefix = text.slice(0, insertAt);
      const suffix = text.slice(insertAt);
      const block = `${prefix}${prefix.endsWith('\n') || prefix.length === 0 ? '' : '\n'}\n${name} #systemflow# <!-- sfid:${sfid} -->\n${suffix}`;
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, block);
      });
      saveSystemFlowStateToDoc(doc, sfid, tpl.state);
      setSelectedSfid(sfid);
    },
    [doc, parseSystemFlowTemplate, systemFlowRoots],
  );

  const createNewSystemFlow = () => {
    const sfid = nextSystemFlowSfid(systemFlowRoots);
    const name = `Tech Flow ${sfid.split('-')[1]}`;
    const yText = doc.getText('nexus');
    const text = yText.toString();
    const sep = text.indexOf('\n---\n');
    const insertAt = sep !== -1 ? sep : text.length;
    const prefix = text.slice(0, insertAt);
    const suffix = text.slice(insertAt);
    const block = `${prefix}${prefix.endsWith('\n') || prefix.length === 0 ? '' : '\n'}\n${name} #systemflow# <!-- sfid:${sfid} -->\n${suffix}`;
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, block);
    });
    setSelectedSfid(sfid);
  };

  // Presence view is tracked at the EditorApp level (activeView), but we still touch it here
  // so TS keeps the prop wired and future cursor support can use it.
  const _presence = presence;

  return (
    <div className="absolute inset-0 flex mac-canvas-bg">
      <div className="w-[280px] max-w-[35vw] min-w-[200px] m-4 mac-window overflow-hidden shrink">
        {viewBarSpacer}
        <div className="mac-titlebar">
          <div className="mac-title">Tech Flows</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {selectedRoot && onSaveTemplateFile ? (
              <button
                type="button"
                className="mac-btn mac-btn--icon-sm"
                onClick={() => {
                  void saveSelectedSystemFlowAsTemplate().catch(() => {});
                }}
                title="Save this tech flow as a template"
                aria-label="Save template"
              >
                <Save size={16} />
              </button>
            ) : null}
            {templateFiles && loadTemplateMarkdown ? (
              <button
                type="button"
                className="mac-btn mac-btn--icon-sm"
                onClick={() => setInsertSystemFlowFromTemplateOpen(true)}
                title="Create a new tech flow from a template"
                aria-label="New from template"
              >
                <LayoutTemplate size={16} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={createNewSystemFlow}
              className="mac-btn mac-btn--icon-sm"
              title="Create new tech flow"
              aria-label="New tech flow"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="p-2 overflow-auto">
          {systemFlowRoots.length === 0 ? (
            <div className="p-2 text-xs text-slate-500">
              No tech flows yet. Click <span className="font-semibold">New</span> to create one.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {systemFlowRoots.map((r) => {
                const sfid = (r.metadata as any)?.sfid || r.id;
                return (
                  <button
                    key={sfid}
                    type="button"
                    onClick={() => setSelectedSfid(sfid)}
                    className="w-full px-2 py-2 text-left text-xs mac-interactive-row"
                    aria-selected={selectedSfid === sfid}
                  >
                    <div className="font-medium truncate">{r.content}</div>
                    <div className="text-[10px] text-slate-400 truncate">{sfid}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative m-4 ml-0">
        {selectedRoot ? (
          <div className="absolute inset-0 mac-window overflow-hidden flex flex-col">
            <div className="mac-titlebar">
              <div className="mac-title">{selectedRoot.content}</div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                  type="button"
                  className="mac-btn"
                  title="Delete this tech flow"
                  onClick={deleteSelectedSystemFlow}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                {isRenaming ? (
                  <input
                    className="mac-field w-[260px]"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRenameSelected(renameDraft);
                        setIsRenaming(false);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsRenaming(false);
                        setRenameDraft('');
                      }
                    }}
                    onBlur={() => {
                      if (renameDraft.trim()) commitRenameSelected(renameDraft);
                      setIsRenaming(false);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="mac-btn"
                    onClick={() => {
                      setIsRenaming(true);
                      setRenameDraft(selectedRoot.content || '');
                    }}
                    title="Rename tech flow"
                  >
                    <Pencil size={12} />
                    Rename
                  </button>
                )}
              </div>
            </div>
            <div className="relative flex-1">
              <SystemFlowEditor
                doc={doc}
                sfid={selectedSfid || ((selectedRoot.metadata as any)?.sfid || selectedRoot.id)}
                activeTool={activeTool}
                showComments={showComments}
                showAnnotations={showAnnotations}
                onOpenComments={onOpenComments}
                presence={presence}
                templateScope={templateScope}
                onTemplateScopeChange={onTemplateScopeChange}
                templateFiles={templateFiles}
                loadTemplateMarkdown={loadTemplateMarkdown}
                onSaveTemplateFile={onSaveTemplateFile}
                templateSourceLabel={templateSourceLabel}
                globalTemplatesEnabled={globalTemplatesEnabled}
              />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 mac-window overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">Tech Flow</div>
            </div>
            <div className="p-4 text-sm text-slate-700">Select a tech flow on the left…</div>
          </div>
        )}
      </div>

      <InsertFromTemplateModal
        open={insertSystemFlowFromTemplateOpen}
        title="New tech flow from template"
        files={templateFiles || []}
        loadMarkdown={loadTemplateMarkdown || (async () => '')}
        accept={{ targetKind: 'diagram', mode: 'appendFragment', fragmentKind: 'systemFlow' }}
        scope={
          templateScope && onTemplateScopeChange
            ? {
                value: templateScope,
                options: [
                  { id: 'project', label: 'This project' },
                  { id: 'account', label: 'Account' },
                  ...(globalTemplatesEnabled ? [{ id: 'global', label: 'Global' }] : []),
                ],
                onChange: (next) => onTemplateScopeChange(next as any),
              }
            : undefined
        }
        onClose={() => setInsertSystemFlowFromTemplateOpen(false)}
        onInsert={async ({ content }) => {
          await insertSystemFlowFromTemplate(content);
        }}
      />

      <SaveTemplateModal
        open={saveTemplateOpen}
        title="Save template"
        defaultName={pendingTemplateDefaultName}
        defaultScope="project"
        onClose={() => setSaveTemplateOpen(false)}
        onSave={async ({ name, scope }) => {
          if (!onSaveTemplateFile) throw new Error('Template saving unavailable.');
          if (!pendingTemplatePayload || !pendingTemplateHeaderBase) throw new Error('No template content to save.');
          const header: NexusTemplateHeader = { ...pendingTemplateHeaderBase, name };
          const content = upsertTemplateHeader(pendingTemplatePayload, header);
          await onSaveTemplateFile({ name, content, scope });
          setPendingTemplatePayload(null);
          setPendingTemplateHeaderBase(null);
        }}
      />
    </div>
  );
}
