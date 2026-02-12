import { FlowNode } from '@/components/DimensionFlowEditor';

export interface SerializedFlowData {
  nodes: FlowNode[];
  edges: Record<string, { label: string; color: string }>;
}

/**
 * Parses flow data from markdown format.
 * Extracts the JSON structure from the flowjson code block.
 */
export function parseFlowFromMarkdown(bodyLines: string[]): {
  nodes: FlowNode[];
  edges: Record<string, { label: string; color: string }>;
} | null {
  const content = bodyLines.join('\n');
  const codeBlockMatch = content.match(/```flowjson\n([\s\S]*?)\n```/);
  
  if (!codeBlockMatch) {
    return null;
  }

  try {
    const flowData: SerializedFlowData = JSON.parse(codeBlockMatch[1]);
    return {
      nodes: flowData.nodes || [],
      edges: flowData.edges || {},
    };
  } catch (error) {
    console.error('Failed to parse flow JSON:', error);
    return null;
  }
}
