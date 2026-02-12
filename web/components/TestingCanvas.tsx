'use client';

import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { Plus, Trash2 } from 'lucide-react';
import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';
import { loadTestingStore, saveTestingStore, type TestingStore, type TestingTest } from '@/lib/testing-store';
import { loadFlowTabProcessReferences } from '@/lib/flowtab-process-references';
import { buildTreeTestModel, type TreeTestModel } from '@/lib/testing/tree-test-model';
import { TreeTestRunner } from '@/components/testing/TreeTestRunner';
import { CreateTestModal } from '@/components/testing/CreateTestModal';

type Props = { doc: Y.Doc };

export function TestingCanvas({ doc }: Props) {
  const [store, setStore] = useState<TestingStore>(() => loadTestingStore(doc));
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [docRev, setDocRev] = useState(0);

  // Keep store reactive to doc changes (collab).
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      setDocRev((n) => n + 1);
      setStore(loadTestingStore(doc));
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  // Ensure selection always points at an existing test.
  useEffect(() => {
    if (store.tests.length === 0) {
      setSelectedTestId(null);
      return;
    }
    if (selectedTestId && store.tests.some((t) => t.id === selectedTestId)) return;
    setSelectedTestId(store.tests[0].id);
  }, [store.tests, selectedTestId]);

  const selectedTest = useMemo<TestingTest | null>(() => {
    if (!selectedTestId) return null;
    return store.tests.find((t) => t.id === selectedTestId) || null;
  }, [store.tests, selectedTestId]);

  const deleteTest = (id: string) => {
    const next: TestingStore = { ...store, tests: store.tests.filter((t) => t.id !== id) };
    saveTestingStore(doc, next);
    setStore(next);
    if (selectedTestId === id) setSelectedTestId(next.tests[0]?.id ?? null);
  };

  const parsedRoots = useMemo(() => parseNexusMarkdown(doc.getText('nexus').toString()), [doc, docRev]);

  const flowRoots = useMemo(() => parsedRoots.filter((r) => (r.metadata as any)?.flowTab), [parsedRoots]);
  const mainRoots = useMemo(() => parsedRoots.filter((r) => !(r.metadata as any)?.flowTab), [parsedRoots]);
  const flowRefs = useMemo(() => loadFlowTabProcessReferences(doc), [doc, docRev]);

  const [model, setModel] = useState<TreeTestModel | null>(null);

  useEffect(() => {
    if (!selectedTest) {
      setModel(null);
      return;
    }
    setModel(
      buildTreeTestModel({
        doc,
        selectedTest,
        mainRoots,
        flowRoots,
        flowRefs,
      }),
    );
  }, [selectedTest, flowRefs, mainRoots, flowRoots, doc]);

  return (
    <div className="absolute inset-0 flex mac-canvas-bg">
      <div className="w-80 m-4 mac-window overflow-hidden flex flex-col">
        <div className="mac-titlebar">
          <div className="mac-title">Tests</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            <button type="button" onClick={() => setIsCreateOpen(true)} className="mac-btn" title="Create new test">
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="p-2 flex-1 overflow-auto">
          {store.tests.length === 0 ? (
            <div className="p-2 text-xs text-slate-500">
              No tests yet. Click <span className="font-semibold">New</span> to create one.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {store.tests.map((t) => (
                <div
                  key={t.id}
                  className={`w-full border mac-double-outline ${selectedTestId === t.id ? 'mac-shadow-hard mac-fill--hatch' : 'bg-white'}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTestId(t.id)}
                    className="w-full px-2 py-2 text-left"
                    title="Open test"
                  >
                    <div className="text-xs font-medium text-slate-900 truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{t.id}</div>
                  </button>
                  <div className="px-2 pb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteTest(t.id)}
                      className="mac-btn"
                      title="Delete test"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative m-4 ml-0">
        {selectedTest ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 mac-window overflow-hidden">
              <div className="mac-titlebar">
                <div className="mac-title">{selectedTest.name}</div>
              </div>
              <div className="px-4 py-2 text-[11px] opacity-80">
                Source flow node: <span className="font-mono">{selectedTest.flowNodeId}</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {model?.kind === 'error' ? (
                <div className="p-4 text-sm text-red-700">{model.message}</div>
              ) : model?.kind === 'ready' ? (
                <TreeTestRunner key={selectedTest.id} doc={doc} model={model} />
              ) : (
                <div className="p-4 text-xs text-slate-500">Loading…</div>
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            Create a test to start tree testing.
          </div>
        )}

        {isCreateOpen ? (
          <CreateTestModal
            doc={doc}
            store={store}
            flowRoots={flowRoots}
            flowRefs={flowRefs}
            onClose={() => setIsCreateOpen(false)}
            onCreated={(t) => {
              setIsCreateOpen(false);
              setSelectedTestId(t.id);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

