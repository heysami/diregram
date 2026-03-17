export const POST_GEN_CHECKLIST_PROCESS_FLOWS = `Post-Generation Checklist — Main Canvas Process Flows (#flow# trees + registries)

Goal:
  - Ensure process-node-type and flow-graph metadata is LINKED correctly so the UI renders diamonds/time/goto/end as intended.
  - Prevent the common failure mode: “it says validation in markdown but it renders as step”.
  - Make same-screen grouping explicit so graph/RAG can understand when adjacent flow tasks still belong to one screen.
  - Allowed \`\`\`process-node-type-N\`\`\` values include: step, single_screen_steps, time, loop, action, validation, branch, goto, end.

MUST:
  - Treat main-canvas #flow# trees as session-scoped process specifications (wizard/work-session), not multi-week cross-timeframe journeys.
  - Ensure actor semantics are machine-checkable: every #flow# node line must have EXACTLY ONE app-specific tg-actors actor tag.
  - Across tg-actors, include at least one concrete actor tag for each coverage class: self-service/external user, operational/admin, platform/back-office/system.

☐ Identify process roots (main canvas only):
  → P = #flow# process roots on main canvas (exclude Flowtab subtree)
  → Each root should represent ONE coherent session/timeframe

☐ Step / action-fit sanity (MUST):
  → #flow# node titles MUST read like concrete actions, decisions, waits, or outcomes.
  → GOOD:
    - "Enter shipping address"
    - "Confirm order"
    - "Payment failed?"
    - "Wait for approval"
  → BAD:
    - "Checkout page"
    - "Confirm button"
    - "Order object"
    - "user can click confirm"
  → If a title reads like a screen/page, move it to IA/expanded UI.
  → If it reads like a component/control, move it to expanded UI.
  → If it reads like a domain entity, move it to data-objects.

☐ Screen-boundary analysis (MUST for non-swimlane flows):
  → For every adjacent next/previous step range, decide whether the user is still on the SAME underlying screen context.
  → If several tasks still happen on one screen, group them as Single Screen Steps instead of modeling fake screen transitions.
  → This matters for graph/RAG because grouped tasks should map to one shared screen context.

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

☐ Single Screen Steps (tree-level grouping; MUST when same-screen range exists):
  → If adjacent tasks are still under ONE screen:
    - MUST have \`\`\`process-node-type-N\`\`\` type "single_screen_steps" for the START node’s runningNumber (from flow-nodes)
    - MUST have \`\`\`process-single-screen-N\`\`\` with a valid lastStepRunningNumber for the final in-screen task
  → Do not leave same-screen steps as separate screens just because they appear sequential in the tree
  → Then run: “Post-Generation Checklist — Single Screen Steps”

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
