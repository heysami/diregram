'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Pencil, Plus } from 'lucide-react';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';
import type { PresenceController } from '@/lib/presence';
import { SystemFlowEditor } from '@/components/SystemFlowEditor';
import type { ToolType } from '@/components/Toolbar';

export function SystemFlowsCanvas({
  doc,
  presence,
  activeTool,
  showComments,
  showAnnotations,
  onOpenComments,
}: {
  doc: Y.Doc;
  presence?: PresenceController | null;
  activeTool: ToolType;
  showComments: boolean;
  showAnnotations: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string; scrollToThreadId?: string }) => void;
}) {
  const [systemFlowRoots, setSystemFlowRoots] = useState<NexusNode[]>([]);
  const [selectedSfid, setSelectedSfid] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const parsed = parseNexusMarkdown(yText.toString());
      const roots: NexusNode[] = [];
      const visited = new Set<string>();
      const visit = (n: NexusNode) => {
        if (!n || !n.id) return;
        if (visited.has(n.id)) return;
        visited.add(n.id);

        if ((n.metadata as any)?.systemFlow) roots.push(n);

        n.children.forEach(visit);
        if (n.isHub && n.variants) {
          n.variants.forEach((v) => {
            visit(v);
            v.children?.forEach?.(visit);
          });
        }
      };
      parsed.forEach(visit);
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
      const yText = doc.getText('nexus');
      const current = yText.toString();
      const lines = current.split('\n');
      const token = `<!-- sfid:${selectedSfid} -->`;
      let idx = lines.findIndex((l) => l.includes(token));
      if (idx === -1 && selectedRoot) idx = selectedRoot.lineIndex;
      if (idx < 0 || idx >= lines.length) return;

      const line = lines[idx];
      const indent = line.match(/^(\s*)/)?.[1] || '';
      const afterIndent = line.slice(indent.length);
      const a = afterIndent.indexOf(' #');
      const b = afterIndent.indexOf(' <!--');
      const cut = Math.min(...[a, b].filter((n) => n >= 0).concat([afterIndent.length]));
      const suffix = afterIndent.slice(cut);
      const nextLine = `${indent}${nextName}${suffix}`;
      if (nextLine === line) return;

      doc.transact(() => {
        lines[idx] = nextLine;
        yText.delete(0, yText.length);
        yText.insert(0, lines.join('\n'));
      });
    },
    [doc, selectedRoot, selectedSfid],
  );

  const nextSystemFlowSfid = () => {
    let max = 0;
    systemFlowRoots.forEach((r) => {
      const sfid = (r.metadata as any)?.sfid;
      const m = typeof sfid === 'string' ? sfid.match(/^systemflow-(\d+)$/) : null;
      if (m) max = Math.max(max, Number(m[1]));
    });
    return `systemflow-${max + 1}`;
  };

  const createNewSystemFlow = () => {
    const sfid = nextSystemFlowSfid();
    const name = `System Flow ${sfid.split('-')[1]}`;
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
      <div className="w-72 m-4 mac-window overflow-hidden">
        <div className="mac-titlebar">
          <div className="mac-title">System Flows</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={createNewSystemFlow} className="mac-btn" title="Create new system flow">
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="p-2 overflow-auto">
          {systemFlowRoots.length === 0 ? (
            <div className="p-2 text-xs text-slate-500">
              No system flows yet. Click <span className="font-semibold">New</span> to create one.
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
                    className={`w-full px-2 py-2 text-left text-xs border mac-double-outline ${
                      selectedSfid === sfid ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'
                    }`}
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
                    title="Rename system flow"
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
              />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 mac-window overflow-hidden">
            <div className="mac-titlebar">
              <div className="mac-title">System Flow</div>
            </div>
            <div className="p-4 text-sm text-slate-700">Select a system flow on the left…</div>
          </div>
        )}
      </div>
    </div>
  );
}

