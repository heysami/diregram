import type { NodeLine } from '../types';
import { makeSeparatorAndBlocks, nodeIdForLineIndex, renderNodeLines } from '../markdown';
import { normalizeNewlines, safeSingleLine, stripMermaidComments } from '../text';
import { buildFlowNodesBlock } from '../flowchart';

export function convertJourney(src: string): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const lines = normalizeNewlines(src).split('\n').slice(1);
  let title = 'User journey';
  type Section = { name: string; steps: Array<{ label: string; score?: number }> };
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of lines) {
    const line0 = stripMermaidComments(raw);
    const line = line0.trim();
    if (!line) continue;
    const t = line.match(/^title\s+([\s\S]+)$/i);
    if (t) {
      title = safeSingleLine(t[1]);
      continue;
    }
    const s = line.match(/^section\s+([\s\S]+)$/i);
    if (s) {
      current = { name: safeSingleLine(s[1]), steps: [] };
      sections.push(current);
      continue;
    }
    const step = line.match(/^(.+?)\s*:\s*(\d+)(?:\s*:\s*[\s\S]*)?$/);
    if (step) {
      if (!current) {
        current = { name: 'Stage 1', steps: [] };
        sections.push(current);
      }
      current.steps.push({ label: safeSingleLine(step[1]), score: Number(step[2]) });
      continue;
    }
  }
  if (!sections.length) return { error: 'No journey sections found.' };

  const fid = 'flowtab-1';
  const nodeLines: NodeLine[] = [];
  nodeLines.push({ indent: 0, content: `${title} #flowtab# <!-- fid:${fid} -->` });

  const stepNodeLineIndices: number[] = [];
  const valueNodeLineIndices: number[] = [];
  const stepMeta: Array<{ label: string; parentPath: string[]; stage: number }> = [];

  let stepCount = 0;
  let prevStepIndent = 0;
  let prevParentPath: string[] = [title];

  sections.forEach((sec, secIdx) => {
    sec.steps.forEach((st) => {
      stepCount += 1;
      const stepLabel = st.label || `Step ${stepCount}`;
      const score = typeof st.score === 'number' ? st.score : undefined;

      const stepIndent = prevStepIndent + 1;
      nodeLines.push({ indent: stepIndent, content: `${stepLabel} #flow# <!-- tags:actor-system -->` });
      const stepLineIndex = nodeLines.length - 1;
      stepNodeLineIndices.push(stepLineIndex);

      stepMeta.push({ label: stepLabel, parentPath: [...prevParentPath], stage: secIdx });

      nodeLines.push({ indent: stepIndent + 1, content: `Value: ${score != null ? score : ''}`.trimEnd() });
      valueNodeLineIndices.push(nodeLines.length - 1);

      prevStepIndent = stepIndent;
      prevParentPath = [stepLabel, ...prevParentPath];
    });
  });

  const stages = sections.map((s, idx) => ({ id: `stage-${idx + 1}`, label: s.name || `Stage ${idx + 1}` }));
  const lanes = [
    { id: 'branch-1', label: 'Stage steps' },
    { id: 'branch-2', label: 'Value' },
  ];

  const placement: Record<string, { laneId: string; stage: number }> = {};
  placement[nodeIdForLineIndex(0)] = { laneId: 'branch-1', stage: 0 };

  stepNodeLineIndices.forEach((stepLi, idx) => {
    const valueLi = valueNodeLineIndices[idx];
    const stage = stepMeta[idx]?.stage ?? 0;
    placement[nodeIdForLineIndex(stepLi)] = { laneId: 'branch-1', stage };
    placement[nodeIdForLineIndex(valueLi)] = { laneId: 'branch-2', stage };
  });

  const swimlane = { fid, lanes, stages, placement, pinnedTagIds: [] };

  const tagStore = {
    nextGroupId: 1,
    nextTagId: 1,
    groups: [
      { id: 'tg-ungrouped', name: 'ungrouped', order: 0 },
      { id: 'tg-systems', name: 'system', order: 1 },
      { id: 'tg-uiType', name: 'ui type', order: 2 },
      { id: 'tg-actors', name: 'actors', order: 3 },
      { id: 'tg-uiSurface', name: 'ui surface', order: 4 },
    ],
    tags: [
      { id: 'actor-system', groupId: 'tg-actors', name: 'system' },
      { id: 'actor-staff', groupId: 'tg-actors', name: 'staff' },
      { id: 'actor-applicant', groupId: 'tg-actors', name: 'applicant' },
      { id: 'actor-partner', groupId: 'tg-actors', name: 'partner' },
      { id: 'ui-surface-public', groupId: 'tg-uiSurface', name: 'public' },
      { id: 'ui-surface-portal', groupId: 'tg-uiSurface', name: 'portal' },
      { id: 'ui-surface-admin', groupId: 'tg-uiSurface', name: 'admin' },
      { id: 'ui-surface-partner', groupId: 'tg-uiSurface', name: 'partner' },
    ],
  };

  const flowNodeByKey = new Map<string, { lineIndex: number; runningNumber: number; parentPath: string[]; label: string }>();
  let rn = 1;
  stepNodeLineIndices.forEach((li, idx) => {
    const label = safeSingleLine(nodeLines[li].content.replace(/#flow#.*$/, '').trim());
    const parentPath = stepMeta[idx]?.parentPath || [title];
    flowNodeByKey.set(`line-${li}`, { lineIndex: li, runningNumber: rn++, parentPath, label });
  });

  const mdTop = renderNodeLines(nodeLines).markdown;
  const blocks: Array<{ type: string; body: unknown }> = [
    { type: 'tag-store', body: tagStore },
    { type: `flowtab-swimlane-${fid}`, body: swimlane },
    { type: 'flow-nodes', body: buildFlowNodesBlock(flowNodeByKey) },
  ];
  return { title, kind: 'diagram', markdown: mdTop + makeSeparatorAndBlocks(blocks) };
}

