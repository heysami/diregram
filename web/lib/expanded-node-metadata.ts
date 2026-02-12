import * as Y from 'yjs';

export interface ExpandedNodeMetadata {
  width?: number; // Custom width multiplier (default: 4)
  height?: number; // Custom height multiplier (default: 4)
  gridWidth?: number; // Grid width (default: 4)
  gridHeight?: number; // Grid height (default: 4)
  gridSize?: number; // Grid size (legacy, for backward compatibility, default: 4)
  // Optional: data object linked to this expanded node (main/container node)
  dataObjectId?: string;
  // Optional: selected attributes of the linked object (multi-select)
  // Special id: "__objectName__" represents the object's name.
  dataObjectAttributeIds?: string[];
}

const DEFAULT_METADATA: ExpandedNodeMetadata = {
  width: 4,
  height: 4,
  gridWidth: 4,
  gridHeight: 4,
  gridSize: 4,
};

export function loadExpandedNodeMetadata(doc: Y.Doc, runningNumber: number): ExpandedNodeMetadata {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  // Use running number instead of node ID (stable identifier)
  const match = currentText.match(new RegExp(`\`\`\`expanded-metadata-${runningNumber}\\n([\\s\\S]*?)\\n\`\`\``));
  
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const metadata = { ...DEFAULT_METADATA, ...parsed };
      // Handle legacy gridSize -> convert to gridWidth/gridHeight if needed
      if (metadata.gridSize && !metadata.gridWidth && !metadata.gridHeight) {
        metadata.gridWidth = metadata.gridSize;
        metadata.gridHeight = metadata.gridSize;
      }
      return metadata;
    } catch (e) {
      console.error('Failed to parse expanded node metadata:', e);
    }
  }
  
  // Also check for legacy format using node ID (for backward compatibility)
  // This will be phased out as nodes are moved/updated
  const legacyMatch = currentText.match(new RegExp(`\`\`\`expanded-metadata-node-\\d+\\n([\\s\\S]*?)\\n\`\`\``));
  if (legacyMatch) {
    try {
      const parsed = JSON.parse(legacyMatch[1]);
      const metadata = { ...DEFAULT_METADATA, ...parsed };
      if (metadata.gridSize && !metadata.gridWidth && !metadata.gridHeight) {
        metadata.gridWidth = metadata.gridSize;
        metadata.gridHeight = metadata.gridSize;
      }
      return metadata;
    } catch (e) {
      console.error('Failed to parse legacy expanded node metadata:', e);
    }
  }
  
  return { ...DEFAULT_METADATA };
}

export function saveExpandedNodeMetadata(doc: Y.Doc, runningNumber: number, metadata: ExpandedNodeMetadata): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  const newText = saveExpandedNodeMetadataToMarkdown(currentText, runningNumber, metadata);
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

export function saveExpandedNodeMetadataToMarkdown(markdown: string, runningNumber: number, metadata: ExpandedNodeMetadata): string {
  // Store in a code block that parser ignores, using running number (stable identifier)
  const metadataBlock = `\`\`\`expanded-metadata-${runningNumber}\n${JSON.stringify(metadata, null, 2)}\n\`\`\``;
  
  // Check if metadata block exists (by running number)
  const existingMatch = markdown.match(new RegExp(`\`\`\`expanded-metadata-${runningNumber}\\n[\\s\\S]*?\\n\`\`\``));
  
  let newText: string;
  if (existingMatch) {
    newText = markdown.replace(new RegExp(`\`\`\`expanded-metadata-${runningNumber}\\n[\\s\\S]*?\\n\`\`\``), metadataBlock);
  } else {
    // Find the separator (---) or end of document
    const separatorIndex = markdown.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      // Insert before separator
      newText = markdown.slice(0, separatorIndex) + '\n' + metadataBlock + '\n' + markdown.slice(separatorIndex);
    } else {
      // Append to end
      newText = markdown + (markdown.endsWith('\n') ? '' : '\n') + '\n' + metadataBlock;
    }
  }
  
  return newText;
}
