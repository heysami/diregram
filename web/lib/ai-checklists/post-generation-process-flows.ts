export const POST_GEN_CHECKLIST_PROCESS_FLOWS = `Post-Generation Checklist — Main Canvas Process Flows (#flow# trees + registries)

Goal:
  - Ensure process-node-type and flow-graph metadata is LINKED correctly so the UI renders diamonds/time/goto/end as intended.
  - Prevent the common failure mode: “it says validation in markdown but it renders as step”.

MUST:
  - Treat main-canvas #flow# trees as session-scoped process specifications (wizard/work-session), not multi-week cross-timeframe journeys.
  - Ensure actor semantics are machine-checkable: every #flow# node line must have EXACTLY ONE tg-actors actor tag (actor-applicant/actor-staff/actor-system/actor-partner).

☐ Identify process roots (main canvas only):
  → P = #flow# process roots on main canvas (exclude Flowtab subtree)
  → Each root should represent ONE coherent session/timeframe

☐ Process typing linkage (CRITICAL MUST):
  → If ANY \`\`\`process-node-type-N\`\`\` blocks exist, a \`\`\`flow-nodes\`\`\` registry MUST exist
  → For EACH \`\`\`process-node-type-N\`\`\` block:
    - \`\`\`flow-nodes\`\`\` MUST contain an entry with runningNumber N
    - (Recommended) flow-nodes entry should correctly identify the intended #flow# node (content + parentPath + lineIndex)
  → If this mapping is missing/mismatched, the UI will fall back to default type ("step") and diamonds will not appear

☐ Branching correctness (tree-level):
  → For each branching #flow# node (2+ direct children):
    - MUST have \`\`\`process-node-type-*\`\`\` set to type validation|branch for that node’s runningNumber (from flow-nodes)
    - MUST have \`\`\`flow-connector-labels\`\`\` entries for EACH parent→child branch edge
    - Labels MUST explain conditions (IF/ELSE), not “Next/Continue”

☐ Goto correctness (tree-level):
  → If a #flow# node is intended to be a goto:
    - MUST have \`\`\`process-node-type-N\`\`\` type "goto" for that node’s runningNumber (from flow-nodes)
    - MUST have \`\`\`process-goto-N\`\`\` with a valid targetId (node-<lineIndex>)

☐ Loop correctness (tree-level; optional target):
  → If a #flow# node is intended to be a loop:
    - MUST have \`\`\`process-node-type-N\`\`\` type "loop" for that node’s runningNumber (from flow-nodes)
    - (Optional) If the loop’s “Loop to” target is selected in the UI:
      - MUST have \`\`\`process-loop-N\`\`\` with a valid targetId (node-<lineIndex>)
      - targetId SHOULD be a descendant of the loop node (in-tree)

☐ Flow graph payload (optional but recommended for complex flows):
  → \`\`\`flow-nodes\`\`\` entries[] define which nodes have a flow graph runningNumber
  → For each entry runningNumber N, \`\`\`flow-node-N\`\`\` should exist when you expect a detailed graph editor view
  → In \`\`\`flow-node-N\`\`\`, each nodes[] item MUST have a type:
    - step/time/loop/action/validation/branch/goto/end

☐ UI sanity (visual):
  → Enable process-flow mode for each root process and verify:
    - validation/branch nodes render as diamonds
    - time nodes show the time styling
    - loop nodes show the loop styling and (when selected) offer a Loop to dropdown
    - goto nodes show hatch styling and jump target behaves as expected
`;

