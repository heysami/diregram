export const POST_GEN_CHECKLIST_TECHNICAL = `Post-Generation Checklist — Technical Markdown Correctness (structural; must be import-ready)

MUST:
  - Make the markdown import-ready and internally consistent before judging IA/swimlane/domain logic.
AVOID:
  - “Fixing” validation by deleting scope (do not shrink); instead re-link/merge/reindex.

☐ Indentation:
  → EXACTLY 2 spaces per level, no tabs
  → No indentation jumps > 1 level at a time

☐ Separator + fences:
  → Exactly one '---' separator exists
  → No fenced code blocks appear above '---' (tree region)
  → All fenced blocks below '---' are strict JSON
  → No UNCLOSED_CODE_BLOCK errors (closing backticks exist)

☐ Registry integrity (lineIndex/node-id based):
  → Node ids are node-<lineIndex> (0-based) and are FRAGILE under edits
  → If the tree changed, ALL registries must be recomputed (expanded-states, flow-nodes, process-node-type, connector labels, swimlane placement, flowtab refs, hub registries)
  → AVOID hand-editing only one registry block; reindex everything together

☐ Expanded UI (strict):
  → Each <!-- expid:N --> appears on EXACTLY one tree line (no duplicates)
  → expanded-states has runningNumber:N
  → expanded-metadata-N exists
  → expanded-grid-N exists
  → expanded-states.entries[].content matches the node title EXACTLY

☐ Tags + actor tagging (MUST; machine-checkable semantics):
  → If the markdown uses <!-- tags:... --> ANYWHERE, it MUST include exactly one \`\`\`tag-store\`\`\` block
  → All tag IDs used in <!-- tags:... --> MUST exist in tag-store.tags[] (unknown tag IDs = FAIL)
  → tag-store MUST include required groups:
    - tg-actors (actors)
    - tg-uiSurface (ui surface) IF the markdown uses any <!-- expid:N -->
  → Actor prefixes MUST NOT appear in node titles:
    - FAIL if a node title starts with "System:" / "Staff:" / "Applicant:" / "Partner:"
  → Every #flow# node line MUST include <!-- tags:... --> and EXACTLY ONE actor tag from tg-actors
  → Every screen node with <!-- expid:N --> MUST include at least one ui-surface tag from tg-uiSurface (prefer exactly one)

☐ Connector label validity:
  → Every key "node-X__node-Y" in \`\`\`flow-connector-labels\`\`\` is a DIRECT parent→child edge in the tree
  → No cross-section / non-tree edges
  → AVOID “conceptual connectors” that do not exist in the tree structure

☐ Process splits (strict):
  → For each branching #flow# node (2+ direct children):
    - MUST have \`\`\`process-node-type-*\`\`\` type validation|branch (by runningNumber linkage to flow-nodes)
    - MUST have \`\`\`flow-connector-labels\`\`\` entries for EACH branch edge
    - Branch labels explain WHY; green #16a34a for success, red #dc2626 for errors
  → AVOID unlabeled splits (they become ambiguous and low-signal)

☐ Loop nodes (optional target):
  → If a #flow# node is typed as "loop":
    - (Optional) If a loop target is set, \`\`\`process-loop-N\`\`\` SHOULD exist with targetId (node-<lineIndex>)
    - targetId SHOULD be a descendant of the loop node (in-tree)

☐ Process node type linkage (MUST; prevents “validation not rendering”):
  → If ANY \`\`\`process-node-type-N\`\`\` blocks exist, a \`\`\`flow-nodes\`\`\` registry MUST exist
  → For EACH \`\`\`process-node-type-N\`\`\` block:
    - \`\`\`flow-nodes\`\`\` MUST contain an entry with runningNumber N
    - (Recommended) that flow-nodes entry should correctly identify the intended #flow# node (content + parentPath + lineIndex)
  → If this mapping is missing/mismatched, the UI will fall back to default type ("step") and diamonds will not appear

☐ Swimlane JSON constraints:
  → Each \`\`\`flowtab-swimlane-*\`\`\` block has lanes/stages/placement only
  → MUST NOT include a "connectors" field
  → placement keys refer to existing node ids (node-<lineIndex>)

☐ Flowtab references (if present):
  → \`\`\`flowtab-process-references\`\`\` is a JSON object/map
  → Every entry references existing node ids (rootProcessNodeId/targetNodeId)
  → For kind:"inner", expandedRunningNumber/gridNodeKey must resolve (best-effort)
`;

