export const POST_GEN_CHECKLIST_DATA_OBJECTS = `Post-Generation Checklist — Data Objects Correctness (logical + wired; must support screens/flows)

MUST:
  - Data objects must be logically coherent AND wired into screens/flows.
  - If the model is not logical, revise the main canvas + expanded UI + flows until it becomes logical.
AVOID:
  - Barebone objects that “pass” but cannot support the screens/flows you defined.

☐ Orphan detection:
  → Each do-* in \`\`\`data-objects\`\`\` MUST be referenced by at least one:
    - tree anchor <!-- do:do-X -->, OR
    - expanded-grid node dataObjectId, OR
    - expanded-grid nested UI bindings:
      - uiTabs[].dataObjectId / uiTabs[].items[].dataObjectId
      - uiSections[].dataObjectId / uiSections[].items[].dataObjectId
  → AVOID orphan objects (dead weight)

☐ Attribute selection integrity (MUST; prevents “selected attrs don’t exist”):
  → If ANY expanded-grid binding includes dataObjectAttributeIds:
    - IDs MUST exist on that data object (plus "__objectName__" is allowed)
    - dataObjectAttributeMode SHOULD be set:
      - data = read-only data
      - input = input form controls

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
  → Any object with status MUST have defined states/transitions (Table/Flow descriptions or equivalent), OR MUST be explicitly marked out-of-scope with a reason
  → If relationships are missing:
    - Ask WHY (is it truly independent, or is the model incomplete?)
    - If the relationship should exist, revise the main canvas screens and/or flows so the relationship is explicit and wired.
  → Schema consistency reminder:
    - AVOID mixing incompatible shapes (some objects with fields/relations, others empty)
    - MUST include stable identifiers and timestamps where relevant

☐ Status attribute shape (MUST; used by conditional “locked” dimensions):
  → Data Object attributes support:
    - type:"text": optional sample
    - type:"status": MUST include values:string[] (and may include sample)
  → AVOID status attributes with missing/empty values when they are referenced by conditional dimensions
  → If a status value is renamed, references should still behave:
    - Conditional locked dimension values are derived from the Data Object values
    - Autocomplete/link indicators should update accordingly

☐ Status attribute descriptions (shared; table + flow):
  → Table/Flow descriptions for status attributes MUST be stored in the shared markdown section:
    - \`---\` section \`## Data Object Attribute Descriptions\`
    - Headings: \`### [table|flow] <Object> – <Attribute> (doId::attrId)\`
  → If a conditional hub is linked to a Data Object and includes a locked status dimension:
    - Its “Describe: Table/Flow” MUST edit the SAME \`doId::attrId\` description blocks (single source of truth)
`;

