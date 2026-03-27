/**
 * Store and load connector labels for process nodes in markdown metadata
 */

import * as Y from 'yjs';
import { stripKnownNodeLineComments } from '@/lib/node-line-comments';

export interface ConnectorLabel {
  label: string;
  color: string;
}

/**
 * Load connector labels from markdown
 * Returns a map of connectorId -> ConnectorLabel
 */
export function loadConnectorLabels(doc: Y.Doc): Record<string, ConnectorLabel> {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  
  const labels: Record<string, ConnectorLabel> = {};
  const separatorIndex = currentText.indexOf('\n---\n');
  const metadataSection = separatorIndex !== -1 ? currentText.slice(separatorIndex) : currentText;
  
  const labelMatch = metadataSection.match(/```flow-connector-labels\n([\s\S]*?)\n```/);
  if (labelMatch) {
    try {
      const parsed = JSON.parse(labelMatch[1]);
      Object.entries(parsed || {}).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        const row = value as ConnectorLabel;
        const label = stripKnownNodeLineComments(String(row.label || '')).trim();
        if (!label) return;
        labels[key] = {
          label,
          color: String(row.color || '#000000').trim() || '#000000',
        };
      });
    } catch (e) {
      console.error('Failed to parse connector labels:', e);
    }
  }
  
  return labels;
}

/**
 * Save connector labels to markdown
 * Ensures metadata blocks are placed after the separator
 */
export function saveConnectorLabels(
  doc: Y.Doc,
  labels: Record<string, ConnectorLabel>
): void {
  const yText = doc.getText('nexus');
  const currentText = yText.toString();
  const cleanedLabels = Object.entries(labels).reduce<Record<string, ConnectorLabel>>((acc, [key, value]) => {
    const label = stripKnownNodeLineComments(String(value?.label || '')).trim();
    if (!label) return acc;
    acc[key] = {
      label,
      color: String(value?.color || '#000000').trim() || '#000000',
    };
    return acc;
  }, {});
  const dataBlock = `\`\`\`flow-connector-labels\n${JSON.stringify(cleanedLabels, null, 2)}\n\`\`\``;
  
  const separatorIndex = currentText.indexOf('\n---\n');
  const existingMatch = currentText.match(/```flow-connector-labels\n[\s\S]*?\n```/);
  let newText: string;
  
  if (existingMatch) {
    // Check if existing block is before separator - if so, move it after
    const matchIndex = existingMatch.index || 0;
    if (separatorIndex !== -1 && matchIndex < separatorIndex) {
      // Remove old block and place after separator
      newText = currentText.replace(/```flow-connector-labels\n[\s\S]*?\n```/, '');
      newText = newText.slice(0, separatorIndex + 5) + '\n' + dataBlock + newText.slice(separatorIndex + 5);
    } else {
      // Replace in place
      newText = currentText.replace(/```flow-connector-labels\n[\s\S]*?\n```/, dataBlock);
    }
  } else {
    // Always place metadata blocks AFTER the separator to avoid parsing as nodes
    if (separatorIndex !== -1) {
      // Insert after separator
      newText = currentText.slice(0, separatorIndex + 5) + '\n' + dataBlock + currentText.slice(separatorIndex + 5);
    } else {
      // No separator exists, add it first, then add metadata
      newText = currentText + (currentText.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
    }
  }
  
  if (newText !== currentText) {
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newText);
    });
  }
}
