export type MermaidDiagramType =
  | 'flowchart'
  | 'sequence'
  | 'class'
  | 'state'
  | 'er'
  | 'journey'
  | 'c4'
  | 'mindmap'
  | 'block'
  | 'packet'
  | 'architecture';

export type NodeLine = {
  indent: number;
  content: string;
};

export type FlowEdge = { from: string; to: string; label?: string; dashed?: boolean };

export type FlowNode = { id: string; label: string; validation?: boolean; end?: boolean };

export type FlowBuildResult = {
  title: string;
  lines: NodeLine[];
  flowNodeByKey: Map<
    string,
    {
      lineIndex: number;
      runningNumber: number;
      parentPath: string[];
      label: string;
      type?: 'validation' | 'end' | 'goto';
      gotoTargetNodeId?: string;
      gotoTargetMermaidId?: string;
    }
  >;
  connectorLabels: Record<string, { label: string; color: string }>;
};

export type SystemFlowBox = {
  key: string;
  name: string;
  icon?: string;
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
  dataObjectId?: string;
};

export type SystemFlowLink = {
  id: string;
  fromKey: string;
  toKey: string;
  text?: string;
  order?: number;
  dashStyle?: 'solid' | 'dashed';
  startShape?: 'none' | 'arrow' | 'circle' | 'square';
  endShape?: 'none' | 'arrow' | 'circle' | 'square';
};

