export type MarkdownSyntaxEntry = {
  id: string;
  label: string;
  description: string;
  examples: string[];
  clickable?: boolean;
};

export const GRID_MARKDOWN_SYNTAX: MarkdownSyntaxEntry[] = [
  {
    id: 'pills',
    label: 'Pills / tags',
    description: 'Renders as tag pills. Click to edit (search/add/remove).',
    examples: ['<<tagA>>', '<<tagA,tagB>>', '<<tagA>><<tagB>>'],
    clickable: true,
  },
  {
    id: 'people',
    label: 'People',
    description: 'Renders as people chips/avatars. Click to edit (search/add/remove).',
    examples: [':)John Doe:)', ':)John Doe,Laura Ng:)'],
    clickable: true,
  },
  {
    id: 'check',
    label: 'Checkbox',
    description: 'Compact checkbox token. Click to toggle.',
    examples: ['[]', '[ ]', '[x]'],
    clickable: true,
  },
  {
    id: 'radio',
    label: 'Radio',
    description: 'Compact radio token. Click to select (clears other radios on the same line).',
    examples: ['( )', '()', '(o)'],
    clickable: true,
  },
  {
    id: 'seg',
    label: 'Button group',
    description: 'Segmented buttons. Use * to mark the selected option. Click to change selection.',
    examples: ['{{low|*med|high}}', '{{😀|*😐|😡}}'],
    clickable: true,
  },
  {
    id: 'progress',
    label: 'Progress',
    description: 'Progress bar. Add ! to make it draggable.',
    examples: ['%%40', '%%40!'],
    clickable: true,
  },
  {
    id: 'date',
    label: 'Date',
    description: 'Date widget. Typing @@ opens the date picker; click to edit.',
    examples: ['@@', '@@2026-02-14', '@@2026-02-14..2026-02-20'],
    clickable: true,
  },
  {
    id: 'color',
    label: 'Semantic color',
    description: '2-char color token + text. Uppercase means background highlight.',
    examples: ['r:urgent', 'g:ok', 'y:warn', 'b:info', 'R:urgent', 'G:(looks good)'],
  },
  {
    id: 'markdown',
    label: 'Standard Markdown',
    description: 'Regular markdown works too (headings, lists, links, code).',
    examples: ['# Heading', '- list item', '[label](https://example.com)', '`code`', '```\\ncode block\\n```'],
  },
];

export const GRID_MARKDOWN_LOOKS_RICH_RE =
  /(\[\[.+?\]\])|<<.*?>>|:\).*?:\)|\{\{.+?\}\}|\^\w\{.+?\}|[rgbyRGBY]:(?:\S|\()|[rgbyRGBY]\{.+?\}|%%\d{1,3}!?(?!\d)|@@|[*_~`#[\]()>-]|!\[|\[.+\]\(.+\)|\n/;

