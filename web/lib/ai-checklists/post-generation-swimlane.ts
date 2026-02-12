export const POST_GEN_CHECKLIST_SWIMLANE = `Post-Generation Checklist — Swimlane Correctness + Coverage (journey map; must reflect main canvas processes)

MUST:
  - Treat Flowtab as a journey map (chapter-level handoffs), not a duplicate step-by-step process spec.
AVOID:
  - Micro-steps in Flowtab that belong inside #flow# nodes / flow-node-N graphs.

☐ Swimlane meaning:
  → Lane/stage changes reflect party/session boundaries (different users/roles, different systems, waiting/async, condition gates)
  → AVOID lane/stage churn just to “fill the grid”
  → Reminder: lane/stage changes must have a WHY (handoff / async wait / boundary)

☐ Actor semantics (MUST for #flow# nodes; recommend for Flowtab steps):
  → MUST NOT encode actors in node titles (no "System:" / "Staff:" / "Applicant:" / "Partner:" prefixes)
  → Every #flow# node line MUST declare EXACTLY ONE actor tag (tg-actors): actor-applicant/actor-staff/actor-system/actor-partner
  → Swimlane lanes MUST represent actor boundaries:
    - If the journey involves multiple actors/users/systems/partners, EACH must have its own lane (one lane per actor/system). Do NOT combine actors in one lane.
    - If a lane label clearly implies an actor (e.g. "Admissions staff", "System"), placed nodes SHOULD have the matching actor tag
    - If a mismatch is intentional, add an annotation explaining it (handoff vs execution actor, shared responsibility, etc.)

☐ Non-linearity sanity (MUST; logic-first):
  → The journey map must NOT read like “everything always goes smoothly, linearly”.
  → If the underlying process can diverge, the Flowtab must show it at a high level:
    - Examples: eligibility fail, payment fail/retry, request-more-info loop, reject outcome, alternate verification methods.
  → How to model divergence in Flowtab:
    - Use a decision/handoff node with 2+ CHILDREN as sibling branches (not a single nested chain).
    - Ensure each branch edge has a connector label that is conditional (IF/ELSE), not inevitable (“Next”/“Continue”).
  → If you intentionally omit a branch from the journey map, you MUST add an explicit reason annotation on the Flowtab node:
    <!-- ann:OOS_PATH%3A%20<reason> -->

☐ Swimlane-to-process linking (no implicit matching by name):
  → If swimlane steps are intended to map to process flows, \`\`\`flowtab-process-references\`\`\` MUST exist
  → Each Flowtab step node (node-<lineIndex>) has an entry of kind whole/inner
  → AVOID implicit matching by title text (it drifts and breaks)

☐ Coverage gate (MUST; completeness):
  → For EACH counted #flow# process root:
    - MUST be referenced by ≥1 flowtab-process-references entry with kind:"whole", OR
    - MUST be explicitly marked out-of-scope on the process root line:
      <!-- ann:OOS_JOURNEY%3A%20<reason> -->

☐ Minimum journeys gate:
  → If P > 0, MUST have J ≥ 1 (unless ALL roots are OOS_JOURNEY)

☐ Swimlane handoff labeling:
  → Swimlane blocks don’t support connectors
  → MUST express handoff meaning using \`\`\`flow-connector-labels\`\`\` on Flowtab parent→child edges (direct parent→child only)
  → Reminder: Flowtab step sequence MUST be modeled as a nested chain (parent → child → grandchild) for linear journeys.
    - AVOID flat sibling lists for linear progression.
  → If the journey includes branches, labels MUST communicate conditions:
    - GOOD: "If eligible", "If payment fails", "If rejected", "If more info required"
    - BAD: "Next", "Continue", "Proceed" (these imply inevitability and hide risk)
`;

