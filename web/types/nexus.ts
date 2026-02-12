export interface NexusNode {
  id: string;
  content: string; // The display content (without conditions/tags)
  rawContent: string; // The original content line (without indent)
  level: number;
  visualLevel: number;
  lineIndex: number; 
  parentId: string | null;
  children: NexusNode[]; 

  // Optional icon shown above the text (emoji / ascii), persisted via <!-- icon:... -->
  icon?: string;

  // Optional freeform annotation rendered below the node, persisted via <!-- ann:... -->
  annotation?: string;

  // Optional data object link (shared store), persisted via <!-- do:... -->
  dataObjectId?: string;

  // Optional data object attribute links (multi-select), persisted via <!-- doattrs:... -->
  // Special id: "__objectName__" represents the object's name.
  dataObjectAttributeIds?: string[];
  
  // Conditional Logic
  // condition?: { key: string; value: string }; // Deprecated
  conditions?: Record<string, string>; // New: Support multiple (key=value)
  
  isHub?: boolean;
  variants?: NexusNode[]; // If this is a hub, contains all variants (including itself)
  activeVariantId?: string; // Runtime state: currently selected variant ID for Hubs
  
  // Metadata
  isCommon?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  // Flow Node
  isFlowNode?: boolean; // If true, this node can be expanded to show a flow editor
}

export interface NexusTree {
  rootId: string;
  nodes: Record<string, NexusNode>;
}

export type NexusMarkdown = string;
