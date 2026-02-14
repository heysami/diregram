'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useAuth } from '@/hooks/use-auth';
import { useRemoteNexusDoc } from '@/hooks/use-remote-nexus-doc';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { loadTestingStore } from '@/lib/testing-store';
import { loadFlowTabProcessReferences } from '@/lib/flowtab-process-references';
import { buildTreeTestModel, type TreeTestModel } from '@/lib/testing/tree-test-model';
import { TreeTestRunner } from '@/components/testing/TreeTestRunner';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';

export type NexusTestSpec = {
  id: string;
  fileId?: string;
  testId: string;
};

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function NexusTestBlock({
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
  const parsed = safeJsonParse(raw);
  const spec = parsed as NexusTestSpec | null;

  const { configured, ready, supabase, user } = useAuth();
  const supabaseMode = configured && !user?.isLocalAdmin;
  const fileId = typeof spec?.fileId === 'string' && spec.fileId.trim() ? spec.fileId.trim() : null;

  const remote = useRemoteNexusDoc({ fileId, supabaseMode, ready, supabase: supabase || null });
  const targetDoc = fileId ? remote.doc : hostDoc;

  const [docRev, setDocRev] = useState(0);
  useEffect(() => {
    if (!targetDoc) return;
    const yText = targetDoc.getText('nexus');
    const update = () => setDocRev((n) => n + 1);
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [targetDoc]);

  const model = useMemo<TreeTestModel | null>(() => {
    void docRev;
    if (!targetDoc) return null;
    if (!spec?.testId) return { kind: 'error', message: 'Missing `testId` in `nexus-test` spec.' };

    const store = loadTestingStore(targetDoc);
    const selectedTest = store.tests.find((t) => t.id === spec.testId) || null;
    if (!selectedTest) {
      return { kind: 'error', message: `Test not found: ${spec.testId}` };
    }

    const roots = parseNexusMarkdown(targetDoc.getText('nexus').toString());
    const flowRoots = roots.filter((r) => (r.metadata as any)?.flowTab);
    const mainRoots = roots.filter((r) => !(r.metadata as any)?.flowTab);
    const flowRefs = loadFlowTabProcessReferences(targetDoc);

    return buildTreeTestModel({ doc: targetDoc, selectedTest, mainRoots, flowRoots, flowRefs });
  }, [targetDoc, spec?.testId, docRev]);

  if (!spec || typeof spec.testId !== 'string') {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Invalid `nexus-test` JSON.
      </div>
    );
  }

  if (!targetDoc || !model) {
    return (
      <div className="my-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">Loading test…</div>
    );
  }

  const wrap = (children: any) => {
    if (!commentMode) return children;
    const targetKey = buildNoteEmbedCommentTargetKey(spec.id || 'test');
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={(e) => {
          e.stopPropagation();
          onOpenComments?.({ targetKey, targetLabel: `Embed · test` });
        }}
        title="Add/view comments for this embed"
      >
        {children}
      </button>
    );
  };

  return wrap(
    <div className="my-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b bg-slate-50 text-[11px] font-semibold text-slate-700">
        Test <span className="font-mono opacity-70">{spec.testId}</span>
      </div>
      <div className="p-3">
        {model.kind === 'error' ? (
          <div className="text-sm text-red-700">{model.message}</div>
        ) : (
          <TreeTestRunner doc={targetDoc} model={model} />
        )}
      </div>
    </div>,
  );
}

