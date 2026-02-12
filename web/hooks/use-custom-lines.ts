/**
 * ⚠️ IMPORTANT: This hook is stable and working. Do not modify unless fixing bugs.
 * 
 * This hook handles all custom line (shortcut/return) functionality.
 * Modifying this hook can break existing line drawing, selection, and persistence behavior.
 * 
 * If you need different line behavior, consider:
 * 1. Creating a new hook for your specific use case
 * 2. Extending this hook with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import {
  ensureRunningNumberTagsForNodes,
  extractRunningNumbersFromMarkdown,
} from '@/lib/node-running-numbers';

export interface CustomLine {
  id: string;
  fromId: string;
  toId: string;
  type: 'shortcut' | 'return';
  // Stable anchors for persistence (preferred). When present, used to re-resolve nodes after edits.
  fromRunning?: number;
  toRunning?: number;
}

interface UseCustomLinesProps {
  doc: Y.Doc;
  nodeMap: Map<string, any>; // Map of nodeId to node (for isDescendantOf check)
}

type PersistedCustomLineV2 = {
  id: string;
  type: 'shortcut' | 'return';
  fromRunning: number;
  toRunning: number;
};

type PersistedCustomLineV1 = {
  id: string;
  type: 'shortcut' | 'return';
  fromId: string;
  toId: string;
};

/**
 * Modularized hook for managing custom lines (shortcut and return connections).
 * 
 * IMPORTANT: This hook is self-contained and should not be modified when adding new features.
 * All custom line logic is encapsulated here to prevent breaking existing functionality.
 * 
 * This hook handles:
 * 1. Loading/saving custom lines from/to markdown
 * 2. Line creation via drag and drop
 * 3. Line selection and deletion
 * 4. Determining line type (shortcut vs return) based on node relationships
 * 
 * Features:
 * - Automatic persistence to markdown in `custom-connections` code block
 * - Automatic loading from markdown on document changes
 * - Line type detection (return if connecting from descendant to ancestor, shortcut otherwise)
 * - Selection state management
 * - Drag and drop line creation
 * 
 * Usage:
 * ```tsx
 * const {
 *   customLines,
 *   selectedLineId,
 *   setSelectedLineId,
 *   draggingLineFrom,
 *   setDraggingLineFrom,
 *   mousePos,
 *   setMousePos,
 *   createLine,
 *   deleteLine,
 *   isLineConnectedToNode,
 * } = useCustomLines({ doc, nodeMap });
 * 
 * // Check if a line should be highlighted when a node is selected
 * const shouldHighlight = isLineConnectedToNode(line, selectedNodeId);
 * ```
 * 
 * @param doc - The Yjs document containing the markdown
 * @param nodeMap - Map of nodeId to node (used for relationship detection)
 * @returns All state and functions needed for custom line functionality
 */
