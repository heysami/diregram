import { NexusNode } from '@/types/nexus';
import { calculateTreeLayout, NodeLayout } from '@/lib/layout-engine';

export interface ConditionMatrixScenario {
  id: string;
  conditions: Record<string, string>;
  label: string;
  layout: Record<string, NodeLayout>;
  nodes: NexusNode[];
  hasChildren: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Build read-only condition matrix scenarios for a given hub.
 * Centralised here so both LogicPanel and NexusCanvas share identical logic
 * and visual behaviour, and future feature work won't accidentally diverge them.
 */
export function buildConditionMatrixScenarios(hub: NexusNode): ConditionMatrixScenario[] {
  if (!hub.isHub || !hub.variants) return [];

  // Derive dimension keys from existing variants
  const dimensionMap = new Map<string, Set<string>>();
  hub.variants.forEach(v => {
    if (v.conditions) {
      Object.entries(v.conditions).forEach(([key, value]) => {
        if (!dimensionMap.has(key)) {
          dimensionMap.set(key, new Set());
        }
        dimensionMap.get(key)!.add(value);
      });
    }
  });

  if (dimensionMap.size === 0) return [];

  const keys = Array.from(dimensionMap.keys()).sort();
  const TARGET_WIDTH = 260;
  const TARGET_HEIGHT = 160;

  return hub.variants
    .filter(variant => {
      const conditions = variant.conditions || {};
      // Exclude variants where any dimension key is missing / null / empty
      return keys.every(k => {
        const v = conditions[k];
        return v !== undefined && v !== null && v !== '';
      });
    })
    .map(variant => {
      const conditions = variant.conditions || {};
      const labelParts = keys.map(k => `${k}=${conditions[k]}`);

      // Build mini tree for this variant
      const flattened: NexusNode[] = [];
      const traverseMini = (n: NexusNode) => {
        flattened.push(n);
        n.children.forEach(traverseMini);
      };
      traverseMini(variant);

      const miniLayout = calculateTreeLayout([variant]);

      // Compute bounds
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      flattened.forEach(n => {
        const l: NodeLayout | undefined = miniLayout[n.id];
        if (!l) return;
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + l.width);
        maxY = Math.max(maxY, l.y + l.height);
      });

      const hasChildren = flattened.some(n => n.children.length > 0);

      if (minX === Infinity || minY === Infinity) {
        return {
          id: variant.id,
          conditions,
          label: labelParts.join(' · '),
          layout: miniLayout,
          nodes: flattened,
          hasChildren,
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        };
      }

      const contentWidth = Math.max(1, maxX - minX);
      const contentHeight = Math.max(1, maxY - minY);

      const scale = 0.9 * Math.min(TARGET_WIDTH / contentWidth, TARGET_HEIGHT / contentHeight);

      // Center the content within the target box
      const offsetX = (TARGET_WIDTH - contentWidth * scale) / 2 - minX * scale;
      const offsetY = (TARGET_HEIGHT - contentHeight * scale) / 2 - minY * scale;

      return {
        id: variant.id,
        conditions,
        label: labelParts.join(' · '),
        layout: miniLayout,
        nodes: flattened,
        hasChildren,
        scale,
        offsetX,
        offsetY,
      };
    });
}

