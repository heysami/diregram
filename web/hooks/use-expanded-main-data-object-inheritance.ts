'use client';

import { useEffect } from 'react';
import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';
import { extractExpandedIdsFromMarkdown } from '@/lib/expanded-state-storage';
import { loadExpandedNodeMetadata, saveExpandedNodeMetadataToMarkdown } from '@/lib/expanded-node-metadata';

/**
 * Auto-inherit expanded "main" linked data object from the node line's own <!-- do:... --> link.
 *
 * When a node has an `<!-- expid:N -->` marker (expanded running number) and that line has
 * a linked data object (`node.dataObjectId`), ensure `expanded-metadata-N.dataObjectId` is
 * populated (only if missing).
 *
 * This keeps expanded UIs and derived views consistent without requiring manual metadata edits.
 */
export function useExpandedMainDataObjectInheritance(doc: Y.Doc | null, roots: NexusNode[]) {
  useEffect(() => {
    if (!doc || roots.length === 0) return;
    const yText = doc.getText('nexus');

    const buildNodeByLineIndex = (): Map<number, NexusNode> => {
      const map = new Map<number, NexusNode>();
      const visit = (nodes: NexusNode[]) => {
        nodes.forEach((n) => {
          map.set(n.lineIndex, n);
          if (n.isHub && n.variants) {
            n.variants.forEach((v) => {
              map.set(v.lineIndex, v);
              visit(v.children);
            });
          } else {
            visit(n.children);
          }
        });
      };
      visit(roots);
      return map;
    };

    const markdown = yText.toString();
    const lineToExpId = extractExpandedIdsFromMarkdown(markdown); // Map<lineIndex, runningNumber>
    const nodeByLineIndex = buildNodeByLineIndex();

    // Batch all inheritance updates into ONE markdown rewrite to avoid thrashing
    // (many expid nodes can otherwise cause N full-doc rewrites back-to-back).
    let next = markdown;
    let changed = false;

    lineToExpId.forEach((rn, lineIndex) => {
      const node = nodeByLineIndex.get(lineIndex);
      const doid = (node?.dataObjectId || '').trim();
      if (!doid) return;

      const meta = loadExpandedNodeMetadata(doc, rn);
      if (meta.dataObjectId && meta.dataObjectId.trim().length) return;
      next = saveExpandedNodeMetadataToMarkdown(next, rn, { ...meta, dataObjectId: doid });
      changed = true;
    });

    if (changed && next !== markdown) {
      doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, next);
      });
    }
  }, [doc, roots]);
}

