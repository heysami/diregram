import * as Y from 'yjs';
import type { NexusNode } from '@/types/nexus';

export type BulkDeleteResult = {
  deletedCount: number;
  blocked: Array<{ id: string; reason: string }>;
};

export function bulkDeleteNodes(doc: Y.Doc, nodes: NexusNode[]): BulkDeleteResult {
  const blocked = nodes
    .filter((n) => n.children.length > 0)
    .map((n) => ({ id: n.id, reason: 'Has children' }));

  const deletable = nodes.filter((n) => n.children.length === 0);
  if (deletable.length === 0) return { deletedCount: 0, blocked };

  const yText = doc.getText('nexus');
  const current = yText.toString();
  const lines = current.split('\n');

  // Collect all line indices to delete. For hubs, delete all variant lines (only safe if leaf in visual tree).
  const indices = new Set<number>();
  deletable.forEach((n) => {
    if (n.isHub && n.variants && n.variants.length > 0) {
      n.variants.forEach((v) => indices.add(v.lineIndex));
    } else {
      indices.add(n.lineIndex);
    }
  });

  const sorted = Array.from(indices)
    .filter((i) => i >= 0 && i < lines.length)
    .sort((a, b) => b - a);

  if (sorted.length === 0) return { deletedCount: 0, blocked };

  doc.transact(() => {
    sorted.forEach((i) => {
      lines.splice(i, 1);
    });
    yText.delete(0, yText.length);
    yText.insert(0, lines.join('\n'));
  });

  return { deletedCount: sorted.length, blocked };
}

