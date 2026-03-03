export const SINGLE_SCREEN_STEPS_GUIDE = `Guide — Single Screen Steps (Process Flows only)

What it is:
  - A process-flow-only grouping feature that lets one #flow# node represent ONE UI screen containing multiple tasks/steps.
  - The start is a #flow# node typed as \`single_screen_steps\`.
  - The end is selected via a “Last step” dropdown and persisted in \`\`\`process-single-screen-N\`\`\`.

When to use (heuristics):
  - Repeatable tasks before moving on (e.g. add/edit multiple items, review multiple sections).
  - Pattern: main screen → open overlay → back → open another overlay → back (same base screen context).
  - High review density: lots of content the user must review in one place before proceeding.

How to apply in Diregram UI:
  1) Generate your process flow first.
  2) Audit with the “Single Screen Steps” checklist.
  3) In process-flow mode: set the start node type to “Single Screen Steps”.
  4) On the start node, select “Last step”.
  5) Use the group panel to collapse/expand (collapse is UI-only; not persisted).

Markdown persistence:
  - Start typing: \`\`\`process-node-type-N\`\`\` with { "type": "single_screen_steps" } (N = start node runningNumber).
  - End selection: \`\`\`process-single-screen-N\`\`\` with { "lastStepId": "node-<lineIndex>" }.
`;

