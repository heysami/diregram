export type DimensionDescriptionMode = 'flow' | 'table';

export interface DimensionDescriptionBlock {
  id: string; // Legacy: node.id::dimensionKey format (for backward compatibility)
  runningNumber?: number; // New: stable running number identifier
  hubLabel: string;
  mode: DimensionDescriptionMode;
  bodyLines: string[];
}

const SECTION_SEPARATOR = '---';
const SECTION_TITLE = '## Condition Dimension Descriptions';

/**
 * Parse the shared markdown into:
 * - mainBody: everything before the dimension descriptions section
 * - blocks: parsed description blocks keyed by hub/node id
 */
export function parseDimensionDescriptions(markdown: string): {
  mainBody: string;
  blocks: DimensionDescriptionBlock[];
} {
  const lines = markdown.split('\n');
  const sepIndex = lines.findIndex(
    (l) => l.trim() === SECTION_SEPARATOR
  );

  if (sepIndex === -1) {
    return { mainBody: markdown, blocks: [] };
  }

  const titleIndex = lines.findIndex(
    (l, idx) => idx > sepIndex && l.trim().toLowerCase() === SECTION_TITLE.toLowerCase()
  );

  if (titleIndex === -1) {
    // Separator exists but no title; treat everything as main body to avoid corrupting content
    return { mainBody: markdown, blocks: [] };
  }

  const mainBody = lines.slice(0, sepIndex).join('\n').trimEnd();
  const rest = lines.slice(titleIndex + 1);

  const blocks: DimensionDescriptionBlock[] = [];
  let current: DimensionDescriptionBlock | null = null;

  const flush = () => {
    if (current) {
      // Trim trailing empty lines from body
      while (current.bodyLines.length > 0 && current.bodyLines[current.bodyLines.length - 1].trim() === '') {
        current.bodyLines.pop();
      }
      blocks.push(current);
      current = null;
    }
  };

  rest.forEach((rawLine) => {
    const line = rawLine ?? '';
    // Support both formats:
    // Legacy: ### [flow|table] Label (node-id::dimensionKey)
    // New: ### [flow|table] Label (node-id::dimensionKey) <!-- desc:N -->
    const headingMatch = line.match(/^###\s+\[(flow|table)\]\s+(.+?)\s+\(([^)]+)\)(?:\s*<!--\s*desc:(\d+)\s*-->)?\s*$/i);
    if (headingMatch) {
      flush();
      const mode = headingMatch[1].toLowerCase() as DimensionDescriptionMode;
      const hubLabel = headingMatch[2].trim();
      const id = headingMatch[3].trim();
      const runningNumber = headingMatch[4] ? parseInt(headingMatch[4], 10) : undefined;
      current = {
        id,
        runningNumber,
        hubLabel,
        mode,
        bodyLines: [],
      };
    } else {
      if (!current) {
        // Ignore any stray content before first ### heading in the section
        return;
      }
      current.bodyLines.push(line);
    }
  });

  flush();

  return { mainBody, blocks };
}

/**
 * Upsert a dimension description block for a given hub id.
 * This preserves other existing blocks and keeps the dedicated section
 * clearly separated from the main chart by a markdown separator + title.
 */
export function upsertDimensionDescription(markdown: string, block: DimensionDescriptionBlock): string {
  const { mainBody, blocks } = parseDimensionDescriptions(markdown);

  const others = blocks.filter((b) => !(b.id === block.id && b.mode === block.mode));
  const nextBlocks = [...others, block];

  const lines: string[] = [];

  // Main body
  if (mainBody.trim().length > 0) {
    lines.push(mainBody.trimEnd());
  }

  // Separator + section title
  lines.push('');
  lines.push(SECTION_SEPARATOR);
  lines.push(SECTION_TITLE);
  lines.push('');

  // Blocks
  nextBlocks.forEach((b, idx) => {
    // Include running number in comment if available
    const runningNumberComment = b.runningNumber ? ` <!-- desc:${b.runningNumber} -->` : '';
    lines.push(`### [${b.mode}] ${b.hubLabel} (${b.id})${runningNumberComment}`);
    if (b.bodyLines.length > 0) {
      lines.push(...b.bodyLines);
    }
    if (idx < nextBlocks.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n').trimEnd() + '\n';
}

