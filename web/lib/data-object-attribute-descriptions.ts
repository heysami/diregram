export type DataObjectAttributeDescriptionMode = 'flow' | 'table';

export interface DataObjectAttributeDescriptionBlock {
  /** Format: doId::attrId */
  id: string;
  label: string;
  mode: DataObjectAttributeDescriptionMode;
  bodyLines: string[];
}

const SECTION_SEPARATOR = '---';
const SECTION_TITLE = '## Data Object Attribute Descriptions';

export function parseDataObjectAttributeDescriptions(markdown: string): {
  mainBody: string;
  blocks: DataObjectAttributeDescriptionBlock[];
} {
  const lines = markdown.split('\n');
  const sepIndex = lines.findIndex((l) => l.trim() === SECTION_SEPARATOR);
  if (sepIndex === -1) return { mainBody: markdown, blocks: [] };

  const titleIndex = lines.findIndex(
    (l, idx) => idx > sepIndex && l.trim().toLowerCase() === SECTION_TITLE.toLowerCase(),
  );
  if (titleIndex === -1) return { mainBody: markdown, blocks: [] };

  const mainBody = lines.slice(0, sepIndex).join('\n').trimEnd();
  const rest = lines.slice(titleIndex + 1);

  const blocks: DataObjectAttributeDescriptionBlock[] = [];
  let current: DataObjectAttributeDescriptionBlock | null = null;

  const flush = () => {
    if (!current) return;
    while (current.bodyLines.length > 0 && current.bodyLines[current.bodyLines.length - 1].trim() === '') {
      current.bodyLines.pop();
    }
    blocks.push(current);
    current = null;
  };

  rest.forEach((rawLine) => {
    const line = rawLine ?? '';
    const headingMatch = line.match(/^###\s+\[(flow|table)\]\s+(.+?)\s+\(([^)]+)\)\s*$/i);
    if (headingMatch) {
      flush();
      const mode = headingMatch[1].toLowerCase() as DataObjectAttributeDescriptionMode;
      const label = headingMatch[2].trim();
      const id = headingMatch[3].trim();
      current = { id, label, mode, bodyLines: [] };
      return;
    }
    if (!current) return;
    current.bodyLines.push(line);
  });

  flush();
  return { mainBody, blocks };
}

export function upsertDataObjectAttributeDescription(
  markdown: string,
  block: DataObjectAttributeDescriptionBlock,
): string {
  const { mainBody, blocks } = parseDataObjectAttributeDescriptions(markdown);
  const others = blocks.filter((b) => !(b.id === block.id && b.mode === block.mode));
  const nextBlocks = [...others, block];

  const out: string[] = [];
  if (mainBody.trim().length > 0) out.push(mainBody.trimEnd());

  out.push('');
  out.push(SECTION_SEPARATOR);
  out.push(SECTION_TITLE);
  out.push('');

  nextBlocks.forEach((b, idx) => {
    out.push(`### [${b.mode}] ${b.label} (${b.id})`);
    if (b.bodyLines.length > 0) out.push(...b.bodyLines);
    if (idx < nextBlocks.length - 1) out.push('');
  });

  return out.join('\n').trimEnd() + '\n';
}

