import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NexusNode } from '@/types/nexus';
import { Plus, X, Lock } from 'lucide-react';
import * as Y from 'yjs';
import {
  ExpandedGridNodeRuntime,
  loadExpandedGridNodesFromDoc,
  saveExpandedGridNodesToDoc,
} from '@/lib/expanded-grid-storage';
import { loadDataObjects } from '@/lib/data-object-storage';

type GridNode = ExpandedGridNodeRuntime;

interface ExpandedNodeViewProps {
  node: NexusNode;
  doc: Y.Doc;
  styleClass: string;
  nodeMap: Map<string, NexusNode>;
  runningNumber: number; // Running number for this expanded node (stable identifier)
  onAddNode: (gridX: number, gridY: number) => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectGridNode?: (gridNodeKey: string) => void;
  selectedGridNodeKey?: string | null;
  gridWidth?: number;
  gridHeight?: number;
  onGridSizeChange?: (width: number, height: number) => void;
}

export function ExpandedNodeView({ node, doc, styleClass, nodeMap, runningNumber, onAddNode, onDeleteNode, onSelectGridNode, selectedGridNodeKey, gridWidth = 4, gridHeight = 4, onGridSizeChange }: ExpandedNodeViewProps) {
  const GRID_WIDTH = gridWidth;
  const GRID_HEIGHT = gridHeight;
  // Calculate cell size to fully occupy the expanded node (4x the normal size)
  // NODE_WIDTH * 4 = 600px, NODE_HEIGHT * 4 = ~160px (minimum)
  // Account for padding: use ~95% of available space
  // Note: GRID_CELL_SIZE is no longer used but kept for reference
  // const GRID_CELL_SIZE = Math.floor((150 * 4 * 0.95) / GRID_WIDTH); // ~142px per cell
  
  // Load grid nodes from markdown code block - MUST be declared before useEffect
  // Use running number instead of node.id (stable identifier that survives node moves)
  const [gridNodes, setGridNodes] = useState<GridNode[]>(() => {
    const loaded = loadExpandedGridNodesFromDoc(doc, runningNumber, node.id);
    return loaded.nodes;
  });
  
  // Drag state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; gridX: number; gridY: number } | null>(null);
  
  // Resize state
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; gridX: number; gridY: number; gridWidth: number; gridHeight: number; edge: 'right' | 'bottom' | 'left' | 'top' | 'corner' } | null>(null);
  
  // Editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const selectedKeysSet = useMemo(() => new Set(selectedGridNodeKey ? [selectedGridNodeKey] : []), [selectedGridNodeKey]);

  const childDataObjectIds = useMemo(() => {
    const ids = new Set<string>();
    node.children.forEach((c) => {
      if (c.dataObjectId) ids.add(c.dataObjectId);
    });
    return ids;
  }, [node.children]);

  const isLockedGridNode = useCallback(
    (n: GridNode): boolean => {
      if ((n as unknown as Record<string, unknown>).sourceFlowNodeId) return true;
      if (!n.sourceChildDataObjectId) return false;
      return childDataObjectIds.has(n.sourceChildDataObjectId);
    },
    [childDataObjectIds],
  );
  
  // Convert pixel coordinates to grid coordinates
  const pixelToGrid = useCallback((pixelX: number, pixelY: number): { gridX: number; gridY: number } => {
    if (!gridContainerRef.current) return { gridX: 0, gridY: 0 };
    const rect = gridContainerRef.current.getBoundingClientRect();
    const gap = 2;
    const totalGapWidth = (GRID_WIDTH - 1) * gap;
    const totalGapHeight = (GRID_HEIGHT - 1) * gap;
    const cellWidth = (rect.width - totalGapWidth) / GRID_WIDTH;
    const cellHeight = (rect.height - totalGapHeight) / GRID_HEIGHT;
    
    const relativeX = pixelX - rect.left;
    const relativeY = pixelY - rect.top;
    
    // Calculate which grid cell the point is in
    // Account for gaps between cells
    let gridX = 0;
    let gridY = 0;
    
    for (let i = 0; i < GRID_WIDTH; i++) {
      const cellStart = i * (cellWidth + gap);
      const cellEnd = cellStart + cellWidth;
      if (relativeX >= cellStart && relativeX <= cellEnd) {
        gridX = i;
        break;
      } else if (relativeX > cellEnd && relativeX < cellEnd + gap && i < GRID_WIDTH - 1) {
        // In gap, snap to next cell
        gridX = i + 1;
        break;
      }
    }
    
    for (let i = 0; i < GRID_HEIGHT; i++) {
      const cellStart = i * (cellHeight + gap);
      const cellEnd = cellStart + cellHeight;
      if (relativeY >= cellStart && relativeY <= cellEnd) {
        gridY = i;
        break;
      } else if (relativeY > cellEnd && relativeY < cellEnd + gap && i < GRID_HEIGHT - 1) {
        // In gap, snap to next cell
        gridY = i + 1;
        break;
      }
    }
    
    gridX = Math.max(0, Math.min(GRID_WIDTH - 1, gridX));
    gridY = Math.max(0, Math.min(GRID_HEIGHT - 1, gridY));
    
    return { gridX, gridY };
  }, [GRID_WIDTH, GRID_HEIGHT]);
  
  // Handle drag start
  const handleDragStart = (e: React.MouseEvent, gridNode: GridNode) => {
    e.stopPropagation();
    setDraggingNodeId(gridNode.id);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      gridX: gridNode.gridX,
      gridY: gridNode.gridY,
    });
  };
  
  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, gridNode: GridNode, edge: 'right' | 'bottom' | 'left' | 'top' | 'corner') => {
    e.stopPropagation();
    setResizingNodeId(gridNode.id);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      gridX: gridNode.gridX,
      gridY: gridNode.gridY,
      gridWidth: gridNode.gridWidth,
      gridHeight: gridNode.gridHeight,
      edge,
    });
  };
  
  // Save grid nodes to a non-rendering markdown section
  // Store in a code block that the parser will ignore (using a custom type)
  const saveGridNodes = useCallback(
    (nodes: GridNode[]) => {
      // Always write in the stable, id-free format; also remove any legacy node.id blocks.
      saveExpandedGridNodesToDoc(doc, runningNumber, nodes, node.id);
      setGridNodes(nodes);
    },
    [doc, runningNumber, node.id]
  );

  const findFirstEmptyCell = useCallback(
    (nodes: GridNode[]): { x: number; y: number } | null => {
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const occupied = nodes.some((n) => x >= n.gridX && x < n.gridX + n.gridWidth && y >= n.gridY && y < n.gridY + n.gridHeight);
          if (!occupied) return { x, y };
        }
      }
      return null;
    },
    [GRID_HEIGHT, GRID_WIDTH],
  );

  const syncAutoNodesFromChildren = useCallback(
    (nodes: GridNode[]): GridNode[] => {
      const store = loadDataObjects(doc);
      const nameById = new Map<string, string>();
      store.objects.forEach((o) => nameById.set(o.id, o.name));

      const childIds = Array.from(childDataObjectIds.values());
      const nodesBySource = new Map<string, GridNode>();
      nodes.forEach((n) => {
        if (n.sourceChildDataObjectId) nodesBySource.set(n.sourceChildDataObjectId, n);
      });

      let next = [...nodes];

      // Create or sync nodes for each child data object id
      childIds.forEach((doid) => {
        const existing = nodesBySource.get(doid) || next.find((n) => n.dataObjectId === doid && n.gridWidth === 1 && n.gridHeight === 1);
        const label = nameById.get(doid) || doid;
        if (existing) {
          const updated = {
            ...existing,
            sourceChildDataObjectId: doid,
            dataObjectId: doid,
            content: label,
          };
          next = next.map((n) => ((n.key || n.id) === (existing.key || existing.id) ? updated : n));
        } else {
          const empty = findFirstEmptyCell(next);
          if (!empty) return;
          const safe = doid.replace(/[^a-zA-Z0-9_-]/g, '_');
          const key = `auto-${runningNumber}-${safe}`;
          const newNode: GridNode = {
            id: key,
            key,
            content: label,
            dataObjectId: doid,
            sourceChildDataObjectId: doid,
            uiType: 'content',
            gridX: empty.x,
            gridY: empty.y,
            gridWidth: 1,
            gridHeight: 1,
          };
          next = [...next, newNode];
        }
      });

      // Unlock nodes whose child no longer exists/linked
      next = next.map((n) => {
        if (n.sourceChildDataObjectId && !childDataObjectIds.has(n.sourceChildDataObjectId)) {
          const { sourceChildDataObjectId, ...rest } = n;
          return rest;
        }
        return n;
      });

      return next;
    },
    [doc, childDataObjectIds, findFirstEmptyCell, runningNumber],
  );

  // Handle mouse move for drag and resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingNodeId && dragStart) {
        const gridNode = gridNodes.find(n => n.id === draggingNodeId);
        if (!gridNode) return;
        
        const { gridX: newGridX, gridY: newGridY } = pixelToGrid(e.clientX, e.clientY);
        
        // Check bounds
        if (newGridX < 0 || newGridY < 0 || 
            newGridX + gridNode.gridWidth > GRID_WIDTH || 
            newGridY + gridNode.gridHeight > GRID_HEIGHT) {
          return;
        }
        
        // Check for conflicts with other nodes
        const conflicts = gridNodes.some(n => {
          if (n.id === draggingNodeId) return false;
          return !(
            newGridX + gridNode.gridWidth <= n.gridX ||
            newGridX >= n.gridX + n.gridWidth ||
            newGridY + gridNode.gridHeight <= n.gridY ||
            newGridY >= n.gridY + n.gridHeight
          );
        });
        
        if (!conflicts) {
          const updatedNodes = gridNodes.map(n =>
            n.id === draggingNodeId
              ? { ...n, gridX: newGridX, gridY: newGridY }
              : n
          );
          saveGridNodes(updatedNodes);
        }
      } else if (resizingNodeId && resizeStart) {
        const gridNode = gridNodes.find(n => n.id === resizingNodeId);
        if (!gridNode) return;
        
        const { gridX: newGridX, gridY: newGridY } = pixelToGrid(e.clientX, e.clientY);
        
        let newX = resizeStart.gridX;
        let newY = resizeStart.gridY;
        let newWidth = resizeStart.gridWidth;
        let newHeight = resizeStart.gridHeight;
        
        // Handle right edge or corner (right side)
        if (resizeStart.edge === 'right' || resizeStart.edge === 'corner') {
          // Calculate width based on how far right the mouse is
          const targetGridX = Math.max(resizeStart.gridX, newGridX);
          newWidth = Math.max(1, Math.min(GRID_WIDTH - resizeStart.gridX, targetGridX - resizeStart.gridX + 1));
        }
        
        // Handle bottom edge or corner (bottom side)
        if (resizeStart.edge === 'bottom' || resizeStart.edge === 'corner') {
          // Calculate height based on how far down the mouse is
          const targetGridY = Math.max(resizeStart.gridY, newGridY);
          newHeight = Math.max(1, Math.min(GRID_HEIGHT - resizeStart.gridY, targetGridY - resizeStart.gridY + 1));
        }
        
        // Handle left edge
        if (resizeStart.edge === 'left') {
          // Calculate new X position and width
          const targetGridX = Math.min(resizeStart.gridX + resizeStart.gridWidth - 1, newGridX);
          const minX = Math.max(0, targetGridX);
          newX = minX;
          newWidth = resizeStart.gridX + resizeStart.gridWidth - newX;
          // Ensure minimum size
          if (newWidth < 1) {
            newWidth = 1;
            newX = resizeStart.gridX + resizeStart.gridWidth - 1;
          }
        }
        
        // Handle top edge
        if (resizeStart.edge === 'top') {
          // Calculate new Y position and height
          const targetGridY = Math.min(resizeStart.gridY + resizeStart.gridHeight - 1, newGridY);
          const minY = Math.max(0, targetGridY);
          newY = minY;
          newHeight = resizeStart.gridY + resizeStart.gridHeight - newY;
          // Ensure minimum size
          if (newHeight < 1) {
            newHeight = 1;
            newY = resizeStart.gridY + resizeStart.gridHeight - 1;
          }
        }
        
        // Ensure bounds
        if (newX < 0 || newY < 0 || newX + newWidth > GRID_WIDTH || newY + newHeight > GRID_HEIGHT) {
          return;
        }
        
        // Check for conflicts
        const conflicts = gridNodes.some(n => {
          if (n.id === resizingNodeId) return false;
          return !(
            newX + newWidth <= n.gridX ||
            newX >= n.gridX + n.gridWidth ||
            newY + newHeight <= n.gridY ||
            newY >= n.gridY + n.gridHeight
          );
        });
        
        if (!conflicts) {
          const updatedNodes = gridNodes.map(n =>
            n.id === resizingNodeId
              ? { ...n, gridX: newX, gridY: newY, gridWidth: newWidth, gridHeight: newHeight }
              : n
          );
          saveGridNodes(updatedNodes);
        }
      }
    };
    
    const handleMouseUp = () => {
      setDraggingNodeId(null);
      setDragStart(null);
      setResizingNodeId(null);
      setResizeStart(null);
    };
    
    if (draggingNodeId || resizingNodeId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNodeId, dragStart, resizingNodeId, resizeStart, gridNodes, saveGridNodes, pixelToGrid, GRID_WIDTH, GRID_HEIGHT]);
  
  // Focus input when editing starts
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // Reload when document changes
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => {
      const currentText = yText.toString();
      const loaded = loadExpandedGridNodesFromDoc(doc, runningNumber, node.id);
      const synced = syncAutoNodesFromChildren(loaded.nodes);
      setGridNodes(synced);

      // Auto-migrate if ids were persisted, or if legacy block was used.
      if (loaded.hadPersistedIds || loaded.hadMissingKeys || loaded.source === 'legacyNodeId') {
        saveExpandedGridNodesToDoc(doc, runningNumber, synced, node.id);
      } else if (JSON.stringify(synced) !== JSON.stringify(loaded.nodes)) {
        // Sync auto nodes if needed
        saveExpandedGridNodesToDoc(doc, runningNumber, synced, node.id);
      }
    };
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc, runningNumber, node.id, syncAutoNodesFromChildren]);

  const handleAddNode = (gridX: number, gridY: number) => {
    // Check if position is already occupied
    const isOccupied = gridNodes.some(n => 
      gridX < n.gridX + n.gridWidth && 
      gridX + 1 > n.gridX &&
      gridY < n.gridY + n.gridHeight && 
      gridY + 1 > n.gridY
    );
    
    if (isOccupied) return;
    
    // Generate unique ID based on running number (stable) and counter
    // Extract counter from existing grid node IDs to ensure uniqueness
    const existingCounters = gridNodes
      .map(n => {
        const match = n.id.match(/^grid-\d+-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextCounter = existingCounters.length > 0 ? Math.max(...existingCounters) + 1 : 1;
    
    // Create a grid node that exactly occupies this cell
    // Store only in metadata, NOT as a child node in the tree
    // Use running number (stable) instead of node.id (unstable)
    const newNode: GridNode = {
      id: `grid-${runningNumber}-${nextCounter}`,
      content: 'New Node',
      gridX,
      gridY,
      gridWidth: 1,
      gridHeight: 1,
    };
    
    // Save to grid metadata only (not in tree structure)
    saveGridNodes([...gridNodes, newNode]);
    
    onAddNode(gridX, gridY);
  };

  const handleDeleteNode = (nodeId: string) => {
    const target = gridNodes.find((n) => n.id === nodeId);
    if (target && isLockedGridNode(target)) {
      return;
    }
    saveGridNodes(gridNodes.filter(n => n.id !== nodeId));
    onDeleteNode(nodeId);
  };

  const startEditing = (gridNodeId: string) => {
    const gridNode = gridNodes.find(n => n.id === gridNodeId);
    if (!gridNode) return;
    setEditingNodeId(gridNodeId);
    setEditValue(gridNode.content);
  };

  const commitEdit = () => {
    if (!editingNodeId) return;
    
    const updatedNodes = gridNodes.map(n =>
      n.id === editingNodeId
        ? { ...n, content: editValue.trim() || 'New Node' }
        : n
    );
    saveGridNodes(updatedNodes);
    setEditingNodeId(null);
    setEditValue('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      setEditingNodeId(null);
      setEditValue('');
    }
  };

  // Check if a grid cell is occupied
  const isCellOccupied = (x: number, y: number): GridNode | null => {
    return gridNodes.find(n => 
      x >= n.gridX && x < n.gridX + n.gridWidth &&
      y >= n.gridY && y < n.gridY + n.gridHeight
    ) || null;
  };

  // Handle node resizing (spanning)
  const handleResizeNode = (nodeId: string, newWidth: number, newHeight: number) => {
    const node = gridNodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Check bounds
    if (node.gridX + newWidth > GRID_WIDTH || node.gridY + newHeight > GRID_HEIGHT) return;
    
    // Check if new area conflicts with other nodes
    const conflicts = gridNodes.some(n => {
      if (n.id === nodeId) return false;
      return !(
        node.gridX + newWidth <= n.gridX ||
        node.gridX >= n.gridX + n.gridWidth ||
        node.gridY + newHeight <= n.gridY ||
        node.gridY >= n.gridY + n.gridHeight
      );
    });
    
    if (conflicts) return;
    
    const updatedNodes = gridNodes.map(n => 
      n.id === nodeId 
        ? { ...n, gridWidth: newWidth, gridHeight: newHeight }
        : n
    );
    
    saveGridNodes(updatedNodes);
  };

  // Extract pattern/background from styleClass (mac3 uses pattern classes, not colors)
  const fillClass =
    styleClass.match(/mac-fill--[a-z0-9-]+/)?.[0] ||
    styleClass.match(/bg-\w+-\d+/)?.[0] ||
    'bg-white';

  const gridCellBgClass = 'mac-fill--dots-1';

  // Map legacy "color names" to pattern fills (stored in expanded-grid data).
  const nodeBgMap: Record<string, string> = {
    blue: 'mac-fill--dots-1',
    red: 'mac-fill--dots-2',
    green: 'mac-fill--dots-3',
    purple: 'mac-fill--hatch',
    orange: 'mac-fill--hatch2',
    pink: 'mac-fill--stripes-h',
    cyan: 'mac-fill--stripes-v',
    yellow: 'mac-fill--checker',
    gray: 'mac-fill--dots-2',
    slate: 'mac-fill--dots-3',
  };

  const badgeBgClass = 'bg-black';
  const badgeBorderClass = 'border-black';
  
  return (
    <div className={`w-full h-full flex flex-col ${fillClass} relative`}>
      {/* Badge showing original node content - aligned with top border */}
      <div className={`absolute -top-9 -left-[13px] z-30 px-2 py-1 ${badgeBgClass} ${badgeBorderClass} border-2 border-dashed text-white text-xs font-medium max-w-[150px] truncate whitespace-nowrap`}>
        {node.content}
      </div>
      
      {/* Grid Container - fully occupying the expanded node */}
      <div 
        ref={gridContainerRef}
        className="w-full h-full grid relative"
        style={{
          gridTemplateColumns: `repeat(${GRID_WIDTH}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_HEIGHT}, 1fr)`,
          gap: '2px',
        }}
      >
        {/* Render grid cells */}
        {Array.from({ length: GRID_WIDTH * GRID_HEIGHT }).map((_, index) => {
          const x = index % GRID_WIDTH;
          const y = Math.floor(index / GRID_WIDTH);
          const occupiedNode = isCellOccupied(x, y);
          const isTopLeft = occupiedNode && occupiedNode.gridX === x && occupiedNode.gridY === y;
          
          return (
            <div
              key={index}
              className={`relative ${gridCellBgClass}`}
            >
              {/* Hint only (no pointer events): click (no-drag) on empty space adds via container mouseup handler */}
              {!occupiedNode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddNode(x, y);
                  }}
                  className="w-full h-full flex items-center justify-center text-gray-400 hover:text-blue-500 transition-all opacity-0 hover:opacity-100"
                  title="Add node"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          );
        })}
        
        {/* Render grid nodes that span multiple cells */}
        {gridNodes.map((gridNode) => {
          const gap = 2; // gap between cells
          const cellWidth = `calc((100% - ${(GRID_WIDTH - 1) * gap}px) / ${GRID_WIDTH})`;
          const cellHeight = `calc((100% - ${(GRID_HEIGHT - 1) * gap}px) / ${GRID_HEIGHT})`;
          
          return (
            <div
              key={gridNode.id}
              data-grid-node="true"
              className={`absolute ${nodeBgMap[gridNode.color || ''] || fillClass} border p-1 text-xs flex flex-col shadow-sm group cursor-move ${
                draggingNodeId === gridNode.id ? 'opacity-75' : ''
              } ${(selectedKeysSet.has((gridNode.key || gridNode.id) as string)) ? 'ring-2 ring-blue-500 border-blue-300' : 'border-gray-300'}`}
              style={{
                left: `calc(${gridNode.gridX} * (${cellWidth} + ${gap}px))`,
                top: `calc(${gridNode.gridY} * (${cellHeight} + ${gap}px))`,
                width: `calc(${gridNode.gridWidth} * ${cellWidth} + ${(gridNode.gridWidth - 1) * gap}px)`,
                height: `calc(${gridNode.gridHeight} * ${cellHeight} + ${(gridNode.gridHeight - 1) * gap}px)`,
                zIndex: draggingNodeId === gridNode.id || resizingNodeId === gridNode.id ? 20 : 10,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (editingNodeId === gridNode.id) return;
                const key = (gridNode.key || gridNode.id) as string;
                onSelectGridNode?.(key);
              }}
              onMouseDown={(e) => {
                // Only start drag if clicking on the node itself, not on buttons or textarea
                if ((e.target as HTMLElement).closest('button')) return;
                if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
                if (editingNodeId === gridNode.id) return;
                handleDragStart(e, gridNode);
              }}
            >
              {editingNodeId === gridNode.id ? (
                <textarea
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleInputKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-full text-center bg-transparent focus:outline-none resize-none text-gray-900 text-xs p-1"
                  style={{ lineHeight: '1.5' }}
                  autoFocus
                />
              ) : (
                <div className="flex items-center justify-center flex-1 relative">
                  <div
                    className="flex flex-col items-center justify-center text-gray-900 text-center cursor-text px-1 w-full"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEditing(gridNode.id);
                    }}
                  >
                    {gridNode.icon && gridNode.icon.trim().length > 0 && (
                      <div className="leading-none select-none" style={{ fontSize: '3em', lineHeight: '1', marginBottom: 4 }}>
                        {gridNode.icon}
                      </div>
                    )}
                    <span
                      className="w-full break-words whitespace-pre-wrap"
                    >
                      {gridNode.content}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(gridNode.id);
                    }}
                    className={`absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                      isLockedGridNode(gridNode) ? 'text-gray-400 cursor-not-allowed' : 'text-red-500 hover:text-red-700'
                    }`}
                    disabled={isLockedGridNode(gridNode)}
                    title={
                      isLockedGridNode(gridNode)
                        ? (gridNode as unknown as Record<string, unknown>).sourceFlowNodeId
                          ? 'Linked to a flow reference. Unassign the reference first.'
                          : 'Linked to a child data node. Delete/unlink that child first.'
                        : 'Delete'
                    }
                  >
                    {isLockedGridNode(gridNode) ? <Lock size={12} /> : <X size={12} />}
                  </button>
                </div>
              )}
              
              {/* Resize handles */}
              {/* Left edge */}
              <div
                className="absolute top-0 left-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-blue-300 transition-opacity z-10 cursor-ew-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeStart(e, gridNode, 'left');
                }}
              />
              {/* Right edge */}
              <div
                className="absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-blue-300 transition-opacity z-10 cursor-ew-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeStart(e, gridNode, 'right');
                }}
              />
              {/* Top edge */}
              <div
                className="absolute top-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-blue-300 transition-opacity z-10 cursor-ns-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeStart(e, gridNode, 'top');
                }}
              />
              {/* Bottom edge */}
              <div
                className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-blue-300 transition-opacity z-10 cursor-ns-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeStart(e, gridNode, 'bottom');
                }}
              />
              {/* Corner - bottom right */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 hover:bg-blue-400 transition-opacity z-10 cursor-nwse-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeStart(e, gridNode, 'corner');
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
