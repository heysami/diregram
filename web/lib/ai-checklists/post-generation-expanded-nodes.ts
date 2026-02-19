export const POST_GEN_CHECKLIST_EXPANDED_NODES = `Post-Generation Checklist — Expanded Nodes (Expanded Screens UI Blueprint)

Goal:
  - Ensure expanded nodes (<!-- expid:N -->) are complete, structured, and actually realize the UI bindings the app uses.
  - Prevent the common failure mode: screens exist in IA, but expanded UI is missing or too vague to drive linked objects.

MUST:
  - Expanded grids must model screen composition (components + sections + navigation), not prose.
  - Each important screen must bind to a primary data object and realize key relationships via relation cells.

☐ Expanded screen coverage (MUST):
  → For each major IA screen a user can navigate to (per portal/surface):
    - SHOULD have an expid + expanded grid (unless explicitly OOS with reason).
  → Fail mode: only a few screens have expanded grids; the rest are vague leaf nodes.

☐ Expanded registry integrity (MUST; import-ready):
  → For each <!-- expid:N --> in the tree:
    - expanded-states has runningNumber N with correct lineIndex + exact content match
    - expanded-metadata-N exists
    - expanded-grid-N exists
  → Avoid duplicate expid and avoid “dangling” grids with no matching expid.

☐ Primary object binding (MUST):
  → Each important expanded screen MUST set:
    - expanded-metadata-N.dataObjectId = the conceptual focus object for the screen
  → Warn if: a landing/dashboard screen uses a transaction object as primary while also listing that same object (self-link artifacts).

☐ Relation realization in expanded grids (MUST for important links):
  → The UI often displays “linked objects” based on realized expanded-grid relations.
  → For each transaction object do-T (one per main-canvas #flow# root):
    - There MUST exist ≥1 expanded screen where:
      - expanded-metadata.dataObjectId == do-T, AND
      - ≥2 grid nodes reference other do-* with:
        - relationKind:"relation"
        - relationCardinality:"one" | "oneToMany" (as appropriate)
  → Fail if: relations exist only in data-objects.relations but never realized in expanded grids.

☐ UI structure completeness (MUST; prevents “ignored config”):
  → If a grid node uses uiType tabs|wizard|sideNav|dropdown:
    - uiTabs MUST be present and non-empty
    - each uiTabs[] has id + label (items optional)
  → If uiType is collapsible:
    - uiSections MUST be present and non-empty
    - each uiSections[] has id + label (items optional)

☐ Binding sanity (MUST):
  → If a grid node binds to dataObjectId:
    - relationKind SHOULD be set to attribute|relation|none (defaulting is allowed but explicit is preferred)
    - relationCardinality MUST be set when relationKind:"relation"
  → If a node selects dataObjectAttributeIds:
    - those IDs must exist on the object (plus "__objectName__" is allowed)
    - dataObjectAttributeMode SHOULD be set to data|input

☐ Anti-patterns (AVOID):
  - Long prose paragraphs inside expanded grids (use structured cards/sections/tabs instead).
  - Using expanded grids to describe end-to-end journeys (use #flow# / Flowtab for that).
  - Nav-only screens with no bindings anywhere (hard to validate data model against UX).
`;

