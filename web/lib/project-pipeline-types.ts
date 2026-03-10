export type DiagramLinkRef = {
  diagramFileId: string;
  lineIndex: number;
  nodeId: string;
  runningNumber: number | null;
  expid: number | null;
  label: string;
  anchorKey: string;
};

export type SwarmRecommendation = {
  id: string;
  title: string;
  detail: string;
  diagramRefs: DiagramLinkRef[];
};

export type SwarmAgentName =
  | 'technical'
  | 'user_journey'
  | 'interaction'
  | 'content'
  | 'ui_presentation';

export type SwarmAgentOutput = {
  agent: SwarmAgentName;
  recommendations: SwarmRecommendation[];
};

export type PipelineStory = {
  id: string;
  epicId: string;
  title: string;
  description: string;
  actor: string;
  goal: string;
  benefit: string;
  priority: string;
  acceptanceCriteria: string[];
  uiElements: string[];
  diagramRefs: DiagramLinkRef[];
};

export type PipelineEpic = {
  id: string;
  title: string;
  summary: string;
};

export type PipelineComponentGap = {
  id: string;
  name: string;
  purpose: string;
  propsContract: string[];
  diagramRefs: DiagramLinkRef[];
};

export type PipelineSynthesis = {
  epics: PipelineEpic[];
  stories: PipelineStory[];
  designSystemBrief: string;
  componentGaps: PipelineComponentGap[];
};

export type PipelineLinkedArtifact = {
  kind: 'diagram' | 'grid' | 'vision' | 'note' | 'resource';
  id: string;
  name: string;
  diagramRefs: DiagramLinkRef[];
};

export type PipelineArtifactManifest = {
  runLabel: string;
  primaryDiagramFileId: string;
  linkedArtifacts: PipelineLinkedArtifact[];
};
