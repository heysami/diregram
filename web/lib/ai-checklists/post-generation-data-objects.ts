export const POST_GEN_CHECKLIST_DATA_OBJECTS = `Post-Generation Checklist — Data Relationship UI Realization (logical + wired + visible in UI)

Goal:
  - Ensure data objects are not only modeled correctly in \`\`\`data-objects\`\`\`, but also RENDER correctly in the Diregram UI.
  - The UI often depends on IA anchors and expanded-screen bindings to compute “linked objects”.

MUST:
  - Domain model is the source of truth (\`\`\`data-objects\`\`\`).
  - Every important object must be anchored in IA and realized in expanded screens (for important relations).
AVOID:
  - Barebone objects that “pass” but cannot support the screens/flows you defined.
  - “Invisible” objects (defined in \`\`\`data-objects\`\`\` but never anchored in IA).

☐ A) IA anchor completeness (MUST):
  → Pass condition: Every do-* defined in \`\`\`data-objects\`\`\` appears at least once in the IA tree as:
    - <!-- do:do-X -->
  → Fail if: any object has zero IA anchors.
  → Reminder: anchor “secondary” objects too (verification/session/audit/interface payloads are common misses).

☐ B) Expanded-screen link realization (MUST for transaction objects):
For each transaction object do-T (one per counted main-canvas #flow# process root):
  → Pass condition: There exists an expanded screen where:
    - expanded-metadata.dataObjectId == do-T (primary object), AND
    - at least two expanded-grid cells reference other do-* with relationKind:"relation".
  → Fail if: links are only defined in data-objects.relations but never realized in expanded grids.

☐ C) Primary-object sanity (MUST):
  → MUST set expanded-metadata-N.dataObjectId to match the conceptual focus:
    - Landing/dashboard → Account-ish object (not the transaction object)
    - Wizard/summary → Transaction object
    - Payment screen → Payment object
  → Warn if: a dashboard/landing expanded screen primary object is a transaction object AND the grid lists the same object (self-link artifacts are common).

☐ D) Relationship closure (MUST):
  → Warn if: a supporting object does not have any explicit relation path back to the transaction object it supports.
  → Optional strict mode (MUST): supporting object includes a direct back-reference relation to the transaction object.

☐ E) UI troubleshooting note (MUST text; include in your QA notes):
  If UI doesn’t show links but markdown has relations:
    - confirm the object has an IA anchor <!-- do:... -->
    - confirm at least one expanded screen realizes the relation using relationKind:"relation"
    - confirm you imported the full file (not a partial copy/paste)

☐ Domain model integrity (MUST):
  → MUST define every entity as an entry under data-objects.objects[].
  → MUST define relationships only using objects[].data.relations[] with:
    - name: string
    - to: target do id (e.g. "do-4")
    - cardinality: "one" | "oneToMany" | "manyToMany" | ...
  → SHOULD model key relationships bidirectionally (preferred for analysis).

☐ Orphan detection (MUST; prevents dead weight):
  → Each do-* in \`\`\`data-objects\`\`\` MUST be referenced by at least one:
    - tree anchor <!-- do:do-X -->, OR
    - expanded-grid node dataObjectId, OR
    - expanded-grid nested UI bindings:
      - uiTabs[].dataObjectId / uiTabs[].items[].dataObjectId
      - uiSections[].dataObjectId / uiSections[].items[].dataObjectId

☐ Attribute selection integrity (MUST; prevents “selected attrs don’t exist”):
  → If ANY expanded-grid binding includes dataObjectAttributeIds:
    - IDs MUST exist on that data object (plus "__objectName__" is allowed)
    - dataObjectAttributeMode SHOULD be set:
      - data = read-only data
      - input = input form controls

☐ Attributes + samples (MUST when source provides them):
  → MUST match attributes to the source (existing schema/docs/examples) when available.
  → MUST include realistic sample values for user-facing fields when known (helps UI table materialization and QA).
  → Second-pass sanity: infer missing attributes from screens (what fields a user sees/edits on each screen) and add them to the correct object.

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
  → Schema consistency reminder:
    - AVOID mixing incompatible shapes (some objects with fields/relations, others empty)
    - MUST include stable identifiers and timestamps where relevant

☐ Status attribute shape (MUST; used by conditional “locked” dimensions):
  → Data Object attributes support:
    - type:"text": optional sample
    - type:"status": MUST include values:string[] (and may include sample)
  → AVOID status attributes with missing/empty values when they are referenced by conditional dimensions

☐ Status attribute descriptions (shared; table + flow):
  → Table/Flow descriptions for status attributes MUST be stored in the shared markdown section:
    - \`---\` section \`## Data Object Attribute Descriptions\`
    - Headings: \`### [table|flow] <Object> – <Attribute> (doId::attrId)\`
  → If a conditional hub is linked to a Data Object and includes a locked status dimension:
    - Its “Describe: Table/Flow” MUST edit the SAME \`doId::attrId\` description blocks (single source of truth)
`;

