'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { useAuth } from '@/hooks/use-auth';
import { useRemoteNexusDoc } from '@/hooks/use-remote-nexus-doc';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import { loadFlowTabProcessReferences } from '@/lib/flowtab-process-references';
import { buildTreeTestModel, type TreeTestModel } from '@/lib/testing/tree-test-model';
import { TreeTestRunner } from '@/components/testing/TreeTestRunner';
import { buildNoteEmbedCommentTargetKey } from '@/lib/note-comments';
import { loadTestDoc } from '@/lib/testjson';

export type NexusTestSpec = {
  id: string;
  /** New path: link to a test file (DocKind='test'). */
  testFileId?: string;
  /** Legacy fields (no longer supported). */
  fileId?: string;
  testId?: string;
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
  const testFileId = typeof spec?.testFileId === 'string' && spec.testFileId.trim() ? spec.testFileId.trim() : null;
  const testRemote = useRemoteNexusDoc({ fileId: testFileId, supabaseMode, ready, supabase: supabase || null });
  const testDocY = testFileId ? testRemote.doc : null;

  const [docRev, setDocRev] = useState(0);
  useEffect(() => {
    const ytexts: Array<Y.Text> = [];
    const update = () => setDocRev((n) => n + 1);
    try {
      if (testDocY) ytexts.push(testDocY.getText('nexus'));
    } catch {
      // ignore
    }
    ytexts.forEach((t) => t.observe(update));
    return () => ytexts.forEach((t) => t.unobserve(update));
  }, [testDocY]);

  const testDocParsed = useMemo(() => {
    void docRev;
    if (!testDocY) return null;
    const md = testDocY.getText('nexus').toString();
    return loadTestDoc(md).doc;
  }, [testDocY, docRev]);

  const sourceFileIdRaw = testDocParsed ? String(testDocParsed.sourceFileId || '').trim() : null;
  const sourceFileId = sourceFileIdRaw && sourceFileIdRaw.startsWith('<') ? null : sourceFileIdRaw;
  const sourceRemote = useRemoteNexusDoc({ fileId: sourceFileId, supabaseMode, ready, supabase: supabase || null });
  const sourceDoc = sourceFileId ? sourceRemote.doc : null;
  useEffect(() => {
    if (!sourceDoc) return;
    const yText = sourceDoc.getText('nexus');
    const update = () => setDocRev((n) => n + 1);
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [sourceDoc]);

  const model = useMemo<TreeTestModel | null>(() => {
    void docRev;
    if (!testFileId) return null;
    if (!testDocY) return null;
    if (!testDocParsed) return { kind: 'error', message: 'Invalid or missing `testjson` in linked test file.' };
    if (!sourceDoc) return null;

    const selectedTest: any = {
      id: 'test-file',
      name: testDocParsed.name,
      flowRootId: testDocParsed.flowRootId,
      flowNodeId: testDocParsed.flowNodeId,
      createdAt: typeof testDocParsed.createdAt === 'number' ? testDocParsed.createdAt : Date.now(),
    };

    const roots = parseNexusMarkdown(sourceDoc.getText('nexus').toString());
    const flowRoots = roots.filter((r) => (r.metadata as any)?.flowTab);
    const mainRoots = roots.filter((r) => !(r.metadata as any)?.flowTab);
    const flowRefs = loadFlowTabProcessReferences(sourceDoc);
    return buildTreeTestModel({ doc: sourceDoc, selectedTest, mainRoots, flowRoots, flowRefs });
  }, [sourceDoc, docRev, testDocParsed, testDocY, testFileId]);

  if (!spec) {
    return (
      <div className="my-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        Invalid `nexus-test` JSON.
      </div>
    );
  }

  if (!testFileId && (spec.testId || spec.fileId)) {
    return (
      <div className="my-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This is a legacy <span className="font-mono">nexus-test</span> embed. Relink it to a test file.
      </div>
    );
  }

  if (!testFileId || !model) {
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
        Test{' '}
        <span className="font-mono opacity-70">
          {`file:${testFileId.slice(0, 8)}…`}
        </span>
      </div>
      <div className="p-3">
        {model.kind === 'error' ? (
          <div className="text-sm text-red-700">{model.message}</div>
        ) : (
          <TreeTestRunner doc={sourceDoc as any} model={model} />
        )}
      </div>
    </div>,
  );
}

