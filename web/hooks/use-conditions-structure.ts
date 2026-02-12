import * as Y from 'yjs';
import { NexusNode } from '@/types/nexus';
import { toggleCommonNodeImpl as toggleCommonNodeLogic } from '@/lib/common-node-logic';

/**
 * Condition / common-variant structural helpers.
 * Centralised here so future feature work does not require touching
 * the core canvas or logic panel implementations.
 */

export const addHubVariantsImpl = (
  doc: Y.Doc,
  node: NexusNode,
  activeVariantId: string | null,
  variantsToAdd: Record<string, string>[],
) => {
  const yText = doc.getText('nexus');
  const lines = yText.toString().split('\n');

  const isFirstCondition = !node.variants || node.variants.length === 0;
  const hasExistingChildren = node.children && node.children.length > 0;

  // Determine insertion target (after the very last variant block)
  let targetLineIndex = node.lineIndex;
  let referenceVariant: NexusNode = node;

  if (node.variants && node.variants.length > 0) {
    referenceVariant = node.variants[node.variants.length - 1];
  }

  // Find end of reference variant block
  let i = referenceVariant.lineIndex + 1;
  const refMatch = lines[referenceVariant.lineIndex].match(/^(\s*)(.*)/);
  const refIndent = refMatch ? refMatch[1] : '';

  while (i < lines.length) {
    const nextLine = lines[i];
    const nextMatch = nextLine.match(/^(\s*)/);
    const nextIndent = nextMatch ? nextMatch[1].length : 0;
    if (nextIndent <= refIndent.length && nextLine.trim().length > 0) break;
    i++;
  }
  targetLineIndex = i;

  // If this is the first condition and node has existing children, collect all children lines.
  // IMPORTANT: on first conversion we must preserve the subtree exactly (including #flow# nodes),
  // otherwise converting a node inside a process-flow will "drop" flow children and appear to collapse/lose them.
  const existingChildrenLines: string[] = [];
  if (isFirstCondition && hasExistingChildren) {
    const collectAllChildren = (n: NexusNode): string[] => {
      if (lines[n.lineIndex]) {
        const result = [lines[n.lineIndex]];
        n.children.forEach(child => {
          result.push(...collectAllChildren(child));
        });
        return result;
      }
      return [];
    };

    node.children.forEach(child => {
      existingChildrenLines.push(...collectAllChildren(child));
    });
  }

  // Helper: collect full children subtree (all descendants) for a given variant
  // Excludes flow nodes unless they're marked as common (flow nodes should only exist in one variant)
  const collectVariantChildrenLines = (variant: NexusNode): string[] => {
    const result: string[] = [];
    const walk = (n: NexusNode) => {
      if (lines[n.lineIndex]) {
        // Only include flow nodes if they're marked as common
        // Non-common flow nodes should only exist in their original variant
        if (n.isFlowNode && !n.isCommon) {
          return; // Skip non-common flow nodes
        }
        result.push(lines[n.lineIndex]);
        n.children.forEach(walk);
      }
    };
    variant.children.forEach(walk);
    return result;
  };

  // Helper: for a new conditions combo, find the best existing variant to clone from.
  // We look for a variant whose conditions are a subset of the new conditions, and
  // choose the one with the highest number of matching keys.
  const findBestSourceVariant = (conditions: Record<string, string>): NexusNode | null => {
    if (!node.variants || node.variants.length === 0) return null;

    let best: { variant: NexusNode; score: number } | null = null;

    for (const v of node.variants) {
      if (!v.conditions) continue;

      let score = 0;
      let compatible = true;

      for (const [key, value] of Object.entries(v.conditions)) {
        if (conditions[key] !== value) {
          compatible = false;
          break;
        }
        score++;
      }

      if (!compatible || score === 0) continue;

      if (!best || score > best.score) {
        best = { variant: v, score };
      }
    }

    // Fallback: if nothing matched as a subset, just use the first existing variant
    return best ? best.variant : node.variants[0];
  };

  const content = node.content;
  const allNewLines: string[] = [];

  variantsToAdd.forEach((conditions, index) => {
    const parts = Object.entries(conditions).map(([k, v]) => `${k}=${v}`);
    const header = `${refIndent}${content} (${parts.join(', ')})`;
    allNewLines.push(header);

    // Decide which children subtree to clone into this new variant
    if (isFirstCondition && hasExistingChildren && index === 0) {
      // First time we introduce conditions: clone the original hub children into the first variant
      // This preserves existing content when first converting a regular node to a conditional node
      allNewLines.push(...existingChildrenLines);
    } else if (!isFirstCondition && node.variants && node.variants.length > 0) {
      // For new variants: only copy COMMON nodes (nodes marked with #common#)
      // Common nodes must exist in all variants, so they need to be copied
      // Non-common nodes should start empty in new variants
      const sourceVariantForCombo =
        findBestSourceVariant(conditions) ?? node.variants[0];

      // Only collect common nodes from the source variant
      const commonNodesLines: string[] = [];
      const collectCommonNodes = (n: NexusNode) => {
        if (lines[n.lineIndex]) {
          // Only include nodes that are marked as common
          // This includes: nodes with #common# tag, and their children (if they're also common)
          const line = lines[n.lineIndex];
          if (line.includes('#common#')) {
            commonNodesLines.push(line);
            // Recursively collect children (they may also be common)
            n.children.forEach(collectCommonNodes);
          }
        }
      };
      sourceVariantForCombo.children.forEach(collectCommonNodes);
      
      allNewLines.push(...commonNodesLines);
    }
    // If no existing variants, new variant starts completely empty
  });

  if (allNewLines.length === 0) return;

  doc.transact(() => {
    if (isFirstCondition && hasExistingChildren) {
      // Replace original node + children block with first variant + children
      let maxLineIndex = node.lineIndex;
      const findMaxLine = (n: NexusNode) => {
        maxLineIndex = Math.max(maxLineIndex, n.lineIndex);
        n.children.forEach(findMaxLine);
      };
      findMaxLine(node);

      let startCharIndex = 0;
      for (let k = 0; k < node.lineIndex; k++) {
        startCharIndex += lines[k].length + 1;
      }

      let endCharIndex = startCharIndex;
      for (let k = node.lineIndex; k <= maxLineIndex; k++) {
        endCharIndex += lines[k].length;
        if (k < maxLineIndex || (k === maxLineIndex && maxLineIndex + 1 < lines.length)) {
          endCharIndex += 1;
        }
      }

      const firstVariantHeader = allNewLines[0];
      const firstVariantChildren = allNewLines.slice(1, 1 + existingChildrenLines.length);
      const replacementLines = [firstVariantHeader, ...firstVariantChildren];
      const replacementText = replacementLines.join('\n');

      const hasNextSibling = maxLineIndex + 1 < lines.length;
      const finalReplacementText = hasNextSibling ? replacementText + '\n' : replacementText;

      const deleteLength = endCharIndex - startCharIndex;
      yText.delete(startCharIndex, deleteLength);
      yText.insert(startCharIndex, finalReplacementText);

      if (variantsToAdd.length > 1) {
        const remainingStartIndex = 1 + existingChildrenLines.length;
        const remainingVariants = allNewLines.slice(remainingStartIndex);
        if (remainingVariants.length > 0) {
          let insertCharIndex = startCharIndex + finalReplacementText.length;
          yText.insert(insertCharIndex, remainingVariants.join('\n') + '\n');
        }
      }
    } else {
      // Normal case: line-based splice
      const newLines = [...lines];
      newLines.splice(targetLineIndex, 0, ...allNewLines);
      const newText = newLines.join('\n');
      if (yText.toString() !== newText) {
        yText.delete(0, yText.length);
        yText.insert(0, newText);
      }
    }
  });
};

export const toggleCommonNodeImpl = (
  doc: Y.Doc,
  roots: NexusNode[],
  node: NexusNode,
  activeVariantId: string | null,
) => {
  // Build raw node map including variants (ONLY within hub variants, not roots)
  const rawNodeMap = new Map<string, NexusNode>();
  const buildMap = (nodes: NexusNode[]) => {
    nodes.forEach(n => {
      rawNodeMap.set(n.id, n);
      if (n.isHub && n.variants) {
        n.variants.forEach(v => {
          rawNodeMap.set(v.id, v);
          buildMap(v.children); // Only build map for variant children
        });
      } else {
        buildMap(n.children);
      }
    });
  };
  buildMap(roots);

  // If node is a hub, use the active variant instead
  const targetNode = node.isHub && activeVariantId
    ? node.variants?.find(v => v.id === activeVariantId) || node
    : node;

  // Delegate to the modularized common node logic
  toggleCommonNodeLogic(doc, targetNode, rawNodeMap, roots);
};

