import { NexusNode } from '@/types/nexus';

// Classic Mac (1‑bit) pattern themes.
// We keep borders/text monochrome and use pattern fills to differentiate groups.
const MAIN_PATTERNS = [
  // Prefer alternation so groups feel like “dot / diagonal / dot / diagonal / …”
  { fill: 'mac-fill--dots-1' },
  { fill: 'mac-fill--hatch' },
  { fill: 'mac-fill--dots-2' },
  { fill: 'mac-fill--hatch2' },
  { fill: 'mac-fill--dots-3' },
  { fill: 'mac-fill--stripes-h' },
  { fill: 'mac-fill--checker' },
  { fill: 'mac-fill--stripes-v' },
] as const;

const NEUTRAL_PATTERNS = [
  'mac-fill--checker', // Level 0 (highest contrast)
  'mac-fill--hatch',   // Level 1
  'mac-fill--dots-3',  // Level 2
] as const;

export interface NodeStyle {
    className: string;
    style?: React.CSSProperties;
    borderColor?: string;
    backgroundColor?: string;
}

// Internal style descriptor used by NexusCanvas
export function getNodeStyle(
  node: NexusNode,
  mainLevel: number,
  nodeIndexInLevel: number,
  parentHueIndex: number = -1,
  parentShadeIndex: number = 0,
): { styleClass: string; hueIndex: number; shadeIndex: number } {
    const level = node.level;

    // 1. Levels BEFORE Main Level (Roots) -> Dark Neutral
    if (level < mainLevel) {
        // Clamp to available shades or repeat last one
        const shadeIndex = Math.min(level, NEUTRAL_PATTERNS.length - 1);
        return { 
            styleClass: `border border-black ${NEUTRAL_PATTERNS[shadeIndex]} text-black`, 
            hueIndex: -1, // no hue
            shadeIndex: shadeIndex,
        };
    }

    // 2. The Main Level itself -> White/Pattern box (no color), strong border
    if (level === mainLevel) {
        const hueIndex = nodeIndexInLevel % MAIN_PATTERNS.length;
        const theme = MAIN_PATTERNS[hueIndex];
        return { 
            styleClass: `border-2 border-black ${theme.fill} text-black`, 
            hueIndex,
            shadeIndex: 0,
        };
    }

    // 3. Children of Main Level (Level > Main)
    // Direct children of main level (level === mainLevel + 1):
    //   - share the same lightness (childBgs[0])
    //   - but use different hues across siblings.
    // Deeper descendants keep the hue + lightness of their parent child.
    if (level > mainLevel) {
      // Direct children of main: ignore parentHueIndex, pick hue by sibling index
      if (level === mainLevel + 1) {
        const childHueIndex = nodeIndexInLevel % MAIN_PATTERNS.length;
        const theme = MAIN_PATTERNS[childHueIndex];
        const shadeIndex = 0; // same lightness for all direct children
        return {
          styleClass: `${theme.fill} border-2 border-black text-black`,
          hueIndex: childHueIndex,
          shadeIndex,
        };
      }

      // Deeper descendants: inherit hue + lightness from parent
      if (parentHueIndex !== -1) {
        const theme = MAIN_PATTERNS[parentHueIndex % MAIN_PATTERNS.length];
        const shadeIndex = parentShadeIndex;
        return {
          styleClass: `${theme.fill} border-2 border-black text-black`,
          hueIndex: parentHueIndex % MAIN_PATTERNS.length,
          shadeIndex,
        };
      }
    }

    return { styleClass: 'bg-white border-2 border-black text-black', hueIndex: -1, shadeIndex: 0 };
}

// Static themes for hub grouping visuals (background rectangle + header bar).
const HUB_GROUP_THEMES: { groupClass: string; headerClass: string }[] = MAIN_PATTERNS.map((p) => ({
  groupClass: `${p.fill} border-2 border-dashed border-black`,
  headerClass: 'bg-black',
}));

// Helper for hub grouping visuals (background rectangle + header bar)
export function getHubGroupStyle(hueIndex: number | undefined) {
  if (hueIndex === undefined || hueIndex < 0 || hueIndex >= HUB_GROUP_THEMES.length) {
    // Fallback neutral styling when we don't have a hue
    return {
      groupClass: 'mac-fill--dots-2 border-2 border-dashed border-black',
      headerClass: 'bg-black',
    };
  }

  return HUB_GROUP_THEMES[hueIndex];
}
