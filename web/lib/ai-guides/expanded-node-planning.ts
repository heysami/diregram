export const EXPANDED_NODE_PLANNING_PROMPT = `===============================================================================
EXPANDED NODE PARKING LOT TEMPLATE (separate file; optional staging; NOT Diregram import)
===============================================================================

Goal
When expanded-grid generation is too heavy to do perfectly in one shot, use this as a staging file:
- collect the list of screens that need expanded nodes
- assign primary objects + key relations
- define the minimum expanded-grid structure required
Then use the Expanded Nodes post-generation checklist to finish the actual expanded grids properly.

Output format (MUST)
- Output a SINGLE markdown file (this file is NOT the Diregram tree format).
- Use normal markdown headings/lists freely.
- Do NOT include Diregram registries or JSON blocks unless they are short examples.

1) Screen inventory (by portal/surface) (MUST)
Create a table per surface (public / portal / admin / partner) listing:
- Screen name
- IA location (menu path)
- Priority (P0/P1/P2)
- Expanded? (Yes/No)
- Expanded primary data object (do-*)
- Supporting objects (do-*, comma-separated)
- Key relations to realize (do-* → do-*; cardinality)

2) Expanded-node realization plan (MUST)
For each screen marked Expanded=Yes, write a short blueprint:
- Primary data object (expanded-metadata-N.dataObjectId)
- At least TWO “relation” grid cells that point to supporting objects:
  - dataObjectId: related do-*
  - relationKind: "relation"
  - relationCardinality: "one" | "oneToMany"
- UI structure type:
  - tabs / wizard / sideNav / dropdown / collapsible / list / content / text / button / filter / navOut
- “What user does here” (1–2 lines)
- “What data is created/updated/read” (link to object + attributes)

3) Minimum coverage gate (MUST)
- For each main-canvas #flow# process root, identify its transaction object (do-T).
- There MUST be at least one expanded screen where:
  - primary = do-T, and
  - ≥2 relation grid cells point to supporting objects.

4) Worked examples (copy/paste snippets; keep short) (SHOULD)
Include 2–3 tiny examples of grid node patterns:
- A tabs layout (uiTabs with items)
- A wizard layout (uiTabs used as steps)
- A collapsible layout (uiSections)

Do NOT attempt to generate the full Diregram markdown here.
This is an optional “put aside first” parking lot used when you cannot reliably generate all expanded grids yet.
`;

