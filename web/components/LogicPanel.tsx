import { useState, useEffect, useMemo, useRef } from 'react';
import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';
import { X, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useNexusStructure } from '@/hooks/use-nexus-structure';
import { buildConditionMatrixScenarios } from '@/lib/condition-matrix';
import { ConditionMatrixOverlay } from '@/components/ConditionMatrixOverlay';
import { useConditionDimensionDescriptionModals } from '@/hooks/use-condition-dimension-description-modals';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadata } from '@/lib/expanded-node-metadata';
import { isNodeInsideVariant } from '@/lib/variant-detection';
import { createDataObject, loadDataObjects, NexusDataObjectStore } from '@/lib/data-object-storage';
import { DataObjectSearchSelect } from '@/components/DataObjectSearchSelect';
import { DataObjectAttributeMultiSelect } from '@/components/DataObjectAttributeMultiSelect';
import { useDataObjectAttributeDescriptionModals } from '@/hooks/use-data-object-attribute-description-modals';
import { useLinkedDataObjectStatusDimensions } from '@/hooks/use-linked-data-object-status-dimensions';
import {
  createTag,
  loadTagStore,
  type NexusTag,
  type NexusTagGroup,
  type NexusTagStore,
} from '@/lib/tag-store';
import { upsertTemplateHeader, type NexusTemplateHeader } from '@/lib/nexus-template';
import { InsertFromTemplateModal, type WorkspaceFileLite as TemplateWorkspaceFileLite } from '@/components/templates/InsertFromTemplateModal';
import { SaveTemplateModal } from '@/components/templates/SaveTemplateModal';
import { buildTemplateFlowMetaForSubtree } from '@/lib/template-flow-meta';

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
  getProcessRunningNumber?: (nodeId: string) => number | undefined;
  templateScope?: 'project' | 'account' | 'global';
  onTemplateScopeChange?: (next: 'project' | 'account' | 'global') => void;
  templateFiles?: TemplateWorkspaceFileLite[];
  loadTemplateMarkdown?: (fileId: string) => Promise<string>;
  onSaveTemplateFile?: (res: { name: string; content: string; scope?: 'project' | 'account' }) => Promise<void> | void;
  templateSourceLabel?: string;
  globalTemplatesEnabled?: boolean;
}

