export const POST_GEN_CHECKLIST_CONDITIONAL = `Post-Generation Checklist — Conditional Nodes / Hubs Usage (must be intentional)

MUST:
  - Use conditional hubs only when there is real lifecycle/timeframe/state variation.
AVOID:
  - Using conditional hubs as a second sitemap or as a substitute for process steps.

☐ When to use conditional hubs (MUST / AVOID):
  → MUST use hubs/variants for lifecycle/timeframe/state-based variants (Status=..., Phase=..., Eligibility=..., etc.)
  → AVOID using hubs to represent step-by-step journeys or “waiting” steps (those belong in #flow# processes or swimlane handoffs)
  → If your end-to-end journey crosses timeframes (days/weeks) or role handoffs:
    - Prefer splitting into session-scoped #flow# processes AND linking them via Phase/Status hubs and/or Flowtab swimlane handoffs.
    - Modeling option: use a dimension like (Phase=...) or (Session=...) to segment timeframes instead of forcing one long #flow# chain.

☐ Hub formation rules (MUST):
  → MUST use sibling lines with EXACT same title text plus (Key=value, ...) to form variants
  → MUST avoid ambiguous hubs:
    - AVOID mixing conditioned and non-conditioned siblings with the same title
    - If you need a default, make it explicit: (variant=default) or (status=any)

☐ Correct placement (AVOID):
  → AVOID duplicating the sitemap inside variants (no “second sitemap”)
  → Variants should define state meaning + enablement, not replicate portal pages/actions

☐ Dimension descriptions (if lifecycle/state is modeled) (MUST):
  → If a hub line uses <!-- desc:... --> anchors:
    - MUST have \`\`\`dimension-descriptions\`\`\` block with matching runningNumber entries
    - MUST have the prose section:
      ## Condition Dimension Descriptions
      with matching headers and <!-- desc:N --> anchors
  → AVOID having desc anchors without the block/prose (it becomes untraceable)

☐ Conditional hub notes (if used) (MUST):
  → If a hub line uses <!-- hubnote:N -->:
    - MUST have \`\`\`conditional-hub-notes\`\`\` with runningNumber N and correct lineIndex
  → AVOID hubnote anchors without registry entries

☐ Logical check (must ask “why”):
  → If a conditional dimension exists but does not materially affect screens/flows:
    - Ask WHY it exists
    - If it should affect behavior, revise #flow# and/or expanded UI to reflect it
    - If it is out-of-scope, explicitly mark it as out-of-scope with a reason (annotation)
  → Reminder: Any object with a status/state SHOULD have explicit states/transitions (dimension descriptions or equivalent), or be explicitly out-of-scope.
`;

