/**
 * ⚠️ IMPORTANT: This hook is stable and working. Do not modify unless fixing bugs.
 * 
 * This hook handles all expanded node resize functionality.
 * Modifying this hook can break existing resize behavior for expanded nodes.
 * 
 * If you need different resize behavior, consider:
 * 1. Creating a new hook for your specific use case
 * 2. Extending this hook with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { useCallback } from 'react';
import * as Y from 'yjs';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata, ExpandedNodeMetadata } from '@/lib/expanded-node-metadata';

export type ResizeDirection = 'width+' | 'width-' | 'height+' | 'height-';

interface UseExpandedNodeResizeProps {
  doc: Y.Doc;
  getRunningNumber: (nodeId: string) => number | undefined;
}

interface ResizeConfig {
  step?: number; // Resize step size (default: 0.5)
  minWidth?: number; // Minimum width multiplier (default: 1)
  maxWidth?: number; // Maximum width multiplier (default: 10)
  minHeight?: number; // Minimum height multiplier (default: 1)
  maxHeight?: number; // Maximum height multiplier (default: 10)
}

const DEFAULT_CONFIG: Required<ResizeConfig> = {
  step: 0.5,
  minWidth: 1,
  maxWidth: 10,
  minHeight: 1,
  maxHeight: 10,
};

/**
 * Modularized hook for managing expanded node resize functionality.
 * 
 * IMPORTANT: This hook is self-contained and should not be modified when adding new features.
 * All expanded node resize logic is encapsulated here to prevent breaking existing functionality.
 * 
 * This hook handles:
 * 1. Loading current metadata for an expanded node
 * 2. Calculating new width/height based on resize direction
 * 3. Saving updated metadata back to markdown
 * 4. Enforcing min/max constraints
 * 
 * Features:
 * - Automatic persistence to markdown using running numbers (stable identifiers)
 * - Respects min/max constraints
 * - Configurable resize step size
 * - Handles all resize directions (width+/-, height+/-)
 * 
 * Usage:
 * ```tsx
 * const { handleResize } = useExpandedNodeResize({ doc, getRunningNumber });
 * 
 * // In your component:
 * <button onClick={() => handleResize(nodeId, 'width+')}>
 *   Increase Width
 * </button>
 * ```
 */
export function useExpandedNodeResize(
  { doc, getRunningNumber }: UseExpandedNodeResizeProps,
  config: ResizeConfig = {}
): {
  handleResize: (nodeId: string, direction: ResizeDirection) => void;
  getMetadata: (nodeId: string) => ExpandedNodeMetadata | null;
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  /**
   * Get metadata for a node by its ID
   * Returns null if node is not expanded or running number is not found
   */
  const getMetadata = useCallback(
    (nodeId: string): ExpandedNodeMetadata | null => {
      const runningNumber = getRunningNumber(nodeId);
      if (runningNumber === undefined) {
        return null;
      }
      return loadExpandedNodeMetadata(doc, runningNumber);
    },
    [doc, getRunningNumber]
  );

  /**
   * Handle resize for an expanded node
   * Updates the width or height multiplier based on direction
   */
  const handleResize = useCallback(
    (nodeId: string, direction: ResizeDirection) => {
      const runningNumber = getRunningNumber(nodeId);
      if (runningNumber === undefined) {
        return; // Node is not expanded or doesn't have a running number
      }

      const metadata = loadExpandedNodeMetadata(doc, runningNumber);
      let newWidth = metadata.width || 4;
      let newHeight = metadata.height || 4;

      // Calculate new dimensions based on direction
      switch (direction) {
        case 'width+':
          newWidth = Math.min(finalConfig.maxWidth, newWidth + finalConfig.step);
          break;
        case 'width-':
          newWidth = Math.max(finalConfig.minWidth, newWidth - finalConfig.step);
          break;
        case 'height+':
          newHeight = Math.min(finalConfig.maxHeight, newHeight + finalConfig.step);
          break;
        case 'height-':
          newHeight = Math.max(finalConfig.minHeight, newHeight - finalConfig.step);
          break;
      }

      // Save updated metadata
      const updatedMetadata: ExpandedNodeMetadata = {
        ...metadata,
        width: newWidth,
        height: newHeight,
      };

      saveExpandedNodeMetadata(doc, runningNumber, updatedMetadata);
    },
    [doc, getRunningNumber, finalConfig]
  );

  return {
    handleResize,
    getMetadata,
  };
}
