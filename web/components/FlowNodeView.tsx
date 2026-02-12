import { useState, useCallback } from 'react';
import { NexusNode } from '@/types/nexus';
import { DimensionFlowEditor, FlowNode } from '@/components/DimensionFlowEditor';
import * as Y from 'yjs';
import { loadFlowNodeData, saveFlowNodeData } from '@/lib/flow-node-storage';

interface FlowNodeViewProps {
  node: NexusNode;
  doc: Y.Doc;
  runningNumber: number;
  styleClass: string;
}

export function FlowNodeView({ node, doc, runningNumber, styleClass }: FlowNodeViewProps) {
  // Initialize with default nodes immediately (not in useEffect) so DimensionFlowEditor receives them
  const defaultBranch = 'branch-1';
  const defaultNodes: FlowNode[] = [
    { id: 'flow-1', label: 'Step 1', type: 'step', branchId: defaultBranch },
    { id: 'flow-2', label: 'Step 2', type: 'step', branchId: defaultBranch },
  ];
  
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>(() => {
    const flowData = loadFlowNodeData(doc, runningNumber);
    if (flowData?.nodes?.length) return flowData.nodes;
    return defaultNodes;
  });
  const [flowEdges, setFlowEdges] = useState<Record<string, { label: string; color: string }>>(() => {
    const flowData = loadFlowNodeData(doc, runningNumber);
    return flowData?.edges || {};
  });
  
  // Save flow data when it changes
  const handleFlowChange = useCallback((payload: {
    nodes: FlowNode[];
    edges: Record<string, { label: string; color: string }>;
  }) => {
    setFlowNodes(payload.nodes);
    setFlowEdges(payload.edges);
    saveFlowNodeData(doc, runningNumber, payload.nodes, payload.edges);
  }, [doc, runningNumber]);
  
  // Extract pattern/background from styleClass (mac3 uses pattern classes, not colors)
  const fillClass =
    styleClass.match(/mac-fill--[a-z0-9-]+/)?.[0] ||
    styleClass.match(/bg-\w+-\d+/)?.[0] ||
    'bg-white';
  
  return (
    <div 
      className={`w-full h-full flex flex-col ${fillClass}`} 
      style={{ 
        minHeight: '100%', 
        overflow: 'visible', 
        position: 'relative',
        zIndex: 1,
      }}
    >
      <DimensionFlowEditor
        initialNodes={flowNodes}
        initialEdges={flowEdges}
        onChange={handleFlowChange}
      />
    </div>
  );
}
