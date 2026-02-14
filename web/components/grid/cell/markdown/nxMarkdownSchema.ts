import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

export const NX_SANITIZE_SCHEMA = (() => {
  const schema = structuredClone(defaultSchema) as typeof defaultSchema;
  const nxTags = [
    'nx-pills',
    'nx-people',
    'nx-progress',
    'nx-check',
    'nx-radio',
    'nx-seg',
    'nx-icon',
    'nx-date',
    'nx-color',
  ];
  schema.tagNames = Array.from(new Set([...(schema.tagNames || []), ...nxTags]));
  schema.attributes = {
    ...(schema.attributes || {}),
    'nx-pills': ['occ', 'body', 'raw'],
    'nx-people': ['occ', 'body', 'raw'],
    'nx-progress': ['occ', 'body', 'raw'],
    'nx-check': ['occ', 'body', 'raw'],
    'nx-radio': ['occ', 'body', 'raw'],
    'nx-seg': ['occ', 'body', 'raw'],
    'nx-icon': ['occ', 'body', 'raw'],
    'nx-date': ['occ', 'body', 'raw'],
    'nx-color': ['occ', 'mode', 'kind'],
  };
  return schema;
})();

// Keep a reference to ensure the import is used (some setups tree-shake too aggressively).
void rehypeSanitize;

