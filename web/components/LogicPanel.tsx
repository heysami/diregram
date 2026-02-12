import { useState, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';
import { calculateTreeLayout, NodeLayout } from '@/lib/layout-engine';
import { X, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useNexusStructure } from '@/hooks/use-nexus-structure';
import { buildConditionMatrixScenarios } from '@/lib/condition-matrix';
import { ConditionMatrixOverlay } from '@/components/ConditionMatrixOverlay';
import { upsertDimensionDescription, parseDimensionDescriptions, DimensionDescriptionMode } from '@/lib/dimension-descriptions';
import { serializeTableToMarkdown, parseTableFromMarkdown } from '@/lib/table-serialization';
import { parseFlowFromMarkdown } from '@/lib/flow-serialization';
import { loadDimensionDescriptions, saveDimensionDescriptions, DimensionDescriptionEntry } from '@/lib/dimension-description-storage';
import { matchNodeToDimensionDescription } from '@/lib/dimension-description-matcher';
import { DimensionFlowEditor, FlowNode } from '@/components/DimensionFlowEditor';
import { DimensionTableEditor, TableColumn, TableRow, MergedCell } from '@/components/DimensionTableEditor';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { isNodeInsideVariant } from '@/lib/variant-detection';
import { createDataObject, loadDataObjects, NexusDataObjectStore } from '@/lib/data-object-storage';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { DataObjectAttributeMultiSelect } from '@/components/DataObjectAttributeMultiSelect';
import {
  createTag,
  loadTagStore,
  type NexusTag,
  type NexusTagGroup,
  type NexusTagStore,
} from '@/lib/tag-store';

// Simple toast state
let toastMessage: string | null = null;
const toastListeners: Set<() => void> = new Set();

const showToast = (message: string) => {
  toastMessage = message;
  toastListeners.forEach(listener => listener());
  setTimeout(() => {
    toastMessage = null;
    toastListeners.forEach(listener => listener());
  }, 3000);
};

const useToast = () => {
  const [message, setMessage] = useState<string | null>(null);
  
  useEffect(() => {
    const listener = () => setMessage(toastMessage);
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);
  
  return message;
};

interface Props {
  node: NexusNode; // VISUAL node (Primary/Hub)
  doc: Y.Doc;
  activeVariantId: string | null; // Pass down active variant ID
  roots: NexusNode[]; // Full tree to build node map for parent traversal
  expandedNodes: Set<string>;
  onExpandedNodesChange: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  processFlowModeNodes?: Set<string>;
  onProcessFlowModeNodesChange?: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  onSelectConditions?: (conditions: Record<string, string>) => void;
  getRunningNumber: (nodeId: string) => number | undefined; // Function to get running number for a node
}

export function LogicPanel({ node, doc, activeVariantId, roots, expandedNodes, onExpandedNodesChange, processFlowModeNodes, onProcessFlowModeNodesChange, onSelectConditions, getRunningNumber }: Props) {
  const structure = useNexusStructure(doc, roots);
  const toastMessage = useToast();
  
  // Build node map for parent traversal
  const nodeMap = useMemo(() => {
    const map = new Map<string, NexusNode>();
    const traverse = (nodes: NexusNode[]) => {
      nodes.forEach(n => {
        map.set(n.id, n);
        if (n.isHub && n.variants) {
          n.variants.forEach(v => {
            map.set(v.id, v);
            traverse(v.children);
          });
        } else {
          traverse(n.children);
        }
      });
    };
    traverse(roots);
    return map;
  }, [roots]);

  /**
   * Resolve the "hub context" for this panel.
   *
   * Important: during conditional conversion, the currently selected `node` can briefly be
   * a variant (or stale), where `node.variants` is empty. The auto-generation effect below
   * must always de-dupe against the *hub's* variants, otherwise it can repeatedly insert
   * the same (key=value) combo into markdown and freeze the page.
   */
  const hubNode = useMemo<NexusNode>(() => {
    if (node.isHub && node.variants && node.variants.length > 0) return node;

    // Fast path: parent is hub.
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent?.isHub && parent.variants && parent.variants.length > 0) return parent;
    }

    // Slow path: scan hubs to find one whose variants subtree contains this node.
    const contains = (root: NexusNode, targetId: string): NexusNode | null => {
      const stack: NexusNode[] = [root];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur.isHub && cur.variants) {
          for (const variant of cur.variants) {
            const vStack: NexusNode[] = [variant];
            while (vStack.length) {
              const v = vStack.pop()!;
              if (v.id === targetId) return cur;
              v.children.forEach((c) => vStack.push(c));
            }
          }
        }
        cur.children.forEach((c) => stack.push(c));
      }
      return null;
    };

    for (const r of roots) {
      const found = contains(r, node.id);
      if (found) return found;
    }

    // Fallback: treat the selected node as its own context (no hub yet / not in a hub).
    return node;
  }, [node, nodeMap, roots]);
  
  // Check if this is a root process node (parent is NOT a process node) vs a child process node
  const isRootProcessNode = useMemo(() => {
    if (!node.isFlowNode) return false; // Not a process node at all
    if (!node.parentId) return true; // Root level node, so it's a root process node
    const parent = nodeMap.get(node.parentId);
    return !parent?.isFlowNode; // Root if parent is not a process node
  }, [node, nodeMap]);
  
  // Check if this is a child of a process node (should not show toggles)
  const isChildOfProcessNode = useMemo(() => {
    if (!node.parentId) return false;
    const parent = nodeMap.get(node.parentId);
    return parent?.isFlowNode === true;
  }, [node, nodeMap]);

  // Check if this node is inside a variant (for showing "Common across variants" toggle)
  // Use modularized variant detection utility
  const isInsideVariant = useMemo(() => {
    return isNodeInsideVariant(node, nodeMap, roots);
  }, [node, nodeMap, roots]);

  // Extract all unique keys and their values from existing variants
  const dimensionMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    
    if (hubNode.variants) {
      hubNode.variants.forEach(v => {
        if (v.conditions) {
          Object.entries(v.conditions).forEach(([key, value]) => {
            if (!map.has(key)) {
              map.set(key, new Set());
            }
            map.get(key)!.add(value);
          });
        }
      });
    }
    
    return map;
  }, [hubNode.variants]);

  // State: Map of key -> array of values (for editing)
  const [keyValues, setKeyValues] = useState<Map<string, string[]>>(new Map());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [addingValueFor, setAddingValueFor] = useState<string | null>(null);
  const [newValueInput, setNewValueInput] = useState('');
  const [editingValue, setEditingValue] = useState<{key: string, oldValue: string, currentValue: string} | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState<string>('');
  const [iconInput, setIconInput] = useState<string>('');
  const [dataObjectStore, setDataObjectStore] = useState<NexusDataObjectStore>(() => loadDataObjects(doc));
  const [newDataObjectName, setNewDataObjectName] = useState('');
  const [tagStore, setTagStore] = useState<NexusTagStore>(() => loadTagStore(doc));
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const editingValueRef = useRef<{key: string, oldValue: string} | null>(null);
  const editingKeyRef = useRef<string | null>(null);
  const lastNodeIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const autoGenLastInsertRef = useRef<string>('');
  const [showMatrix, setShowMatrix] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<DimensionDescriptionMode | null>(null);
  const [descriptionDimensionKey, setDescriptionDimensionKey] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[] | null>(null);
  const [flowEdges, setFlowEdges] = useState<Record<string, { label: string; color: string }> | null>(null);
  const [tableColumns, setTableColumns] = useState<TableColumn[] | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[] | null>(null);
  const [tableMergedCells, setTableMergedCells] = useState<Map<string, MergedCell> | null>(null);
  
  // Track running numbers for dimension descriptions (similar to expanded nodes)
  const dimensionDescriptionRunningNumberMapRef = useRef<Map<string, number>>(new Map()); // Map from "nodeId::dimensionKey::mode" to runningNumber

  // Load dimension descriptions when modal opens
  const isLoadingDescRef = useRef(false);
  useEffect(() => {
    if (!showDescriptionModal || !descriptionMode || !descriptionDimensionKey || isLoadingDescRef.current) {
      return;
    }
    
    isLoadingDescRef.current = true;
    const yText = doc.getText('nexus');
    const currentText = yText.toString();
    
    // Load dimension description state
    const descData = loadDimensionDescriptions(doc);
    
    // ⚠️ DIMENSION DESCRIPTION MATCHING: Use the modularized matcher - do not modify matching logic here
    // All dimension description matching functionality is handled by dimension-description-matcher.ts
    // See: web/lib/dimension-description-matcher.ts
    // Get running number for this node+dimension+mode combination
    const match = matchNodeToDimensionDescription(
      node,
      descriptionDimensionKey,
      descriptionMode,
      currentText,
      descData.entries,
      nodeMap
    );
    
    let runningNumber: number | undefined;
    if (match) {
      runningNumber = match.runningNumber;
      // Update mapping
      const key = `${node.id}::${descriptionDimensionKey}::${descriptionMode}`;
      dimensionDescriptionRunningNumberMapRef.current.set(key, runningNumber);
    }
    
    // Parse dimension descriptions from markdown
    const { blocks } = parseDimensionDescriptions(currentText);
    
    // Find the block by running number (preferred) or by legacy id
    const block = runningNumber
      ? blocks.find(b => b.runningNumber === runningNumber && b.mode === descriptionMode)
      : blocks.find(b => b.id === `${node.id}::${descriptionDimensionKey}` && b.mode === descriptionMode);
    
    if (block && block.bodyLines.length > 0) {
      if (descriptionMode === 'flow') {
        const parsed = parseFlowFromMarkdown(block.bodyLines);
        if (parsed) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFlowNodes(parsed.nodes);
          setFlowEdges(parsed.edges);
        }
      } else if (descriptionMode === 'table') {
        const parsed = parseTableFromMarkdown(block.bodyLines);
        if (parsed) {
          setTableColumns(parsed.columns);
          setTableRows(parsed.rows);
          setTableMergedCells(parsed.mergedCells);
        }
      }
    } else {
      // No existing description, reset to empty
      if (descriptionMode === 'flow') {
        setFlowNodes(null);
        setFlowEdges(null);
      } else {
        setTableColumns(null);
        setTableRows(null);
        setTableMergedCells(null);
      }
    }
    
    isLoadingDescRef.current = false;
  }, [showDescriptionModal, descriptionMode, descriptionDimensionKey, node, doc, nodeMap]);

  // Initialize keyValues from dimensionMap - only when node changes
  useEffect(() => {
    // Only re-initialize if we switched to a different node
    if (lastNodeIdRef.current !== node.id) {
      lastNodeIdRef.current = node.id;
      isInitializingRef.current = true;
      
      const newMap = new Map<string, string[]>();
      dimensionMap.forEach((values, key) => {
        newMap.set(key, Array.from(values).sort());
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setKeyValues(newMap);
      // Auto-expand all keys initially
      setExpandedKeys(new Set(newMap.keys()));
      
      // Reset after a tick
      setTimeout(() => {
        isInitializingRef.current = false;
      }, 0);
    }
    // Don't update when dimensionMap changes for the same node - let user edits persist
    // The auto-generation will create variants, and when node.variants updates, 
    // dimensionMap will update, but we don't want to reset keyValues
  }, [node.id]); // Only depend on node.id, not dimensionMap or keyValues

  // Keep icon input in sync when switching nodes / receiving remote updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIconInput(node.icon || '');
  }, [node.id, node.icon]);

  // Keep data objects in sync (shared store)
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setDataObjectStore(loadDataObjects(doc));
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  // Keep tag store in sync (shared store)
  useEffect(() => {
    const yText = doc.getText('nexus');
    const update = () => setTagStore(loadTagStore(doc));
    update();
    yText.observe(update);
    return () => yText.unobserve(update);
  }, [doc]);

  // Auto-generate combinations whenever keyValues changes
  useEffect(() => {
    // Skip auto-generation if we're currently editing a value or key
    if (editingValueRef.current || editingKeyRef.current) return;
    
    // Skip during initialization to prevent loops
    if (isInitializingRef.current) return;
    
    if (keyValues.size === 0) return;
    
    // Generate Cartesian Product
    const keys = Array.from(keyValues.keys());
    const valuesArrays = keys.map(k => keyValues.get(k) || []);
    
    if (valuesArrays.some(arr => arr.length === 0)) return; // Skip if any key has no values
    
    const combinations: Record<string, string>[] = [];
    
    const helper = (depth: number, currentCombo: Record<string, string>) => {
      if (depth === keys.length) {
        combinations.push(currentCombo);
        return;
      }
      
      const key = keys[depth];
      const values = valuesArrays[depth];
      values.forEach(val => {
        helper(depth + 1, { ...currentCombo, [key]: val });
      });
  };

    helper(0, {});

    // Filter out combinations that already exist (ALWAYS against hub variants, not the selected node)
    const existingCombos = new Set<string>();
    if (hubNode.variants) {
      hubNode.variants.forEach(v => {
        if (v.conditions) {
          const parts = Object.entries(v.conditions)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(p => `${p[0]}=${p[1]}`);
          existingCombos.add(parts.join(','));
        }
      });
    }

    const combosToAdd = combinations.filter(combo => {
      const parts = Object.entries(combo)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(p => `${p[0]}=${p[1]}`);
      return !existingCombos.has(parts.join(','));
    });

    // Add new combinations if any exist
    // We check existing variants to avoid duplicates, but we don't require them to exist
    if (combosToAdd.length > 0) {
      // Extra safety: avoid repeatedly scheduling the same insert while the doc is catching up.
      // This prevents a freeze if the selected `node` is momentarily not the hub and variants haven't hydrated yet.
      const signature = combosToAdd
        .map((c) => Object.entries(c).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join(','))
        .sort()
        .join('|');
      const safetyKey = `${hubNode.id}::${signature}`;
      if ((autoGenLastInsertRef.current || '') === safetyKey) return;

      // Use setTimeout to debounce rapid changes
      const timeoutId = setTimeout(() => {
        autoGenLastInsertRef.current = safetyKey;
        structure.addHubVariants(hubNode, activeVariantId, combosToAdd);
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [keyValues, hubNode, activeVariantId, structure]);
  
  // Sync refs with state
  useEffect(() => {
    editingValueRef.current = editingValue ? { key: editingValue.key, oldValue: editingValue.oldValue } : null;
  }, [editingValue]);

  useEffect(() => {
    editingKeyRef.current = editingKey;
  }, [editingKey]);

  const hasDimensions = keyValues.size > 0;

  // Scenarios for read-only condition matrix overlay
  const scenarios = useMemo(() => buildConditionMatrixScenarios(node), [node]);

  const tagGroups: NexusTagGroup[] = useMemo(() => {
    // Preserve persisted order (reorderable via the tag manager).
    return [...tagStore.groups];
  }, [tagStore.groups]);

  const tagsByGroup = useMemo(() => {
    const map = new Map<string, NexusTag[]>();
    tagStore.tags.forEach((t) => {
      const arr = map.get(t.groupId) || [];
      arr.push(t);
      map.set(t.groupId, arr);
    });
    map.forEach((arr, gid) => {
      arr.sort((a, b) => a.name.localeCompare(b.name));
      map.set(gid, arr);
    });
    return map;
  }, [tagStore.tags]);

  const tagById = useMemo(() => {
    return new Map<string, NexusTag>(tagStore.tags.map((t) => [t.id, t]));
  }, [tagStore.tags]);

  const flatTags = useMemo(() => {
    const groupNameById = new Map(tagGroups.map((g) => [g.id, g.name]));
    return tagStore.tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        groupId: t.groupId,
        groupName: groupNameById.get(t.groupId) || t.groupId,
      }))
      .sort((a, b) => (a.name.localeCompare(b.name) || a.groupName.localeCompare(b.groupName)));
  }, [tagStore.tags, tagGroups]);

  const filteredTagSuggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return flatTags.slice(0, 8);
    return flatTags
      .filter((t) => t.name.toLowerCase().includes(q) || `${t.groupName}/${t.name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [flatTags, tagInput]);

  const exactMatchTagId = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return null;
    const matches = flatTags.filter((t) => t.name.trim().toLowerCase() === q);
    if (matches.length === 1) return matches[0].id;
    return null;
  }, [flatTags, tagInput]);

  const effectiveTagIds = useMemo(() => {
    if (node.isHub && node.variants && node.variants.length > 0) {
      const s = new Set<string>();
      node.variants.forEach((v) => (v.tags || []).forEach((id) => s.add(id)));
      return Array.from(s);
    }
    return node.tags || [];
  }, [node]);

  const addKey = () => {
    const newKey = `key${keyValues.size + 1}`;
    const defaultValue = 'default';
    
    // Update local state: add the new dimension with its first value.
    // The auto-generation effect (Cartesian product) will create the corresponding
    // variants, and addHubVariantsImpl will clone children from the best matching
    // existing variant for each new combination.
    const newMap = new Map(keyValues);
    newMap.set(newKey, [defaultValue]);
    setKeyValues(newMap);
    setExpandedKeys(prev => new Set([...prev, newKey]));
  };

  const removeKey = (key: string) => {
    // Check if this is the last key (all conditions will be removed)
    const remainingKeys = new Set(keyValues.keys());
    remainingKeys.delete(key);
    const isLastKey = remainingKeys.size === 0;

    // If it's the last key and it has multiple values, do not allow removal.
    // User must first reduce to a single key=value pair before removing the last key.
    if (isLastKey) {
      const values = keyValues.get(key) || [];
      if (values.length > 1) {
        showToast('Cannot remove last key while it has multiple values. Remove values first until only one remains.');
        return;
      }
    }
    
    // If it's the last key, we'll convert back to regular node, so we don't need to check for children
    // Otherwise, check if any variant being deleted has non-common children
    if (!isLastKey) {
      const variantsToDelete: NexusNode[] = [];
      if (node.variants) {
        node.variants.forEach(variant => {
          if (variant.conditions && variant.conditions[key]) {
            variantsToDelete.push(variant);
          }
        });
      }
      
      // Check each variant for non-common children
      for (const variant of variantsToDelete) {
        const hasNonCommonChildren = (n: NexusNode): boolean => {
          if (n.children.length === 0) return false;
          // Check if any child is not common
          const hasNonCommon = n.children.some(child => !child.isCommon);
          if (hasNonCommon) return true;
          // Recursively check children
          return n.children.some(hasNonCommonChildren);
        };
        
        if (hasNonCommonChildren(variant)) {
          showToast('Cannot delete condition: variants have children that are not marked as common');
          return;
        }
      }
    }
    
    if (isLastKey && node.variants && node.variants.length > 0) {
      // Convert back to regular node: take the first variant and remove its condition
      const firstVariant = node.variants[0];
      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      
      // Find all variant line indices (all variants since this is the last key)
      const variantIndices = new Set<number>();
      node.variants.forEach(v => {
        variantIndices.add(v.lineIndex);
      });
      
      // Update the first variant to remove the condition, delete others
      const updatedLines: string[] = [];
      lines.forEach((line, index) => {
        if (index === firstVariant.lineIndex) {
          // Remove the condition from the first variant
          // Parse similar to the parser: extract indent, content, conditions, and common tag
          const match = line.match(/^(\s*)(.*)/);
          if (match) {
            const indent = match[1];
            const rest = match[2];
            
            // Extract base content (everything before first parenthesis)
            const contentMatch = rest.match(/^([^(]+)/);
            const content = contentMatch ? contentMatch[1].trim() : rest.trim();
            
            // Check if #common# tag exists
            const hasCommon = rest.includes('#common#');
            
            // Reconstruct without conditions, but keep #common# if it exists
            const commonTag = hasCommon ? ' #common#' : '';
            updatedLines.push(`${indent}${content}${commonTag}`);
          } else {
            updatedLines.push(line);
          }
        } else if (!variantIndices.has(index)) {
          updatedLines.push(line);
        }
      });
      
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedLines.join('\n'));
      });
    } else {
      // Normal removal: remove all variants with this key and their common children
      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      const indicesToRemove = new Set<number>();
      const childrenIndicesToRemove = new Set<number>();
      
      if (node.variants) {
        node.variants.forEach(variant => {
          if (variant.conditions && variant.conditions[key]) {
            indicesToRemove.add(variant.lineIndex);
            
            // Collect all common children indices
            const collectCommonChildren = (n: NexusNode) => {
              n.children.forEach(child => {
                if (child.isCommon) {
                  childrenIndicesToRemove.add(child.lineIndex);
                  collectCommonChildren(child);
                }
              });
            };
            collectCommonChildren(variant);
          }
        });
      }
      
      // Rebuild lines, excluding removed variants and their common children
      const updatedLines: string[] = [];
      lines.forEach((line, index) => {
        if (!indicesToRemove.has(index) && !childrenIndicesToRemove.has(index)) {
          updatedLines.push(line);
        }
      });
      
      if (indicesToRemove.size > 0) {
      doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, updatedLines.join('\n'));
        });
      }
    }
    
    // Update local state
    const newMap = new Map(keyValues);
    newMap.delete(key);
    setKeyValues(newMap);
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
      });
  };

  // Helper to update specific lines in markdown without affecting others
  const updateLinesInPlace = (updates: { index: number; text: string }[]) => {
    if (updates.length === 0) return;
      
      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      
    // Sort descending to update from bottom to top (avoids index shifts)
    updates.sort((a, b) => b.index - a.index);
    
    doc.transact(() => {
      // Track current state as we update
      const currentLines = [...lines];
      
      updates.forEach(u => {
        if (u.index >= currentLines.length) return;
        
        const oldLine = currentLines[u.index];
        const oldLineLength = oldLine.length;
        
        // Calculate start position based on current state
        let startPos = 0;
        for (let i = 0; i < u.index; i++) {
          startPos += currentLines[i].length + 1; // +1 for newline
        }
        
        // Replace the line
        yText.delete(startPos, oldLineLength);
        yText.insert(startPos, u.text);
        
        // Update our tracking copy for subsequent updates
        currentLines[u.index] = u.text;
      });
    });
  };

  const updateKeyName = (oldKey: string, newKey: string) => {
    if (!newKey.trim() || newKey === oldKey) return;
    if (keyValues.has(newKey)) return; // Prevent duplicates
      
    // Update existing variants in markdown: rename the key in all variants
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const updates: { index: number; text: string }[] = [];
    
    if (node.variants) {
      node.variants.forEach(variant => {
        if (variant.conditions && variant.conditions[oldKey] && variant.lineIndex < lines.length) {
          const newConditions = { ...variant.conditions };
          newConditions[newKey] = newConditions[oldKey];
          delete newConditions[oldKey];
          
          const match = lines[variant.lineIndex].match(/^(\s*)(.*)/);
          if (match) {
            const indent = match[1];
            const parts = Object.entries(newConditions).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`);
            let suffix = ` (${parts.join(', ')})`;
            if (variant.isCommon) suffix += ' #common#';
            
            updates.push({
              index: variant.lineIndex,
              text: `${indent}${variant.content}${suffix}`
            });
          }
        }
      });
    }
    
    // If no variants exist with this key yet, create one with the first value (or default)
    if (updates.length === 0) {
      const values = keyValues.get(oldKey) || [];
      const firstValue = values.length > 0 ? values[0] : 'default';
      // Create a new variant with the renamed key
      structure.addHubVariants(node, activeVariantId, [{ [newKey]: firstValue }]);
      } else {
      // Update lines in place
      updateLinesInPlace(updates);
    }
    
    // Update local state
    const values = keyValues.get(oldKey) || [];
    const newMap = new Map(keyValues);
    newMap.delete(oldKey);
    newMap.set(newKey, values);
    setKeyValues(newMap);
    
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.delete(oldKey);
      next.add(newKey);
      return next;
    });
  };

  const addValue = (key: string, value: string) => {
    if (!value.trim()) return;
    const newMap = new Map(keyValues);
    const values = newMap.get(key) || [];
    if (!values.includes(value.trim())) {
      newMap.set(key, [...values, value.trim()].sort());
      setKeyValues(newMap);
      
      // If this key has no existing variants, create one immediately
      // This ensures new keys with values are persisted
      const hasVariants = node.variants?.some(v => v.conditions?.[key]) || false;
      if (!hasVariants) {
        structure.addHubVariants(node, activeVariantId, [{ [key]: value.trim() }]);
      }
      // If key already has variants, the auto-generation useEffect will handle creating
      // all new combinations with this value. We don't need to do anything here.
    }
  };

  const removeValue = (key: string, value: string) => {
    // Check if this is the last value of the last key
    const remainingValues = new Set(keyValues.get(key) || []);
    remainingValues.delete(value);
    const isLastValueOfKey = remainingValues.size === 0;
    
    const remainingKeys = new Set(keyValues.keys());
    remainingKeys.delete(key);
    const isLastKey = remainingKeys.size === 0;
    const willBeLastCondition = isLastValueOfKey && isLastKey;
    
    // Check if any variant being deleted has non-common children
    const variantsToDelete: NexusNode[] = [];
    if (node.variants) {
      node.variants.forEach(variant => {
        if (variant.conditions && variant.conditions[key] === value) {
          variantsToDelete.push(variant);
        }
      });
    }
    
    // If this will be the last condition and we have children, convert back to regular node
    if (willBeLastCondition && node.variants && node.variants.length > 0) {
      const firstVariant = node.variants[0];
      const yText = doc.getText('nexus');
      const lines = yText.toString().split('\n');
      
      // Find all variant line indices (all variants since this is the last condition)
      const variantIndices = new Set<number>();
      node.variants.forEach(v => {
        variantIndices.add(v.lineIndex);
      });
      
      // Update the first variant to remove the condition, delete others
      const updatedLines: string[] = [];
      lines.forEach((line, index) => {
        if (index === firstVariant.lineIndex) {
          // Remove the condition from the first variant
          const match = line.match(/^(\s*)(.*)/);
          if (match) {
            const indent = match[1];
            const rest = match[2];
            
            // Extract base content (everything before first parenthesis)
            const contentMatch = rest.match(/^([^(]+)/);
            const content = contentMatch ? contentMatch[1].trim() : rest.trim();
            
            // Check if #common# tag exists
            const hasCommon = rest.includes('#common#');
            
            // Reconstruct without conditions, but keep #common# if it exists
            const commonTag = hasCommon ? ' #common#' : '';
            updatedLines.push(`${indent}${content}${commonTag}`);
          } else {
            updatedLines.push(line);
          }
        } else if (!variantIndices.has(index)) {
          updatedLines.push(line);
        }
      });
      
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedLines.join('\n'));
      });
      
      // Update local state
      const newMap = new Map(keyValues);
      const values = newMap.get(key) || [];
      newMap.set(key, values.filter(v => v !== value));
      if (newMap.get(key)?.length === 0) {
        newMap.delete(key);
      }
      setKeyValues(newMap);
      return;
    }
    
    // Check each variant for non-common children (only if not converting back to regular node)
    for (const variant of variantsToDelete) {
      const hasNonCommonChildren = (n: NexusNode): boolean => {
        if (n.children.length === 0) return false;
        // Check if any child is not common
        const hasNonCommon = n.children.some(child => !child.isCommon);
        if (hasNonCommon) return true;
        // Recursively check children
        return n.children.some(hasNonCommonChildren);
      };
      
      if (hasNonCommonChildren(variant)) {
        showToast('Cannot delete variant: it has children that are not marked as common');
        return;
      }
    }
    
    // If we get here, all variants only have common children (or no children)
    // We'll delete the variants and their common children
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const indicesToRemove = new Set<number>();
    const childrenIndicesToRemove = new Set<number>();
    
    // Collect variant line indices and their common children
    if (node.variants) {
      node.variants.forEach(variant => {
        if (variant.conditions && variant.conditions[key] === value) {
          indicesToRemove.add(variant.lineIndex);
          
          // Collect all common children indices
          const collectCommonChildren = (n: NexusNode) => {
            n.children.forEach(child => {
              if (child.isCommon) {
                childrenIndicesToRemove.add(child.lineIndex);
                collectCommonChildren(child);
              }
            });
          };
          collectCommonChildren(variant);
        }
      });
    }
    
    // Rebuild lines, excluding removed variants and their common children
    const updatedLines: string[] = [];
    lines.forEach((line, index) => {
      if (!indicesToRemove.has(index) && !childrenIndicesToRemove.has(index)) {
        updatedLines.push(line);
      }
    });
    
    if (indicesToRemove.size > 0) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedLines.join('\n'));
      });
    }
    
    // Update local state
    const newMap = new Map(keyValues);
    const values = newMap.get(key) || [];
    newMap.set(key, values.filter(v => v !== value));
    if (newMap.get(key)?.length === 0) {
      newMap.delete(key);
    }
    setKeyValues(newMap);
  };

  const updateValue = (key: string, oldValue: string, newValue: string) => {
    if (!newValue.trim() || newValue === oldValue) return;
    
    // Update existing variants in markdown: rename the value in all variants with this key
    const yText = doc.getText('nexus');
    const lines = yText.toString().split('\n');
    const updates: { index: number; text: string }[] = [];
    
    if (node.variants) {
      node.variants.forEach(variant => {
        if (variant.conditions && variant.conditions[key] === oldValue && variant.lineIndex < lines.length) {
          const newConditions = { ...variant.conditions };
          newConditions[key] = newValue.trim();
          
          const match = lines[variant.lineIndex].match(/^(\s*)(.*)/);
          if (match) {
            const indent = match[1];
            const parts = Object.entries(newConditions).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`);
            let suffix = ` (${parts.join(', ')})`;
            if (variant.isCommon) suffix += ' #common#';
            
            updates.push({
              index: variant.lineIndex,
              text: `${indent}${variant.content}${suffix}`
            });
          }
        }
      });
    }
    
    if (updates.length > 0) {
      // Update lines in place
      updateLinesInPlace(updates);
    }
    
    // Update local state
    const newMap = new Map(keyValues);
    const values = newMap.get(key) || [];
    const index = values.indexOf(oldValue);
    if (index >= 0) {
      values[index] = newValue.trim();
      newMap.set(key, values.sort());
      setKeyValues(newMap);
    }
  };

  const toggleKey = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleCommonFromPanel = () => {
    // Delegate to shared structure helper so behavior matches canvas
    structure.toggleCommonNode(node, activeVariantId);
  };

  const openDescriptionModal = (mode: DimensionDescriptionMode, dimensionKey: string) => {
    setDescriptionMode(mode);
    setDescriptionDimensionKey(dimensionKey);
    setShowDescriptionModal(true);
  };

  const closeDescriptionModal = () => {
    setShowDescriptionModal(false);
    setDescriptionMode(null);
    setDescriptionDimensionKey(null);
  };

  const serializeFlowToMarkdown = (
    nodes: FlowNode[],
    edges: Record<string, { label: string; color: string }>,
  ): string[] => {
    if (!nodes.length) return [];
    const byBranch = new Map<string, FlowNode[]>();
    nodes.forEach((n) => {
      const bid = n.branchId || 'branch-1';
      if (!byBranch.has(bid)) byBranch.set(bid, []);
      byBranch.get(bid)!.push(n);
    });
    const branchEntries = Array.from(byBranch.entries());
    const lines: string[] = [];
    branchEntries.forEach(([bid, branchNodes], idx) => {
      lines.push(`Branch ${String.fromCharCode(65 + idx)} (${bid}):`);
      branchNodes.forEach((n, stepIdx) => {
        const tag = n.type.toUpperCase();
        lines.push(`  ${stepIdx + 1}. [${tag}] ${n.label || `Step ${stepIdx + 1}`}`);
      });
      if (idx < branchEntries.length - 1) lines.push('');
    });
    lines.push('');
    lines.push('```flowjson');
    lines.push(
      JSON.stringify(
        {
          nodes,
          edges,
        },
        null,
        2,
      ),
    );
    lines.push('```');
    return lines;
  };


  const handleSaveDescription = () => {
    if (!descriptionMode || !descriptionDimensionKey) return;
    
    const yText = doc.getText('nexus');
    const current = yText.toString();

    // Load current dimension description state
    const descData = loadDimensionDescriptions(doc);
    
    // Get or assign running number
    const key = `${node.id}::${descriptionDimensionKey}::${descriptionMode}`;
    let runningNumber = dimensionDescriptionRunningNumberMapRef.current.get(key);
    
    if (!runningNumber) {
      // ⚠️ DIMENSION DESCRIPTION MATCHING: Use the modularized matcher - do not modify matching logic here
      // Try to find existing running number by matching
      const yText = doc.getText('nexus');
      const currentText = yText.toString();
      const match = matchNodeToDimensionDescription(
        node,
        descriptionDimensionKey,
        descriptionMode,
        currentText,
        descData.entries,
        nodeMap
      );
      
      if (match) {
        runningNumber = match.runningNumber;
      } else {
        // Assign new running number
        runningNumber = descData.nextRunningNumber;
        descData.nextRunningNumber = runningNumber + 1;
      }
      
      dimensionDescriptionRunningNumberMapRef.current.set(key, runningNumber);
    }
    
    // Update or create entry
    const existingIndex = descData.entries.findIndex(
      e => e.runningNumber === runningNumber
    );
    
    const entry: DimensionDescriptionEntry = {
      runningNumber,
      content: node.content,
      parentPath: [], // Will be updated below
      lineIndex: node.lineIndex,
      dimensionKey: descriptionDimensionKey,
      mode: descriptionMode,
    };
    
    // Build parent path
    const parentPath: string[] = [];
    let currentParent = nodeMap.get(node.parentId || '');
    while (currentParent) {
      parentPath.unshift(currentParent.content);
      currentParent = currentParent.parentId ? nodeMap.get(currentParent.parentId) : undefined;
    }
    entry.parentPath = parentPath;
    
    if (existingIndex >= 0) {
      descData.entries[existingIndex] = entry;
    } else {
      descData.entries.push(entry);
    }
    
    // Serialize flow/table data first
    let bodyLines: string[] = [];
    if (descriptionMode === 'flow' && flowNodes) {
      bodyLines = serializeFlowToMarkdown(flowNodes, flowEdges || {});
    } else if (descriptionMode === 'table' && tableColumns && tableRows) {
      const dimensionValues = descriptionDimensionKey
        ? keyValues.get(descriptionDimensionKey) || []
        : [];
      bodyLines = serializeTableToMarkdown(
        tableColumns,
        tableRows,
        tableMergedCells,
        dimensionValues,
      );
    }

    // Save to markdown with running number (this updates the dimension descriptions section)
    let updatedWithDesc = upsertDimensionDescription(current, {
      id: `${node.id}::${descriptionDimensionKey}`, // Keep legacy format for compatibility
      runningNumber,
      hubLabel: `${node.content} – ${descriptionDimensionKey}`,
      mode: descriptionMode,
      bodyLines,
    });

    // Now add comments to node lines in the updated text
    // This needs to happen before we save, so the comments are included
    const lines = updatedWithDesc.split('\n');
    const lineToDescriptions = new Map<number, Array<{ mode: DimensionDescriptionMode; dimensionKey: string; runningNumber: number }>>();
    descData.entries.forEach(entry => {
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
    const annotatedLines = lines.map((line, index) => {
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
    
    updatedWithDesc = annotatedLines.join('\n');
    
    // Update the metadata block in the annotated text
    const storageBlock = `\`\`\`dimension-descriptions\n${JSON.stringify(descData, null, 2)}\n\`\`\``;
    const existingMatch = updatedWithDesc.match(/```dimension-descriptions\n[\s\S]*?\n```/);
    
    if (existingMatch) {
      updatedWithDesc = updatedWithDesc.replace(/```dimension-descriptions\n[\s\S]*?\n```/, storageBlock);
    } else {
      const separatorIndex = updatedWithDesc.indexOf('\n---\n');
      if (separatorIndex !== -1) {
        updatedWithDesc = updatedWithDesc.slice(0, separatorIndex) + '\n' + storageBlock + '\n' + updatedWithDesc.slice(separatorIndex);
      } else {
        updatedWithDesc = updatedWithDesc + (updatedWithDesc.endsWith('\n') ? '' : '\n') + '\n' + storageBlock;
      }
    }

    // Save everything in one transaction
    if (updatedWithDesc !== current) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, updatedWithDesc);
      });
    }

    closeDescriptionModal();
  };

  return (
    <div className="w-80 h-full flex flex-col overflow-hidden relative mac-window">
      <div className="mac-titlebar">
        <div className="mac-title">Node Logic</div>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-4 right-4 mac-window mac-shadow-hard text-xs px-3 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}
      
      {hasDimensions && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowMatrix(true)}
            className="mac-btn w-full text-[11px] flex items-center justify-center gap-2"
          >
            <span>View condition matrix</span>
          </button>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">Content</label>
        <div className="p-2 border border-gray-200 rounded-md text-sm bg-white text-gray-500 select-none">
          {node.content}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">Icon (emoji / ascii)</label>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-md border border-gray-200 bg-white flex items-center justify-center shrink-0">
            <div className="text-xl leading-none select-none">
              {(iconInput || '').trim() ? (iconInput || '').trim() : '—'}
            </div>
          </div>
          <input
            type="text"
            value={iconInput}
            onChange={(e) => setIconInput(e.target.value)}
            onBlur={() => {
              const next = iconInput.trim();
              structure.setNodeIcon(node, next.length ? next : null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setIconInput(node.icon || '');
                e.currentTarget.blur();
              }
            }}
            placeholder="e.g. 🙂 or [*]"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
          <button
            type="button"
            onClick={() => {
              setIconInput('');
              structure.setNodeIcon(node, null);
            }}
            className="text-[11px] px-2 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
            title="Clear icon"
          >
            Clear
          </button>
        </div>
        <div className="mt-1 text-[10px] text-gray-500">
          Renders above the node label, centered, at <span className="font-medium">3×</span> the label font size.
        </div>
      </div>

      {/* Data object link for ANY node (not only expanded) */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">Linked data object</label>
        <DataObjectSearchSelect
          value={node.dataObjectId || ''}
          onChange={(nextId) => {
            structure.setNodeDataObjectId(node, nextId || null);
            // Clear attribute selections when the object changes.
            structure.setNodeDataObjectAttributeIds(node, []);
          }}
          objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
          placeholder="None"
          includeNoneOption={true}
          noneLabel="None"
        />
        {node.dataObjectId ? (
          <DataObjectAttributeMultiSelect
            objectId={node.dataObjectId}
            objects={dataObjectStore.objects}
            value={node.dataObjectAttributeIds || []}
            onChange={(next) => structure.setNodeDataObjectAttributeIds(node, next)}
            label="Linked attributes"
          />
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newDataObjectName}
            onChange={(e) => setNewDataObjectName(e.target.value)}
            placeholder="New data object name…"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => {
              const name = newDataObjectName.trim();
              if (!name) return;
              const obj = createDataObject(doc, name);
              setNewDataObjectName('');
              structure.setNodeDataObjectId(node, obj.id);
              structure.setNodeDataObjectAttributeIds(node, []);
            }}
            className="mac-btn mac-btn--primary text-[11px]"
          >
            Create
          </button>
        </div>
      </div>

      {/* Tags (hidden in markdown comments; shown only in the right panel) */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>

        {effectiveTagIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {effectiveTagIds
              .slice()
              .sort((a, b) => a.localeCompare(b))
              .map((id) => {
                const t = tagById.get(id);
                const g = t ? tagGroups.find((x) => x.id === t.groupId) : null;
                const label = t ? `${g?.name || t.groupId}/${t.name}` : id;
                return (
                  <span
                    key={id}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                      t ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                    }`}
                    title={id}
                  >
                    <span className="truncate max-w-[190px]">{label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = effectiveTagIds.filter((x) => x !== id);
                        structure.setNodeTags(node, next);
                      }}
                      className="text-gray-400 hover:text-gray-700"
                      title="Remove tag"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
          </div>
        ) : (
          <div className="text-[11px] text-gray-500">No tags</div>
        )}

        <div className="mt-2 relative">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => {
              setTagInput(e.target.value);
              setTagSuggestionIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setTagSuggestionIndex((i) => Math.min(i + 1, Math.max(filteredTagSuggestions.length - 1, 0)));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setTagSuggestionIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const pick = filteredTagSuggestions[tagSuggestionIndex];
                const toAttachId = exactMatchTagId || pick?.id || null;
                if (toAttachId) {
                  const next = Array.from(new Set([...effectiveTagIds, toAttachId]));
                  structure.setNodeTags(node, next);
                  setTagInput('');
                  return;
                }
                const created = createTag(doc, 'tg-ungrouped', tagInput);
                if (!created) return;
                const next = Array.from(new Set([...effectiveTagIds, created.id]));
                structure.setNodeTags(node, next);
                setTagInput('');
                return;
              }
              if (e.key === 'Escape') {
                setTagInput('');
              }
            }}
            placeholder="Add tag… (Enter to add / create)"
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {filteredTagSuggestions.length > 0 && tagInput.trim().length > 0 ? (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
              {filteredTagSuggestions.map((t, idx) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    const next = Array.from(new Set([...effectiveTagIds, t.id]));
                    structure.setNodeTags(node, next);
                    setTagInput('');
                  }}
                  className={`w-full text-left px-2 py-1 text-[11px] ${
                    idx === tagSuggestionIndex ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                  title={t.id}
                >
                  <span className="font-medium">{t.name}</span> <span className="text-gray-400">· {t.groupName}</span>
                </button>
              ))}
              {!exactMatchTagId && (
                <div className="px-2 py-1 text-[10px] text-gray-500 border-t border-gray-100">
                  Press Enter to create <span className="font-medium">“{tagInput.trim()}”</span> in <span className="font-medium">ungrouped</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Tag management moved to the bottom Tag View tool */}
      </div>

      {/* UI type is handled as tags (tg-uiType) via the Tags control above. */}

      {(() => {
        const runningNumber = getRunningNumber(node.id);
        if (runningNumber === undefined) return null;
        const metadata = loadExpandedNodeMetadata(doc, runningNumber);
        return (
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-700 mb-1">Linked data object (main)</label>
            <DataObjectSearchSelect
              value={metadata.dataObjectId || ''}
              onChange={(nextId) => {
                const next = nextId || undefined;
                saveExpandedNodeMetadata(doc, runningNumber, { ...metadata, dataObjectId: next, dataObjectAttributeIds: [] });
                // Keep node line comment in sync so other UIs can discover the link without needing runningNumber.
                structure.setNodeDataObjectId(node, next || null);
                structure.setNodeDataObjectAttributeIds(node, []);
              }}
              objects={dataObjectStore.objects.map((o) => ({ id: o.id, name: o.name }))}
              placeholder="None"
              includeNoneOption={true}
              noneLabel="None"
            />
            {metadata.dataObjectId ? (
              <DataObjectAttributeMultiSelect
                objectId={metadata.dataObjectId}
                objects={dataObjectStore.objects}
                value={metadata.dataObjectAttributeIds || []}
                onChange={(next) => {
                  saveExpandedNodeMetadata(doc, runningNumber, { ...metadata, dataObjectAttributeIds: next });
                  structure.setNodeDataObjectAttributeIds(node, next);
                }}
                label="Linked attributes (main)"
              />
            ) : null}

            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newDataObjectName}
                onChange={(e) => setNewDataObjectName(e.target.value)}
                placeholder="New data object name…"
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const name = newDataObjectName.trim();
                  if (!name) return;
                  const obj = createDataObject(doc, name);
                  setNewDataObjectName('');
                  saveExpandedNodeMetadata(doc, runningNumber, { ...metadata, dataObjectId: obj.id, dataObjectAttributeIds: [] });
                  structure.setNodeDataObjectId(node, obj.id);
                  structure.setNodeDataObjectAttributeIds(node, []);
                }}
                className="text-[11px] px-2 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                Create
              </button>
            </div>

            <div className="mt-1 text-[10px] text-gray-500">
              If this node is linked to data <span className="font-medium">A</span>, then inner nodes linked to <span className="font-medium">B/C…</span> can be modeled as attributes or relations of A.
            </div>
          </div>
        );
      })()}
      
      {/* Expand Toggle */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">Expand node</span>
        <button
          type="button"
          onClick={() => {
            onExpandedNodesChange(prev => {
              const next = new Set(prev);
              if (next.has(node.id)) {
                next.delete(node.id);
              } else {
                next.add(node.id);
              }
              return next;
            });
          }}
          className={`relative inline-flex h-4 w-8 items-center rounded-full border transition-colors ${
            expandedNodes.has(node.id)
              ? 'bg-blue-500 border-blue-500' 
              : 'bg-gray-200 border-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
              expandedNodes.has(node.id)
                ? 'translate-x-4' 
                : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Grid Size Control (only show when expanded) */}
      {expandedNodes.has(node.id) && (() => {
        const runningNumber = getRunningNumber(node.id);
        if (runningNumber === undefined) return null;
        
        const metadata = loadExpandedNodeMetadata(doc, runningNumber);
        return (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-2">Grid Size</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">Width:</span>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={metadata.gridWidth || metadata.gridSize || 4}
                  onChange={(e) => {
                    const newWidth = Math.max(2, Math.min(10, parseInt(e.target.value) || 4));
                    saveExpandedNodeMetadata(doc, runningNumber, { ...metadata, gridWidth: newWidth });
                  }}
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-12">Height:</span>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={metadata.gridHeight || metadata.gridSize || 4}
                  onChange={(e) => {
                    const newHeight = Math.max(2, Math.min(10, parseInt(e.target.value) || 4));
                    saveExpandedNodeMetadata(doc, runningNumber, { ...metadata, gridHeight: newHeight });
                  }}
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Process Node Toggle - Show only when it can be toggled */}
      {/* Hide if: child of process node, or has children (can't toggle ON/OFF) */}
      {!isChildOfProcessNode && node.children.length === 0 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Process node</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              
              structure.toggleFlowNode(node);
              
              // Rule 2: First time toggle ON, also toggle process flow mode ON
              if (!node.isFlowNode && onProcessFlowModeNodesChange) {
                onProcessFlowModeNodesChange(prev => {
                  const next = new Set(prev || []);
                  next.add(node.id);
                  return next;
                });
              }
            }}
            className={`relative inline-flex h-4 w-8 items-center rounded-full border transition-colors ${
              node.isFlowNode
                ? 'bg-blue-500 border-blue-500' 
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                node.isFlowNode
                  ? 'translate-x-4' 
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Show Flow Toggle - Only show for root process nodes */}
      {/* This enables/disables flow features (type switcher, connector labels) - separate from regular expand mode */}
      {isRootProcessNode && node.isFlowNode && onProcessFlowModeNodesChange && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Show flow</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onProcessFlowModeNodesChange(prev => {
                const next = new Set(prev || []);
                if (next.has(node.id)) {
                  next.delete(node.id);
                } else {
                  next.add(node.id);
                }
                return next;
              });
            }}
            className={`relative inline-flex h-4 w-8 items-center rounded-full border transition-colors ${
              processFlowModeNodes?.has(node.id)
                ? 'bg-blue-500 border-blue-500' 
                : 'bg-gray-200 border-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                processFlowModeNodes?.has(node.id)
                  ? 'translate-x-4' 
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}
      
      {/* Info message for child process nodes */}
      {node.isFlowNode && !isRootProcessNode && (
        <div className="mb-4 text-xs text-gray-500 italic">
          Part of process flow (type can be changed when parent is expanded)
        </div>
      )}

      {/* Common Toggle - Only show when node is inside a variant */}
      {isInsideVariant && (
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">Common across variants</span>
        <button
          type="button"
          onClick={toggleCommonFromPanel}
          className={`relative inline-flex h-4 w-8 items-center rounded-full border transition-colors ${
            (node.isHub && activeVariantId 
              ? node.variants?.find(v => v.id === activeVariantId)?.isCommon 
              : node.isCommon) 
              ? 'bg-blue-500 border-blue-500' 
              : 'bg-gray-200 border-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
              (node.isHub && activeVariantId 
                ? node.variants?.find(v => v.id === activeVariantId)?.isCommon 
                : node.isCommon)
                ? 'translate-x-4' 
                : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      )}
      
      {/* Collapsible Key-Value Management */}
      <div className="mb-6 border-b pb-6">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between text-xs font-bold text-gray-800 mb-2"
        >
          <span>Condition Dimensions</span>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        
        {!isCollapsed && (
          <div className="space-y-2">
            {Array.from(keyValues.entries()).map(([key, values]) => (
              <div key={key} className="bg-white border rounded-md p-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleKey(key)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {expandedKeys.has(key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
             <input
                type="text"
                    value={editingKey === key ? editingKeyValue : key}
                    onChange={(e) => {
                      // Mark as editing to prevent auto-generation
                      if (editingKey !== key) {
                        setEditingKey(key);
                        setEditingKeyValue(key);
                      }
                      setEditingKeyValue(e.target.value);
                    }}
                    onFocus={(e) => {
                      setEditingKey(key);
                      setEditingKeyValue(key);
                    }}
                    onBlur={(e) => {
                      const newKey = e.target.value.trim();
                      if (newKey && newKey !== key) {
                        updateKeyName(key, newKey);
                      }
                      setEditingKey(null);
                      setEditingKeyValue('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setEditingKey(null);
                        setEditingKeyValue('');
                        e.currentTarget.blur();
                      }
                    }}
                    className="flex-1 text-xs font-medium border-b border-black outline-none pb-0.5"
                    placeholder="Key name"
                  />
        <button 
                    onClick={() => removeKey(key)}
                    className="opacity-60 hover:opacity-100"
        >
                    <X size={12} />
        </button>
      </div>

                {expandedKeys.has(key) && (
                  <div className="ml-4 space-y-1">
                    {values.map((value, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                    type="text"
                          value={editingValue?.key === key && editingValue?.oldValue === value 
                            ? editingValue.currentValue 
                            : value}
                          onChange={(e) => {
                            // Update local state for immediate feedback, but mark as editing to prevent auto-generation
                            if (!editingValue || editingValue.key !== key || editingValue.oldValue !== value) {
                              setEditingValue({ key, oldValue: value, currentValue: value });
                            }
                            setEditingValue(prev => prev ? { ...prev, currentValue: e.target.value } : null);
                          }}
                          onFocus={(e) => {
                            setEditingValue({ key, oldValue: value, currentValue: value });
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value.trim();
                            if (newValue && newValue !== value) {
                              updateValue(key, value, newValue);
                            }
                            setEditingValue(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setEditingValue(null);
                              e.currentTarget.blur();
                            }
                          }}
                          className="flex-1 text-xs border px-1.5 py-0.5 outline-none"
                          placeholder="Value"
                        />
                        <button
                          onClick={() => removeValue(key, value)}
                          className="opacity-60 hover:opacity-100"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {addingValueFor === key ? (
                      <div className="flex items-center gap-1 mt-1">
                 <input
                    type="text"
                          value={newValueInput}
                          onChange={(e) => setNewValueInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newValueInput.trim()) {
                              addValue(key, newValueInput);
                              setNewValueInput('');
                              setAddingValueFor(null);
                            } else if (e.key === 'Escape') {
                              setNewValueInput('');
                              setAddingValueFor(null);
                            }
                          }}
                          autoFocus
                          className="flex-1 text-xs border px-1.5 py-0.5 outline-none"
                          placeholder="Enter value..."
                        />
                        <button
                          onClick={() => {
                            if (newValueInput.trim()) {
                              addValue(key, newValueInput);
                              setNewValueInput('');
                            }
                            setAddingValueFor(null);
                          }}
                          className="opacity-80 hover:opacity-100"
                        >
                          <Plus size={10} />
                        </button>
                        <button
                          onClick={() => {
                            setNewValueInput('');
                            setAddingValueFor(null);
                          }}
                          className="opacity-60 hover:opacity-100"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingValueFor(key);
                          setNewValueInput('');
                        }}
                        className="text-[10px] opacity-80 hover:opacity-100 flex items-center gap-1 mt-1"
                      >
                        <Plus size={10} /> Add Value
                      </button>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-gray-500">
                        Describe this dimension:
                      </span>
                      <button
                        type="button"
                        onClick={() => openDescriptionModal('flow', key)}
                        className="mac-btn px-2 py-1 text-[10px]"
                      >
                        Flow
                      </button>
                      <button
                        type="button"
                        onClick={() => openDescriptionModal('table', key)}
                        className="mac-btn px-2 py-1 text-[10px]"
                      >
                        Table
                      </button>
                    </div>
                  </div>
                )}
            </div>
            ))}
            
             <button
              onClick={addKey}
              className="w-full text-[10px] flex items-center justify-center gap-1 border border-dashed py-1.5 mac-fill--dots-1"
            >
              <Plus size={10} /> Add Key
            </button>
        </div>
        )}
      </div>

      {/* Read-only Condition Matrix Overlay (shared component) */}
      <ConditionMatrixOverlay
        open={showMatrix}
        hubLabel={node.content}
        scenarios={scenarios}
        onClose={() => setShowMatrix(false)}
        onSelectScenario={(scenario) => {
          onSelectConditions?.(scenario.conditions);
          setShowMatrix(false);
        }}
      />
      
      {/* Dimension Description Modal */}
      {showDescriptionModal && descriptionMode && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
          <div className="mac-window max-w-4xl w-[92vw] max-h-[90vh] flex flex-col">
            <div className="mac-titlebar">
              <div className="mac-title">
                {descriptionMode === 'flow' ? 'Flow Description' : 'Table Description'}
              </div>
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                <button type="button" onClick={closeDescriptionModal} className="mac-btn" title="Close">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="px-4 py-2 border-b">
              <div className="text-[12px] font-bold truncate">
                {node.content}
                {descriptionDimensionKey ? ` – ${descriptionDimensionKey}` : ''}
              </div>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {descriptionMode === 'flow' ? (
                <DimensionFlowEditor
                  initialNodes={flowNodes || undefined}
                  initialEdges={flowEdges || undefined}
                  onChange={({ nodes, edges }) => {
                    setFlowNodes(nodes);
                    setFlowEdges(edges);
                  }}
                  dimensionKey={descriptionDimensionKey || undefined}
                  dimensionValues={
                    descriptionDimensionKey
                      ? keyValues.get(descriptionDimensionKey) || []
                      : []
                  }
                />
              ) : (
                <DimensionTableEditor
                  initialColumns={tableColumns || undefined}
                  initialRows={tableRows || undefined}
                  dimensionValues={
                    descriptionDimensionKey
                      ? keyValues.get(descriptionDimensionKey) || []
                      : []
                  }
                  onChange={(cols, rows, mergedCells) => {
                    setTableColumns(cols);
                    setTableRows(rows);
                    setTableMergedCells(mergedCells || null);
                  }}
                />
              )}
            </div>
            <div className="border-t px-4 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDescriptionModal}
                className="mac-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDescription}
                className="mac-btn mac-btn--primary"
              >
                Save to Markdown
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
