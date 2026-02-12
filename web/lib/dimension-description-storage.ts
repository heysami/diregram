/**
 * Store dimension description (flow/table) state in markdown metadata, using a running number as an anchor
 * The running number is assigned when a description is created and stays with that node+dimension combination
 * even when nodes are moved, making it stable across redraws
 */

import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';
import { buildParentPath } from './expanded-state-storage';
import { matchNodeByDimensionDescriptionContent } from './dimension-description-matcher';

export type DimensionDescriptionMode = 'flow' | 'table';

export interface DimensionDescriptionEntry {
  runningNumber: number; // Unique running number assigned when description is created (stable anchor)
  content: string; // Node content (for matching)
  parentPath: string[]; // Array of parent contents from root to direct parent
  lineIndex: number; // Line index in markdown (for precise matching)
  dimensionKey: string; // The dimension key (e.g., "Status", "Priority")
  mode: DimensionDescriptionMode; // 'flow' or 'table'
}

export interface DimensionDescriptionData {
  nextRunningNumber: number;
  entries: DimensionDescriptionEntry[];
}

const STORAGE_BLOCK_TYPE = 'dimension-descriptions';

/**
 * Load dimension description state from markdown
 */
export function loadDimensionDescriptions(doc: Y.Doc): DimensionDescriptionData {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  // Look for code block: ```dimension-descriptions\n{...}\n```
  const match = currentText.match(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n([\\s\\S]*?)\\n\`\`\``));
  
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        nextRunningNumber: parsed.nextRunningNumber || 1,
        entries: parsed.entries || [],
      };
    } catch (e) {
      console.error('Failed to parse dimension descriptions:', e);
    }
  }
  
  return {
    nextRunningNumber: 1,
    entries: [],
  };
}

/**
 * Save dimension description state to markdown
 */
export function saveDimensionDescriptions(doc: Y.Doc, data: DimensionDescriptionData): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const lines = currentText.split('\n');
  
  // Build map of lineIndex -> array of dimension description entries
  // Format: { mode, dimensionKey, runningNumber }
  const lineToDescriptions = new Map<number, Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }>>();
  data.entries.forEach(entry => {
    if (!lineToDescriptions.has(entry.lineIndex)) {
      lineToDescriptions.set(entry.lineIndex, []);
    }
    lineToDescriptions.get(entry.lineIndex)!.push({
      mode: entry.mode,
      dimensionKey: entry.dimensionKey,
      runningNumber: entry.runningNumber,
    });
  });
  
  // Remove old desc annotations and add new ones
  const updatedLines = lines.map((line, index) => {
    // Remove old desc annotation (format: <!-- desc:... -->)
    let cleaned = line.replace(/<!--\s*desc:[^>]*\s*-->/, '').trimEnd();
    
    // Add new annotation if this line has dimension descriptions
    const descriptions = lineToDescriptions.get(index);
    if (descriptions && descriptions.length > 0) {
      // Format: <!-- desc:flow:Status:1,table:Priority:2 -->
      const descParts = descriptions.map(d => `${d.mode}:${d.dimensionKey}:${d.runningNumber}`).join(',');
      cleaned = cleaned + ` <!-- desc:${descParts} -->`;
    }
    
    return cleaned;
  });
  
  const annotatedText = updatedLines.join('\n');
  
  // Update metadata block
  const storageBlock = `\`\`\`${STORAGE_BLOCK_TYPE}\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  
  const existingMatch = annotatedText.match(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n[\\s\\S]*?\\n\`\`\``));
  
  let newText: string;
  if (existingMatch) {
    newText = annotatedText.replace(new RegExp(`\`\`\`${STORAGE_BLOCK_TYPE}\\n[\\s\\S]*?\\n\`\`\``), storageBlock);
  } else {
    // Find the separator (---) or end of document
    const separatorIndex = annotatedText.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      // Insert before separator
      newText = annotatedText.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + annotatedText.slice(separatorIndex);
    } else {
      // Append to end
      newText = annotatedText + (annotatedText.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
    }
  }
  
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}

/**
 * Find the running number for a node+dimension combination if it has a description
 * DEPRECATED: Use matchNodeToDimensionDescription from dimension-description-matcher.ts instead
 * This function is kept for backward compatibility but delegates to the modularized version
 */
export function getRunningNumberForDimensionDescription(
  node: NexusNode,
  dimensionKey: string,
  mode: DimensionDescriptionMode,
  entries: DimensionDescriptionEntry[],
  nodeMap: Map<string, NexusNode>
): { runningNumber: number; needsLineIndexUpdate: boolean; needsParentPathUpdate: boolean } | null {
  // Delegate to modularized matcher (content matching only, no markdown parsing)
  return matchNodeByDimensionDescriptionContent(node, dimensionKey, mode, entries, nodeMap);
}