export function useCustomLines({ doc, nodeMap }: UseCustomLinesProps) {
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [draggingLineFrom, setDraggingLineFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const getRunningMaps = useCallback(() => {
    const yText = doc.getText('nexus');
    const text = yText.toString();
    const lineIndexToRunning = extractRunningNumbersFromMarkdown(text);
    const runningToNodeId = new Map<number, string>();
    nodeMap.forEach((node, nodeId) => {
      const li = typeof node?.lineIndex === 'number' ? node.lineIndex : null;
      if (li == null) return;
      const rn = lineIndexToRunning.get(li);
      if (rn == null) return;
      if (!runningToNodeId.has(rn)) runningToNodeId.set(rn, nodeId);
    });
    return { text, lineIndexToRunning, runningToNodeId };
  }, [doc, nodeMap]);

  /**
   * Helper function to determine if one node is a descendant of another.
   * Used to determine if a line should be a "return" line (descendant to ancestor)
   * or a "shortcut" line (all other cases).
   */
  const isDescendantOf = useCallback((fromNodeId: string, toNodeId: string): boolean => {
    const fromNode = nodeMap.get(fromNodeId);
    const toNode = nodeMap.get(toNodeId);
    if (!fromNode || !toNode) return false;

    let current: any | undefined = fromNode;
    while (current) {
      if (current.parentId === toNodeId) return true;
      current = current.parentId ? nodeMap.get(current.parentId) : undefined;
    }
    return false;
  }, [nodeMap]);

  /**
   * Save custom lines to markdown in a `custom-connections` code block.
   */
  const saveCustomLinesToMarkdown = useCallback((lines: CustomLine[]) => {
    const yText = doc.getText('nexus');
    const currentText = yText.toString();
    const { lineIndexToRunning } = getRunningMaps();
    // Persist by running number when available; fall back to ids for backward compatibility.
    const persisted: Array<PersistedCustomLineV2 | PersistedCustomLineV1> = lines.map((l) => {
      const fromNode = nodeMap.get(l.fromId);
      const toNode = nodeMap.get(l.toId);
      const fromRunning =
        l.fromRunning ??
        (typeof fromNode?.lineIndex === 'number'
          ? lineIndexToRunning.get(fromNode.lineIndex)
          : undefined);
      const toRunning =
        l.toRunning ??
        (typeof toNode?.lineIndex === 'number'
          ? lineIndexToRunning.get(toNode.lineIndex)
          : undefined);
      if (typeof fromRunning === 'number' && typeof toRunning === 'number') {
        return {
          id: `line-${fromRunning}-${toRunning}`,
          type: l.type,
          fromRunning,
          toRunning,
        };
      }
      return {
        id: l.id,
        type: l.type,
        fromId: l.fromId,
        toId: l.toId,
      };
    });
    const linesJson = JSON.stringify(persisted, null, 2);
    const codeBlock = `\`\`\`custom-connections\n${linesJson}\n\`\`\``;
    
    // Check if custom-connections block already exists
    const existingMatch = currentText.match(/```custom-connections\n[\s\S]*?\n```/);
    
    let newText: string;
    if (existingMatch) {
      // Replace existing block
      newText = currentText.replace(/```custom-connections\n[\s\S]*?\n```/, codeBlock);
    } else {
      // Append to end
      newText = currentText + (currentText.endsWith('\n') ? '' : '\n') + '\n' + codeBlock;
    }
    
    if (newText !== currentText) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, newText);
      });
    }
  }, [doc, getRunningMaps, nodeMap]);

  /**
   * Create a new line between two nodes.
   * Automatically determines line type (shortcut vs return) and saves to markdown.
   */
  const createLine = useCallback((fromId: string, toId: string) => {
    const lineType: CustomLine['type'] = isDescendantOf(fromId, toId) ? 'return' : 'shortcut';
    const { lineIndexToRunning } = getRunningMaps();
    const fromNode = nodeMap.get(fromId);
    const toNode = nodeMap.get(toId);
    let fromRunning =
      typeof fromNode?.lineIndex === 'number'
        ? lineIndexToRunning.get(fromNode.lineIndex)
        : undefined;
    let toRunning =
      typeof toNode?.lineIndex === 'number'
        ? lineIndexToRunning.get(toNode.lineIndex)
        : undefined;

    // Lazily ensure stable anchors only for the endpoints when the user creates a line.
    // This avoids adding rn tags for every node.
    if (fromRunning === undefined || toRunning === undefined) {
      if (fromNode && toNode && typeof fromNode.lineIndex === 'number' && typeof toNode.lineIndex === 'number') {
        ensureRunningNumberTagsForNodes({
          doc,
          nodes: [
            { id: fromId, lineIndex: fromNode.lineIndex },
            { id: toId, lineIndex: toNode.lineIndex },
          ],
        });

        // Re-read running numbers after tagging.
        const { lineIndexToRunning: nextMap } = getRunningMaps();
        const fromRn = nextMap.get(fromNode.lineIndex);
        const toRn = nextMap.get(toNode.lineIndex);
        if (typeof fromRn === 'number') fromRunning = fromRn;
        if (typeof toRn === 'number') toRunning = toRn;
      }
    }
    const lineId =
      typeof fromRunning === 'number' && typeof toRunning === 'number'
        ? `line-${fromRunning}-${toRunning}`
        : `line-${fromId}-${toId}`;
    const existingLineIndex = customLines.findIndex(
      (l) =>
        (typeof fromRunning === 'number' &&
          typeof toRunning === 'number' &&
          l.fromRunning === fromRunning &&
          l.toRunning === toRunning) ||
        (l.fromId === fromId && l.toId === toId)
    );
    
    const updatedLines: CustomLine[] = existingLineIndex === -1
      ? [
          ...customLines,
          {
            id: lineId,
            fromId,
            toId,
            type: lineType,
            ...(typeof fromRunning === 'number' ? { fromRunning } : {}),
            ...(typeof toRunning === 'number' ? { toRunning } : {}),
          } satisfies CustomLine,
        ]
      : customLines.map((l, idx) =>
          idx === existingLineIndex ? { ...l, type: lineType } : l
        );
    
    setCustomLines(updatedLines);
    saveCustomLinesToMarkdown(updatedLines);
  }, [customLines, isDescendantOf, saveCustomLinesToMarkdown, getRunningMaps, nodeMap, doc]);

  /**
   * Delete a line by ID and save to markdown.
   */
  const deleteLine = useCallback((lineId: string) => {
    const updatedLines = customLines.filter(l => l.id !== lineId);
    setCustomLines(updatedLines);
    setSelectedLineId(null);
    saveCustomLinesToMarkdown(updatedLines);
  }, [customLines, saveCustomLinesToMarkdown]);

  /**
   * Check if a line is connected to a specific node (either as source or target).
   * Used for highlighting lines when a node is selected.
   */
  const isLineConnectedToNode = useCallback((line: CustomLine, nodeId: string | null): boolean => {
    if (!nodeId) return false;
    return line.fromId === nodeId || line.toId === nodeId;
  }, []);

  // Load custom lines from markdown when document changes
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const text = yText.toString();
      
      // Load custom lines from markdown
      const customLinesMatch = text.match(/```custom-connections\n([\s\S]*?)\n```/);
      if (customLinesMatch) {
        try {
          const rawBlock = customLinesMatch[1] || '';
          const parsed = JSON.parse(customLinesMatch[1]) as Array<
            Partial<PersistedCustomLineV2 & PersistedCustomLineV1>
          >;
          const resolved: CustomLine[] = [];
          let sawLegacyV1 = false;
          const { runningToNodeId } = getRunningMaps();

          parsed.forEach((l) => {
            // v2: running-number anchored
            if (
              typeof l.fromRunning === 'number' &&
              typeof l.toRunning === 'number'
            ) {
              const fromId = runningToNodeId.get(l.fromRunning);
              const toId = runningToNodeId.get(l.toRunning);
              if (!fromId || !toId) return; // node removed or not yet resolved
              resolved.push({
                id: l.id || `line-${l.fromRunning}-${l.toRunning}`,
                fromId,
                toId,
                type: (l.type as any) || 'shortcut',
                fromRunning: l.fromRunning,
                toRunning: l.toRunning,
              });
              return;
            }

            // v1: id anchored (legacy)
            if (typeof l.fromId === 'string' && typeof l.toId === 'string') {
              sawLegacyV1 = true;
              const fromNode = nodeMap.get(l.fromId);
              const toNode = nodeMap.get(l.toId);
              const { lineIndexToRunning } = getRunningMaps();
              const fromRunningLegacy =
                typeof fromNode?.lineIndex === 'number'
                  ? lineIndexToRunning.get(fromNode.lineIndex)
                  : undefined;
              const toRunningLegacy =
                typeof toNode?.lineIndex === 'number'
                  ? lineIndexToRunning.get(toNode.lineIndex)
                  : undefined;
              resolved.push({
                id: (l.id as string) || `line-${l.fromId}-${l.toId}`,
                fromId: l.fromId,
                toId: l.toId,
                type: (l.type as any) || 'shortcut',
                ...(typeof fromRunningLegacy === 'number'
                  ? { fromRunning: fromRunningLegacy }
                  : {}),
                ...(typeof toRunningLegacy === 'number'
                  ? { toRunning: toRunningLegacy }
                  : {}),
              });
            }
          });

          setCustomLines(resolved);

          // One-time migration: if the block is legacy v1 and we now have running numbers,
          // re-save immediately so persistence becomes stable.
          if (
            sawLegacyV1 &&
            !rawBlock.includes('"fromRunning"') &&
            resolved.some((l) => typeof l.fromRunning === 'number' && typeof l.toRunning === 'number')
          ) {
            saveCustomLinesToMarkdown(resolved);
          }
        } catch (e) {
          console.error('Failed to parse custom connections:', e);
        }
      }
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, getRunningMaps, nodeMap, saveCustomLinesToMarkdown]);

  return {
    // State
    customLines,
    selectedLineId,
    setSelectedLineId,
    draggingLineFrom,
    setDraggingLineFrom,
    mousePos,
    setMousePos,
    
    // Functions
    createLine,
    deleteLine,
    isLineConnectedToNode,
    isDescendantOf, // Exposed for use in component if needed
  };
}
