import type * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import type { TestingTest } from '@/lib/testing-store';
import {
  type FlowTabProcessReference,
  type FlowTabProcessReferenceMap,
} from '@/lib/flowtab-process-references';
import { runTreeTest, type TreeTestRunState } from '@/lib/tree-testing';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';
import { resolveFlowTabProcessReference } from '@/lib/flowtab-reference-resolver';

export type InnerFlowStep = {
  flowNodeId: string;
  targetNodeId: string;
  expandedRunningNumber: number;
  gridNodeKey: string;
};

export type TreeTestModel =
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      core: Extract<TreeTestRunState, { kind: 'ready' }>;
      runningNumberByNodeId: Map<string, number>;
      innerSequenceByTargetNodeId: Map<string, InnerFlowStep[]>;
    };

export function buildTreeTestModel(opts: {
  doc: Y.Doc;
  selectedTest: TestingTest;
  mainRoots: NexusNode[];
  flowRoots: NexusNode[];
  flowRefs: FlowTabProcessReferenceMap;
}): TreeTestModel {
  const { doc, selectedTest, mainRoots, flowRoots, flowRefs } = opts;
  const ref = flowRefs[selectedTest.flowNodeId];
  if (!ref) {
    return {
      kind: 'error',
      message:
        'This test’s source flow node no longer has a reference to the main canvas. Re-assign the reference in Flow tab, then re-open this test.',
    };
  }

  const resolvedRef = resolveFlowTabProcessReference({ doc, mainRoots, reference: ref });
  const core = runTreeTest({ roots: mainRoots, reference: resolvedRef });
  if (core.kind === 'error') return core;

  const markdown = doc.getText('nexus').toString();
  const lineToExpId = extractExpandedIdsFromMarkdown(markdown);
  const runningNumberByNodeId = new Map<string, number>();
  core.nodeById.forEach((n, id) => {
    const rn = lineToExpId.get(n.lineIndex);
    if (typeof rn === 'number' && Number.isFinite(rn)) runningNumberByNodeId.set(id, rn);
  });

  const flowRoot =
    flowRoots.find((r) => r.id === selectedTest.flowRootId) ||
    findContainingFlowRoot(flowRoots, selectedTest.flowNodeId) ||
    null;
  const innerSequenceByTargetNodeId = buildInnerSequenceByTargetNodeId(flowRoot, flowRefs);

  return {
    kind: 'ready',
    core,
    runningNumberByNodeId,
    innerSequenceByTargetNodeId,
  };
}

function buildInnerSequenceByTargetNodeId(
  flowRoot: NexusNode | null,
  refs: FlowTabProcessReferenceMap,
): Map<string, InnerFlowStep[]> {
  const map = new Map<string, InnerFlowStep[]>();
  if (!flowRoot) return map;
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    const ref = refs[n.id] as FlowTabProcessReference | undefined;
    if (ref && ref.kind === 'inner' && typeof ref.expandedRunningNumber === 'number' && ref.gridNodeKey) {
      const step: InnerFlowStep = {
        flowNodeId: n.id,
        targetNodeId: ref.targetNodeId,
        expandedRunningNumber: ref.expandedRunningNumber,
        gridNodeKey: ref.gridNodeKey,
      };
      const arr = map.get(ref.targetNodeId) || [];
      arr.push(step);
      map.set(ref.targetNodeId, arr);
    }
    n.children.forEach(walk);
    if (n.isHub && n.variants) n.variants.forEach(walk);
  };
  walk(flowRoot);
  return map;
}

function findContainingFlowRoot(flowRoots: NexusNode[], nodeId: string): NexusNode | null {
  for (const r of flowRoots) {
    if (treeHasId(r, nodeId)) return r;
  }
  return null;
}

function treeHasId(root: NexusNode, nodeId: string): boolean {
  const visited = new Set<string>();
  const walk = (n: NexusNode): boolean => {
    if (visited.has(n.id)) return false;
    visited.add(n.id);
    if (n.id === nodeId) return true;
    for (const c of n.children) {
      if (walk(c)) return true;
    }
    if (n.isHub && n.variants) {
      for (const v of n.variants) {
        if (walk(v)) return true;
      }
    }
    return false;
  };
  return walk(root);
}

