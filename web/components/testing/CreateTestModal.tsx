'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { saveTestingStore, type TestingStore, type TestingTest } from '@/lib/testing-store';
import type { FlowTabProcessReferenceMap } from '@/lib/flowtab-process-references';
import { singleLine } from '@/lib/testing/text';

export function CreateTestModal({
  doc,
  store,
  flowRoots,
  flowRefs,
  onClose,
  onCreated,
}: {
  doc: Y.Doc;
  store: TestingStore;
  flowRoots: NexusNode[];
  flowRefs: FlowTabProcessReferenceMap;
  onClose: () => void;
  onCreated: (t: TestingTest) => void;
}) {
  const [name, setName] = useState('New test');
  const [flowRootId, setFlowRootId] = useState<string>(flowRoots[0]?.id || '');
  const [flowNodeId, setFlowNodeId] = useState<string>('');

  const flowRoot = useMemo(() => flowRoots.find((r) => r.id === flowRootId) || null, [flowRoots, flowRootId]);

  const flowNodeOptions = useMemo(() => {
    if (!flowRoot) return [] as Array<{ id: string; label: string; depth: number; hasRef: boolean }>;
    const out: Array<{ id: string; label: string; depth: number; hasRef: boolean }> = [];
    const visited = new Set<string>();
    const walk = (n: NexusNode, depth: number) => {
      if (visited.has(n.id)) return;
      visited.add(n.id);
      out.push({ id: n.id, label: n.content, depth, hasRef: Boolean(flowRefs[n.id]) });
      n.children.forEach((c) => walk(c, depth + 1));
      if (n.isHub && n.variants) n.variants.forEach((v) => walk(v, depth + 1));
    };
    walk(flowRoot, 0);
    return out;
  }, [flowRoot, flowRefs]);

  useEffect(() => {
    const firstWithRef = flowNodeOptions.find((o) => o.hasRef);
    setFlowNodeId(firstWithRef?.id || flowRootId || '');
  }, [flowRootId, flowNodeOptions]);

  const canCreate = Boolean(name.trim()) && Boolean(flowNodeId) && Boolean(flowRefs[flowNodeId]);

  const create = () => {
    if (!canCreate) return;
    const nextIdNum = store.nextId ?? 1;
    const test: TestingTest = {
      id: `test-${nextIdNum}`,
      name: name.trim(),
      flowNodeId,
      flowRootId,
      createdAt: Date.now(),
    };
    const next: TestingStore = { ...store, nextId: nextIdNum + 1, tests: [test, ...store.tests] };
    saveTestingStore(doc, next);
    onCreated(test);
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center">
      <div className="w-[92vw] max-w-3xl overflow-hidden mac-window">
        <div className="mac-titlebar">
          <div className="mac-title">Create test</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={onClose} className="mac-btn" title="Close">
              Close
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-2">Name</div>
            <input
              className="mac-field w-full h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Test name"
            />

            <div className="mt-4 text-xs font-semibold text-slate-700 mb-2">Flow</div>
            <select
              className="mac-field w-full h-9"
              value={flowRootId}
              onChange={(e) => setFlowRootId(e.target.value)}
              disabled={flowRoots.length === 0}
            >
              {flowRoots.map((r) => (
                <option key={r.id} value={r.id}>
                  {singleLine(r.content)}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-slate-500">
              Tip: assign references in the Flow tab via <span className="font-semibold">Reference…</span>.
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-2">Flow node (must have reference)</div>
            <div className="border border-slate-200 max-h-[50vh] overflow-auto">
              {flowNodeOptions.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No flow selected.</div>
              ) : (
                flowNodeOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setFlowNodeId(o.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      flowNodeId === o.id ? 'bg-blue-50' : ''
                    } ${o.hasRef ? 'text-slate-900' : 'text-slate-400'}`}
                    style={{ paddingLeft: 12 + o.depth * 14 }}
                    title={o.hasRef ? 'Selectable' : 'No reference assigned'}
                  >
                    {singleLine(o.label)} {o.hasRef ? <span className="text-[11px] text-slate-500">(ref)</span> : null}
                  </button>
                ))
              )}
            </div>
            {!flowRefs[flowNodeId] ? (
              <div className="mt-2 text-[11px] text-red-600">Pick a node that has a Flow→Process reference.</div>
            ) : null}
          </div>
        </div>

        <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="mac-btn h-8"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={create}
            disabled={!canCreate}
            className="mac-btn mac-btn--primary h-8 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

