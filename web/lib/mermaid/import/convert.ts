import type { MermaidDiagramType } from './types';
import { detectMermaidDiagramType } from './detect';
import { makeSeparatorAndBlocks, renderNodeLines } from './markdown';
import { buildFlowNodesBlock, buildProcessFlowFromMermaidFlowchart, buildProcessGotoBlocks, buildProcessNodeTypeBlocks } from './flowchart';
import { stateDiagramToFlowchart } from './state';
import { sliceToMermaidHeader, stripCodeFencesAndFrontmatter } from './text';

import { convertSequenceDiagram } from './converters/sequence';
import { convertMindmap } from './converters/mindmap';
import { convertBlockLikeSystemFlow } from './converters/block';
import { convertPacketDiagram } from './converters/packet';
import { convertArchitectureDiagram } from './converters/architecture';
import { convertClassDiagram } from './converters/class';
import { convertErDiagram } from './converters/er';
import { convertC4 } from './converters/c4';
import { convertJourney } from './converters/journey';

export function convertMermaidToNexusMarkdown(
  src: string,
): { title: string; kind: 'diagram'; markdown: string } | { error: string } {
  const cleaned = stripCodeFencesAndFrontmatter(src);
  const type = detectMermaidDiagramType(cleaned);
  if (type === 'unknown') {
    return {
      error:
        'Unsupported Mermaid diagram type. Supported: flowchart/graph, sequenceDiagram, classDiagram, stateDiagram, erDiagram, journey, C4*, mindmap, block/block-beta, packet/packet-beta, architecture/architecture-beta.',
    };
  }

  const effectiveSrc = sliceToMermaidHeader(cleaned);

  if (type === 'flowchart') {
    const built = buildProcessFlowFromMermaidFlowchart(effectiveSrc, { title: 'Process flow (flowchart)' });
    const mdTop = renderNodeLines(built.lines).markdown;
    const blocks: Array<{ type: string; body: unknown }> = [
      { type: 'flow-nodes', body: buildFlowNodesBlock(built.flowNodeByKey) },
      { type: 'flow-connector-labels', body: built.connectorLabels },
      ...buildProcessNodeTypeBlocks(built.flowNodeByKey),
      ...buildProcessGotoBlocks(built.flowNodeByKey),
    ];
    return { title: built.title, kind: 'diagram', markdown: mdTop + makeSeparatorAndBlocks(blocks) };
  }

  if (type === 'state') {
    const asFlowchart = stateDiagramToFlowchart(effectiveSrc);
    const built = buildProcessFlowFromMermaidFlowchart(asFlowchart, {
      title: 'Process flow (state)',
      ensureEndNode: !asFlowchart.toLowerCase().includes('end'),
    });
    const mdTop = renderNodeLines(built.lines).markdown;
    const blocks: Array<{ type: string; body: unknown }> = [
      { type: 'flow-nodes', body: buildFlowNodesBlock(built.flowNodeByKey) },
      { type: 'flow-connector-labels', body: built.connectorLabels },
      ...buildProcessNodeTypeBlocks(built.flowNodeByKey),
      ...buildProcessGotoBlocks(built.flowNodeByKey),
    ];
    return { title: built.title, kind: 'diagram', markdown: mdTop + makeSeparatorAndBlocks(blocks) };
  }

  if (type === 'sequence') return convertSequenceDiagram(effectiveSrc);
  if (type === 'mindmap') return convertMindmap(effectiveSrc);
  if (type === 'block') return convertBlockLikeSystemFlow(effectiveSrc, 'Tech flow (block)');
  if (type === 'packet') return convertPacketDiagram(effectiveSrc);
  if (type === 'architecture') return convertArchitectureDiagram(effectiveSrc);
  if (type === 'class') return convertClassDiagram(effectiveSrc);
  if (type === 'er') return convertErDiagram(effectiveSrc);
  if (type === 'c4') return convertC4(effectiveSrc);
  if (type === 'journey') return convertJourney(effectiveSrc);

  const _exhaustive: MermaidDiagramType = type;
  return { error: `Unsupported Mermaid diagram type: ${_exhaustive}` };
}

