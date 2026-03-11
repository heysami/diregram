export const PIPELINE_DIAGRAM_REPAIR_POLICY = [
  'Pipeline Diagram Repair Policy (No Shrink-To-Pass)',
  '1. Preserve semantic scope. Keep all meaningful generated nodes and branches unless they are exact duplicates or clearly invalid placeholders.',
  '2. Prefer additive fixes. When references are missing/mismatched, add or complete missing nodes/metadata/links instead of deleting existing nodes.',
  '3. Preserve structure. Keep hierarchy and intent stable; avoid collapsing sections just to satisfy a validator.',
  '4. Allowed deletions are narrow: duplicate lines, empty/noise lines, orphan fence markers, or malformed fragments that cannot be repaired in place.',
  '5. Keep unrelated content unchanged. Restrict edits to target problem areas and minimal adjacent context.',
  '6. Resolve validator issues by re-linking, re-indexing, and completing definitions before considering removal.',
].join('\n');