export function LogicPanel({
  node,
  doc,
  activeVariantId,
  roots,
  expandedNodes,
  onExpandedNodesChange,
  processFlowModeNodes,
  onProcessFlowModeNodesChange,
  onSelectConditions,
  getRunningNumber,
  getProcessRunningNumber,
  templateScope,
  onTemplateScopeChange,
  templateFiles,
  loadTemplateMarkdown,
  onSaveTemplateFile,
  templateSourceLabel,
  globalTemplatesEnabled,
}: Props) {
  const structure = useNexusStructure(doc, roots);
  const toastMessage = useToast();
  const [insertFromTemplateOpen, setInsertFromTemplateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [pendingTemplatePayload, setPendingTemplatePayload] = useState<string | null>(null);
  const [pendingTemplateHeaderBase, setPendingTemplateHeaderBase] = useState<Omit<NexusTemplateHeader, 'name'> | null>(null);
  const [pendingTemplateDefaultName, setPendingTemplateDefaultName] = useState<string>('Template');
  
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

  const buildFlowMetaForSubtree = useMemo(() => {
    const getter = getProcessRunningNumber;
    if (!getter) return null;
    return (root: NexusNode | null): NexusTemplateHeader['flowMeta'] | undefined =>
      buildTemplateFlowMetaForSubtree({ doc, root, getProcessRunningNumber: getter });
  }, [doc, getProcessRunningNumber]);

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
  // (Dimension Table/Flow description modals are managed by a dedicated hook below.)

  const doAttrDesc = useDataObjectAttributeDescriptionModals({ doc });
  const linkedStatus = useLinkedDataObjectStatusDimensions({
    doc,
    hubNode,
    dataObjects: dataObjectStore.objects,
    baseKeyValues: keyValues,
  });

  const {
    linkedDo,
    statusAttrs: linkedDoStatusAttrs,
    lockedByKey: lockedStatusDimsByKey,
    lockedKeys,
    effectiveKeyValues,
    addLockedStatusDimension,
    removeLockedStatusDimension,
  } = linkedStatus;
  const dimensionDesc = useConditionDimensionDescriptionModals({ doc, node, nodeMap, effectiveKeyValues });

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
    
    if (effectiveKeyValues.size === 0) return;
    
    // Generate Cartesian Product
    const keys = Array.from(effectiveKeyValues.keys());
    const valuesArrays = keys.map(k => effectiveKeyValues.get(k) || []);
    
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
  }, [effectiveKeyValues, hubNode, activeVariantId, structure]);
  
  // Sync refs with state
  useEffect(() => {
    editingValueRef.current = editingValue ? { key: editingValue.key, oldValue: editingValue.oldValue } : null;
  }, [editingValue]);

  useEffect(() => {
    editingKeyRef.current = editingKey;
  }, [editingKey]);

  const hasDimensions = effectiveKeyValues.size > 0;

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
    // Avoid colliding with locked keys (from linked Data Object status) or existing keys.
    let n = effectiveKeyValues.size + 1;
    let newKey = `key${n}`;
    while (effectiveKeyValues.has(newKey) || lockedKeys.has(newKey)) {
      n += 1;
      newKey = `key${n}`;
    }
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
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="text-[11px] font-semibold text-gray-700 mb-2">Templates</div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="mac-btn h-8 text-[11px]"
              disabled={!onSaveTemplateFile}
              title={!onSaveTemplateFile ? 'Template actions are not available in this context.' : 'Save this node (and its subtree) as a reusable template.'}
              onClick={async () => {
                if (!onSaveTemplateFile) return;
                const rawName = String(node.content || '').trim();
                const baseName = (rawName.match(/^([^#]+)/)?.[1] || rawName || 'Template').trim();
                const payload = structure.extractSubtreeMarkdown(node, nodeMap, activeVariantId);
                const headerBase: Omit<NexusTemplateHeader, 'name'> = {
                  version: 1,
                  ...(templateSourceLabel ? { description: `Saved from ${templateSourceLabel}` } : {}),
                  targetKind: 'diagram',
                  mode: 'appendFragment',
                  fragmentKind: 'diagramSubtree',
                  ...(node.isFlowNode ? { tags: ['flow'] } : {}),
                  ...(buildFlowMetaForSubtree ? (buildFlowMetaForSubtree(node) ? { flowMeta: buildFlowMetaForSubtree(node) } : {}) : {}),
                };
                setPendingTemplatePayload(payload);
                setPendingTemplateHeaderBase(headerBase);
                setPendingTemplateDefaultName(baseName);
                setSaveTemplateOpen(true);
              }}
            >
              Save node subtree as template
            </button>
            <button
              type="button"
              className="mac-btn h-8 text-[11px]"
              disabled={!templateFiles || !loadTemplateMarkdown || (templateFiles || []).length === 0}
              title={!templateFiles || (templateFiles || []).length === 0 ? 'No templates found for this project yet.' : 'Insert a saved template as a child of this node.'}
              onClick={() => setInsertFromTemplateOpen(true)}
            >
              Insert from template…
            </button>
          </div>
          <div className="mt-2 text-[10px] text-gray-500">
            Templates are created from your existing content (no manual markdown).
          </div>
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
            {linkedDo && linkedDoStatusAttrs.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[11px] font-semibold text-slate-700">From linked Data Object status</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Add a status attribute as a locked dimension (values come from the object).
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {linkedDoStatusAttrs
                    .filter((a) => !linkedStatus.linkedAttrIds.includes(a.id))
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="mac-btn px-2 py-1 text-[10px]"
                        onClick={() => addLockedStatusDimension(a.id)}
                      >
                        + {a.name || a.id}
                      </button>
                    ))}
                  {linkedDoStatusAttrs.filter((a) => !linkedStatus.linkedAttrIds.includes(a.id)).length === 0 ? (
                    <div className="text-[10px] text-slate-500">All status attributes are already added.</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {Array.from(effectiveKeyValues.entries()).map(([key, values]) => {
              const locked = lockedStatusDimsByKey.get(key) || null;
              const isLocked = !!locked;
              return (
              <div key={key} className="bg-white border rounded-md p-2">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleKey(key)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {expandedKeys.has(key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {isLocked ? (
                    <div className="flex-1">
                      <div className="text-xs font-medium text-slate-900 border-b border-black/30 pb-0.5">
                        {key}{' '}
                        <span className="ml-1 text-[10px] font-normal text-slate-500">
                          (from {locked?.objectName})
                        </span>
                      </div>
                    </div>
                  ) : (
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
                      onFocus={() => {
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
                  )}

                  {isLocked ? (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
                      title="Unlink locked dimension"
                      onClick={() => locked && removeLockedStatusDimension(locked.attrId)}
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      onClick={() => removeKey(key)}
                      className="opacity-60 hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
      </div>

                {expandedKeys.has(key) && (
                  <div className="ml-4 space-y-1">
                    {isLocked ? (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {values.map((value) => (
                            <span
                              key={value}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-gray-500">Describe this dimension:</span>
                          <button
                            type="button"
                            onClick={() =>
                              locked &&
                              doAttrDesc.openTable({
                                doId: locked.objectId,
                                doName: locked.objectName,
                                attrId: locked.attrId,
                                attrName: locked.attrName,
                                values: locked.values || [],
                              })
                            }
                            className="mac-btn px-2 py-1 text-[10px]"
                          >
                            Table
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              locked &&
                              doAttrDesc.openFlow({
                                doId: locked.objectId,
                                doName: locked.objectName,
                                attrId: locked.attrId,
                                attrName: locked.attrName,
                                values: locked.values || [],
                              })
                            }
                            className="mac-btn px-2 py-1 text-[10px]"
                          >
                            Flow
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
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
                              onFocus={() => {
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
                          <span className="text-[10px] text-gray-500">Describe this dimension:</span>
                          <button
                            type="button"
                            onClick={() => dimensionDesc.openTable(key)}
                            className="mac-btn px-2 py-1 text-[10px]"
                          >
                            Table
                          </button>
                          <button
                            type="button"
                            onClick={() => dimensionDesc.openFlow(key)}
                            className="mac-btn px-2 py-1 text-[10px]"
                          >
                            Flow
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
            </div>
            );
            })}
            
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

      <InsertFromTemplateModal
        open={insertFromTemplateOpen}
        title="Insert flow template"
        files={templateFiles || []}
        loadMarkdown={loadTemplateMarkdown || (async () => '')}
        accept={{ targetKind: 'diagram', mode: 'appendFragment', fragmentKind: 'diagramSubtree' }}
        scope={
          templateScope && onTemplateScopeChange
            ? {
                value: templateScope,
                options: [
                  { id: 'project', label: 'This project' },
                  { id: 'account', label: 'Account' },
                  ...(globalTemplatesEnabled ? [{ id: 'global', label: 'Global' }] : []),
                ],
                onChange: (next) => onTemplateScopeChange(next as any),
              }
            : undefined
        }
        onClose={() => setInsertFromTemplateOpen(false)}
        onInsert={async ({ content }) => {
          const res = structure.insertSubtreeMarkdownAsChild(node, nodeMap, content, activeVariantId);
          if (!res) throw new Error('Nothing to insert.');
          showToast('Inserted');
        }}
      />

      <SaveTemplateModal
        open={saveTemplateOpen}
        title="Save template"
        defaultName={pendingTemplateDefaultName}
        defaultScope="project"
        onClose={() => setSaveTemplateOpen(false)}
        onSave={async ({ name, scope }) => {
          if (!onSaveTemplateFile) throw new Error('Template saving unavailable.');
          if (!pendingTemplatePayload || !pendingTemplateHeaderBase) throw new Error('No template content to save.');
          const header: NexusTemplateHeader = { ...pendingTemplateHeaderBase, name };
          const content = upsertTemplateHeader(pendingTemplatePayload, header);
          await onSaveTemplateFile({ name, content, scope });
          setPendingTemplatePayload(null);
          setPendingTemplateHeaderBase(null);
          showToast('Template saved');
        }}
      />

      {dimensionDesc.modals}
      {doAttrDesc.modals}
      </div>
    </div>
  );
}
