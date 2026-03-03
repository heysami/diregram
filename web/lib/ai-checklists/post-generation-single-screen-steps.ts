export const POST_GEN_CHECKLIST_SINGLE_SCREEN_STEPS = `Post-Generation Checklist — Single Screen Steps (Process Flows only)

Goal:
  - Audit whether adjacent process-flow steps should be grouped as ONE UI screen using "Single Screen Steps".
  - Prevent over-splitting screens (one step per screen) when the UX is realistically one screen with multiple tasks.

☐ Identify candidate ranges:
  → Look for a #flow# range where multiple steps are plausibly done on ONE screen without navigating away.
  → Branching inside the range can still be “one screen” when branches represent in-screen tasks (e.g. multiple overlays from the same screen).

☐ Repeatable tasks before moving on:
  → Multiple similar actions the user can repeat (add/edit/remove, configure multiple sections) before proceeding.
  → If the user can stay on the same screen and complete N tasks in any order, it is a strong grouping candidate.

☐ Overlay-return-to-main pattern:
  → main screen → open overlay → return → open another overlay → return (same base screen context).
  → The overlays are not “new screens”; they are tasks within the same screen.

☐ High review density:
  → The user must review a lot of content in one place (summary/review screen) before a single “Continue/Submit”.
  → Break into tasks/sections, but keep them under one screen if the user stays put.

☐ Don’ts (avoid bad grouping):
  → Don’t group across true navigation / screen transitions (route/URL changes, full page replace, new module).
  → Don’t group when leaving the screen is required between tasks (e.g. step requires completion elsewhere).
  → Don’t group across branching points when branches represent true navigation/screen transitions.

How to apply in Diregram UI:
  1) Set the start node type to “Single Screen Steps” (\`process-node-type-N\` = \`single_screen_steps\`).
  2) Select the “Last step” on the start node (writes \`process-single-screen-N\` with { "lastStepRunningNumber": 12 }).
  3) Use the group panel to collapse/expand to verify the screen boundary is correct.
`;
