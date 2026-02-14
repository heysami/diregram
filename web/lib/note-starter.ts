import { upsertHeader } from '@/lib/nexus-doc-header';

export function makeStarterNoteMarkdown(): string {
  const base = `# Untitled\n\nWrite here.\n\n## Sections\n\n- Use headings to build the outline.\n- Use semantic color tokens like \`r:attention\`, \`g:success\`, \`y:warning\`, \`b:info\`.\n\n## Embeds\n\n\`\`\`nexus-embed\n{\n  \"id\": \"embed-1\",\n  \"kind\": \"systemflow\",\n  \"fileId\": \"<optional-file-id>\",\n  \"ref\": \"systemflow-1\"\n}\n\`\`\`\n\n\`\`\`nexus-table\n{\n  \"id\": \"table-1\",\n  \"mode\": \"intersection\",\n  \"sources\": []\n}\n\`\`\`\n\n\`\`\`nexus-test\n{\n  \"id\": \"test-1\",\n  \"fileId\": \"<optional-file-id>\",\n  \"testId\": \"<test-id>\"\n}\n\`\`\`\n`;

  return upsertHeader(base, { kind: 'note', version: 1 });
}

