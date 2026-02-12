export const POST_GEN_CHECKLIST_DATA_OBJECTS = `Post-Generation Checklist — Data Objects Correctness (logical + wired; must support screens/flows)

MUST:
  - Data objects must be logically coherent AND wired into screens/flows.
  - If the model is not logical, revise the main canvas + expanded UI + flows until it becomes logical.
AVOID:
  - Barebone objects that “pass” but cannot support the screens/flows you defined.

☐ Orphan detection:
  → Each do-* in \`\`\`data-objects\`\`\` MUST be referenced by at least one:
    - tree anchor <!-- do:do-X -->, OR
    - expanded-grid node dataObjectId
  → AVOID orphan objects (dead weight)

☐ Transaction object declaration (MUST):
  → For EACH counted #flow# process root:
    - MUST declare EXACTLY ONE transaction object via exactly one <!-- do:do-X --> on the process root line
    - AVOID multiple do anchors on the same process root
  → Reminder: if you cannot name ONE durable “thing moving through the flow”, ask WHY the flow exists and revise the IA/flow until it is clear.

☐ Flow-root-driven completeness:
  → For EACH counted #flow# process root:
    - Exactly ONE transaction object exists (Order/Case/Request/Application/etc.) and is wired
    - ≥2 supporting objects exist and are wired (PaymentIntent/Document/Message/VerificationSession/EligibilityCheck/AuditEvent/etc.)

☐ Domain logic review (conceptual correctness):
  → Relations/cardinality MUST reflect what screens/flows create/update/read
  → Baseline fields MUST be consistent (id, createdAt, updatedAt; status where applicable)
  → Any object with status MUST have defined states/transitions (dimension descriptions or equivalent), OR MUST be explicitly marked out-of-scope with a reason
  → If relationships are missing:
    - Ask WHY (is it truly independent, or is the model incomplete?)
    - If the relationship should exist, revise the main canvas screens and/or flows so the relationship is explicit and wired.
  → Schema consistency reminder:
    - AVOID mixing incompatible shapes (some objects with fields/relations, others empty)
    - MUST include stable identifiers and timestamps where relevant
`;

