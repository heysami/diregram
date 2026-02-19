import { parseNexusMarkdown } from '@/lib/nexus-parser';
import type { NexusNode } from '@/types/nexus';

function walkUniqueNodes(parsed: NexusNode[], visit: (n: NexusNode) => void) {
  const visited = new Set<string>();
  const walk = (n: NexusNode) => {
    if (!n || !n.id) return;
    if (visited.has(n.id)) return;
    visited.add(n.id);
    visit(n);
    n.children?.forEach?.(walk);
    if (n.isHub && n.variants) {
      n.variants.forEach((v) => {
        walk(v);
        v.children?.forEach?.(walk);
      });
    }
  };
  parsed.forEach(walk);
}

export function collectRootsFromMarkdown(markdown: string, predicate: (n: NexusNode) => boolean) {
  const parsed = parseNexusMarkdown(markdown);
  const roots: NexusNode[] = [];
  walkUniqueNodes(parsed, (n) => {
    if (predicate(n)) roots.push(n);
  });
  return roots;
}

