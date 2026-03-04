import type { FlowNodeType } from '@/components/DimensionFlowEditor';

export type DiagramAssistAction =
  | 'node_structure'
  | 'data_object_attributes'
  | 'status_descriptions'
  | 'markdown_errors_fix';

export type DiagramAssistSelectionBase = {
  baseFileHash: string;
  baseUpdatedAt?: string | null;
};

export type DiagramAssistNodeStructureSelection = DiagramAssistSelectionBase & {
  nodeId: string;
  lineIndex: number;
  parentPathFingerprint: string[];
  selectedNodeContent: string;
  subtreeMarkdown: string;
};

export type DiagramAssistExistingAttribute = {
  name: string;
  type: 'text' | 'status';
  sample?: string;
  values?: string[];
};

export type DiagramAssistDataObjectAttributesSelection = DiagramAssistSelectionBase & {
  targetObjectId: string;
  targetObjectName: string;
  triggerSource: 'data_object_inspector' | 'logic_panel_linked_object';
  linkedObjectIds?: string[];
  linkedObjectNames?: string[];
  existingAttributes?: DiagramAssistExistingAttribute[];
  nodeContext?: {
    nodeId?: string;
    nodeLabel?: string;
  };
};

export type DiagramAssistStatusTargetDataObject = {
  kind: 'data_object_status';
  doId: string;
  doName: string;
  attrId: string;
  attrName: string;
  statusValues: string[];
};

export type DiagramAssistStatusTargetConditionDimension = {
  kind: 'condition_dimension_status';
  nodeId: string;
  nodeLineIndex: number;
  hubLabel: string;
  dimensionKey: string;
  statusValues: string[];
};

export type DiagramAssistStatusDescriptionsSelection = DiagramAssistSelectionBase & {
  target: DiagramAssistStatusTargetDataObject | DiagramAssistStatusTargetConditionDimension;
};

export type DiagramAssistMarkdownErrorsFixSelection = DiagramAssistSelectionBase & {
  issueKeys?: string[];
  maxPatches?: number;
};

export type DiagramAssistSelection =
  | DiagramAssistNodeStructureSelection
  | DiagramAssistDataObjectAttributesSelection
  | DiagramAssistStatusDescriptionsSelection
  | DiagramAssistMarkdownErrorsFixSelection;

export type DiagramAssistExecuteInput = {
  ownerId: string;
  projectFolderId: string;
  fileId: string;
  requestedBy?: string;
  chatModel?: string | null;
  embeddingModel?: string | null;
  action: DiagramAssistAction;
  selection: DiagramAssistSelection;
};

export type DiagramAssistNodePath = string[];

export type DiagramAssistNodeTypeOp = {
  nodePath: DiagramAssistNodePath;
  type: FlowNodeType;
  reason?: string;
};

export type DiagramAssistSingleScreenOp = {
  startPath: DiagramAssistNodePath;
  lastPath: DiagramAssistNodePath;
  reason?: string;
};

export type DiagramAssistConnectorLabelOp = {
  fromPath: DiagramAssistNodePath;
  toPath: DiagramAssistNodePath;
  label: string;
  color?: string;
};

export type DiagramAssistNodeStructureProposal = {
  action: 'node_structure';
  baseFileHash: string;
  diagnosis: string;
  recommendations: string[];
  subtreeReplacementMarkdown: string;
  metadataOps?: {
    processNodeTypes?: DiagramAssistNodeTypeOp[];
    singleScreenLastSteps?: DiagramAssistSingleScreenOp[];
    connectorLabels?: DiagramAssistConnectorLabelOp[];
  };
  validationReport?: {
    errors: string[];
    warnings: string[];
    notes?: string[];
  };
  preview?: {
    lineIndex: number;
    originalSubtreeMarkdown?: string;
    proposedSubtreeMarkdown?: string;
  };
};

export type DiagramAssistAttributeSuggestion = {
  name: string;
  type: 'text' | 'status';
  sample?: string;
  statusValues?: string[];
  ownerObjectId?: string;
  ownerObjectName?: string;
  ownerConfidence?: number;
  ownerReason?: string;
  evidenceSnippets?: string[];
};

export type DiagramAssistDataObjectAttributesProposal = {
  action: 'data_object_attributes';
  baseFileHash: string;
  targetObjectId: string;
  targetObjectName: string;
  summary: string;
  attributes: DiagramAssistAttributeSuggestion[];
};

export type DiagramAssistStateTransition = {
  from: string;
  to: string;
  guard?: string;
  actor?: string;
  notes?: string;
};

export type DiagramAssistStatusTableRow = {
  role: string;
  status: string;
  actions: string;
  fieldAccess: string;
};

export type DiagramAssistStatusDescriptionsProposal = {
  action: 'status_descriptions';
  baseFileHash: string;
  target: DiagramAssistStatusTargetDataObject | DiagramAssistStatusTargetConditionDimension;
  summary: string;
  stateMachine: {
    states: string[];
    transitions: DiagramAssistStateTransition[];
  };
  flowMarkdownLines: string[];
  table: {
    columns: string[];
    rows: DiagramAssistStatusTableRow[];
  };
};

export type DiagramAssistMarkdownIssue = {
  code: string;
  message: string;
  line?: number;
};

export type DiagramAssistMarkdownSectionPatch = {
  targetId: string;
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive; insertion when startLine === endLine + 1
  replacementMarkdown: string;
  originalMarkdown?: string;
  reason?: string;
  issueCodes?: string[];
};

export type DiagramAssistMarkdownErrorsFixProposal = {
  action: 'markdown_errors_fix';
  baseFileHash: string;
  summary: string;
  issues: DiagramAssistMarkdownIssue[];
  patches: DiagramAssistMarkdownSectionPatch[];
  validationReport?: {
    errors: string[];
    warnings: string[];
    fixedIssueCount?: number;
    unresolvedIssueCount?: number;
    newIssueCount?: number;
  };
};

export type DiagramAssistProposal =
  | DiagramAssistNodeStructureProposal
  | DiagramAssistDataObjectAttributesProposal
  | DiagramAssistStatusDescriptionsProposal
  | DiagramAssistMarkdownErrorsFixProposal;

export type DiagramAssistApplyOperation = {
  kind: string;
  summary: string;
};

export type DiagramAssistApplyPlan = {
  action: DiagramAssistAction;
  baseFileHash: string;
  operations: DiagramAssistApplyOperation[];
  previewMeta?: Record<string, unknown>;
};
