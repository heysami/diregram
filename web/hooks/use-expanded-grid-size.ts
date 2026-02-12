/**
 * ⚠️ IMPORTANT: This hook is stable and working. Do not modify unless fixing bugs.
 * 
 * This hook handles all expanded node grid size functionality.
 * Modifying this hook can break existing grid size behavior for expanded nodes.
 * 
 * If you need different grid size behavior, consider:
 * 1. Creating a new hook for your specific use case
 * 2. Extending this hook with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

import { useCallback } from 'react';
import * as Y from 'yjs';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata, ExpandedNodeMetadata } from '@/lib/expanded-node-metadata';

export type GridSizeDimension = 'columns' | 'rows';
export type GridSizeDelta = 1 | -1;

interface UseExpandedGridSizeProps {
  doc: Y.Doc;
  getRunningNumber: (nodeId: string) => number | undefined;
}

interface GridSizeConfig {
  minSize?: number; // Minimum grid size (default: 1)
  maxSize?: number; // Maximum grid size (default: 10)
  visualStep?: number; // Step size for visual width/height adjustment (default: 0.5)
  visualMin?: number; // Minimum visual width/height (default: 1)
  visualMax?: number; // Maximum visual width/height (default: 10)
}

const DEFAULT_CONFIG: Required<GridSizeConfig> = {
  minSize: 1,
  maxSize: 10,
  visualStep: 0.5,
  visualMin: 1,
  visualMax: 10,
};

interface ExpandedGridNode {
  gridX: number;
  gridY: number;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Modularized hook for managing expanded node grid size functionality.
 * 
 * IMPORTANT: This hook is self-contained and should not be modified when adding new features.
 * All expanded node grid size logic is encapsulated here to prevent breaking existing functionality.
 * 
 * This hook handles:
 * 1. Loading current metadata and grid nodes for an expanded node
 * 2. Validating grid size changes (ensuring existing nodes aren't cut off)
 * 3. Updating both grid size (gridWidth/gridHeight) and visual size (width/height)
 * 4. Saving updated metadata back to markdown
 * 5. Enforcing min/max constraints
 * 
 * Features:
 * - Automatic persistence to markdown using running numbers (stable identifiers)
 * - Validates that shrinking won't cut off existing grid nodes
 * - Automatically adjusts visual width/height when grid size changes
 * - Respects min/max constraints for both grid and visual dimensions
 * 
 * Usage:
 * ```tsx
 * const { handleGridSizeChange } = useExpandedGridSize({ doc, getRunningNumber });
 * 
 * // In your component:
 * <button onClick={() => handleGridSizeChange(nodeId, 'columns', +1)}>
 *   Add Column
 * </button>
 * ```
 */
export function useExpandedGridSize(
  { doc, getRunningNumber }: UseExpandedGridSizeProps,
  config: GridSizeConfig = {}
): {
  handleGridSizeChange: (nodeId: string, dimension: GridSizeDimension, delta: GridSizeDelta) => void;
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  /**
   * Load grid nodes from markdown for a given running number
   */
  const loadGridNodes = useCallback(
    (runningNumber: number): ExpandedGridNode[] => {
      const yText = doc.getText('nexus');
      const currentText = yText.toString();
      const match = currentText.match(new RegExp(`\`\`\`expanded-grid-${runningNumber}\\n([\\s\\S]*?)\\n\`\`\``));
      
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch {
          // Ignore parse errors and treat as no grid nodes
        }
      }
      
      return [];
    },
    [doc]
  );

  /**
   * Handle grid size change for an expanded node
   * Updates both grid dimensions (gridWidth/gridHeight) and visual dimensions (width/height)
   * Validates that shrinking won't cut off existing grid nodes
   */
  const handleGridSizeChange = useCallback(
    (nodeId: string, dimension: GridSizeDimension, delta: GridSizeDelta) => {
      const runningNumber = getRunningNumber(nodeId);
      if (runningNumber === undefined) {
        return; // Node is not expanded or doesn't have a running number
      }

      const metadata = loadExpandedNodeMetadata(doc, runningNumber);
      const currentCols = metadata.gridWidth ?? metadata.gridSize ?? 4;
      const currentRows = metadata.gridHeight ?? metadata.gridSize ?? 4;
      const currentWidth = metadata.width ?? 4;
      const currentHeight = metadata.height ?? 4;

      let newCols = currentCols;
      let newRows = currentRows;
      let newWidth = currentWidth;
      let newHeight = currentHeight;

      // Calculate new grid dimensions
      if (dimension === 'columns') {
        newCols = currentCols + delta;
        // Nudge visual width along with column count
        newWidth = Math.min(
          finalConfig.visualMax,
          Math.max(finalConfig.visualMin, currentWidth + delta * finalConfig.visualStep)
        );
      } else {
        newRows = currentRows + delta;
        // Nudge visual height along with row count
        newHeight = Math.min(
          finalConfig.visualMax,
          Math.max(finalConfig.visualMin, currentHeight + delta * finalConfig.visualStep)
        );
      }

      // Validate min/max constraints
      if (
        newCols < finalConfig.minSize ||
        newCols > finalConfig.maxSize ||
        newRows < finalConfig.minSize ||
        newRows > finalConfig.maxSize
      ) {
        return;
      }

      // When shrinking, ensure existing grid nodes still fit within bounds
      const gridNodes = loadGridNodes(runningNumber);

      if (dimension === 'columns' && newCols < currentCols) {
        const invalid = gridNodes.some(n => n.gridX + n.gridWidth > newCols);
        if (invalid) {
          return; // Would cut off existing grid nodes
        }
      }

      if (dimension === 'rows' && newRows < currentRows) {
        const invalid = gridNodes.some(n => n.gridY + n.gridHeight > newRows);
        if (invalid) {
          return; // Would cut off existing grid nodes
        }
      }

      // Save updated metadata
      const updatedMetadata: ExpandedNodeMetadata = {
        ...metadata,
        gridWidth: newCols,
        gridHeight: newRows,
        width: newWidth,
        height: newHeight,
      };

      saveExpandedNodeMetadata(doc, runningNumber, updatedMetadata);
    },
    [doc, getRunningNumber, finalConfig, loadGridNodes]
  );

  return {
    handleGridSizeChange,
  };
}
