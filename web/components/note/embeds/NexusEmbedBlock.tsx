'use client';

import { useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useRemoteNexusDoc } from '@/hooks/use-remote-nexus-doc';
import { SystemFlowEditor } from '@/components/SystemFlowEditor';
import { NexusCanvas } from '@/components/NexusCanvas';
import { DataObjectsCanvas } from '@/components/DataObjectsCanvas';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';
import { loadVisionDoc } from '@/lib/visionjson';

export type NexusEmbedSpec =
  | {
      id: string;
      kind: 'systemflow';
      fileId?: string;
      /** System flow id, e.g. "systemflow-1" */
      ref: string;
    }
  | {
      id: string;
      kind: 'canvas';
      fileId?: string;
      /** Optional: focus a specific node id (same semantics as `NexusCanvas.rootFocusId`) */
      rootFocusId?: string;
    }
  | {
      id: string;
      kind: 'dataObjects';
      fileId?: string;
    }
  | {
      id: string;
      kind: 'visionCard';
      fileId?: string;
      cardId: string;
    };

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function NexusEmbedBlock({
  hostDoc,
  raw,
  commentMode = false,
  onOpenComments,
}: {
  hostDoc: Y.Doc;
  raw: string;
  commentMode?: boolean;
  onOpenComments?: (info: { targetKey: string; targetLabel?: string }) => void;
}) {
  const router = useRouter();
  const parsed = safeJsonParse(raw);
  const spec = parsed as NexusEmbedSpec | null;

  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;

  const fileId = useMemo(() => {
    const fid = (spec as any)?.fileId;
    return typeof fid === 'string' && fid.trim().length ? fid.trim() : null;
  }, [spec]);

  const remote = useRemoteNexusDoc({ fileId, supabaseMode, ready, supabase: supabase || null });
  const targetDoc = fileId ? remote.doc : hostDoc;

  const [activeVariantState, setActiveVariantState] = useState<Record<string, Record<string, string>>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set());

  if (!spec || typeof (spec as any).id !== 'string' || typeof (spec as any).kind !== 'string') {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Invalid `nexus-embed` JSON.
      </div>
    );
  }

  if (!targetDoc) {
    return (
      <div className="my-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
        Loading embed…
      </div>
    );
  }

  const wrap = (children: any) => {
    if (!commentMode) return children;
    const targetKey = buildNoteEmbedCommentTargetKey(spec.id);
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments?.({ targetKey, targetLabel: `Embed · ${spec.kind}` });
        }}
        title="Add/view comments for this embed"
      >
        {children}
      </button>
    );
  };

  if (spec.kind === 'systemflow') {
    return wrap(
      <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">
          System Flow <span className="font-mono opacity-70">{spec.ref}</span>
        </div>
        <div className="h-[420px] relative">
          <div className="absolute inset-0 pointer-events-none">
            <SystemFlowEditor
              doc={targetDoc}
              sfid={spec.ref}
              activeTool="select"
              showComments={false}
              showAnnotations={false}
            />
          </div>
        </div>
      </div>,
    );
  }

  if (spec.kind === 'canvas') {
    return wrap(
      <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">Canvas (read-only)</div>
        <div className="h-[420px] relative">
          <div className="absolute inset-0 pointer-events-none">
            <NexusCanvas
              doc={targetDoc}
              activeTool="select"
              layoutDirection="horizontal"
              mainLevel={1}
              initialFitToContent
              activeVariantState={activeVariantState}
              onActiveVariantChange={setActiveVariantState}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              expandedNodes={expandedNodes}
              onExpandedNodesChange={setExpandedNodes}
              getRunningNumber={() => undefined}
              getProcessRunningNumber={() => undefined}
              showComments={false}
              showAnnotations={false}
              rootFocusId={spec.rootFocusId}
            />
          </div>
        </div>
      </div>,
    );
  }

  if (spec.kind === 'dataObjects') {
    const roots = parseNexusMarkdown(targetDoc.getText('nexus').toString());
    return wrap(
      <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">Data Objects (read-only)</div>
        <div className="h-[420px] relative">
          <div className="absolute inset-0 pointer-events-none">
            <DataObjectsCanvas
              doc={targetDoc}
              roots={roots}
              activeTool="select"
              showComments={false}
              showAnnotations={false}
              initialFitToContent
            />
          </div>
        </div>
      </div>,
    );
  }

  if (spec.kind === 'visionCard') {
    const cardId = String((spec as any)?.cardId || '').trim();
    const { thumb, title } = (() => {
      try {
        if (!cardId) return { thumb: '', title: '' };
        const md = targetDoc.getText('nexus').toString();
        const loaded = loadVisionDoc(md);
        const snap: any = (loaded.doc as any)?.tldraw || null;
        const store = snap?.document?.store;
        if (!store || typeof store !== 'object') return { thumb: '', title: '' };
        const rec: any = (store as any)[cardId] || null;
        if (!rec || rec.typeName !== 'shape' || String(rec.type || '') !== 'nxcard') return { thumb: '', title: '' };
        const t = typeof rec?.props?.title === 'string' ? String(rec.props.title).trim() : '';
        const th = typeof rec?.props?.thumb === 'string' ? String(rec.props.thumb).trim() : '';
        return { thumb: th, title: t };
      } catch {
        return { thumb: '', title: '' };
      }
    })();

    const fileId = typeof (spec as any)?.fileId === 'string' ? String((spec as any).fileId).trim() : '';
    const canOpen = !!fileId && !!cardId && !commentMode;

    const body = (
      <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate">
            Vision card {title ? <span className="opacity-80">· {title}</span> : null}
          </div>
          <div className="font-mono text-[11px] opacity-70 truncate">{cardId || 'missing cardId'}</div>
        </div>
        <div className="p-3">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={title || 'Vision card'} className="w-full max-h-[320px] object-cover rounded border" />
          ) : (
            <div className="h-[180px] rounded border bg-slate-50 flex items-center justify-center text-xs text-slate-600">
              {cardId ? 'No thumbnail saved on this card yet.' : 'Set cardId to embed a vision card.'}
            </div>
          )}
        </div>
      </div>
    );

    return wrap(canOpen ? (
      <button
        type="button"
        className="w-full text-left"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/editor?file=${encodeURIComponent(fileId)}#${encodeURIComponent(cardId)}`);
        }}
        title="Open vision file and focus this card"
      >
        {body}
      </button>
    ) : (
      body
    ));
  }

  return null;
}

