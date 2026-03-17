// Shared, server-safe diagram prompt constants used by API routes and clients.
export const AI_PROMPT = `You are generating a SINGLE markdown document for the Diregram app.

This app’s “source of truth” is markdown text, but not everything is expressed as line syntax:
- The TREE is expressed by indentation (2 spaces per level) and a few inline markers.
- Advanced editors (expanded UI grids, process flows, swimlanes, tags store, data objects, etc.) are stored as fenced JSON blocks below a '---' separator.

You asked the AI to generate as much structured data as possible, including JSON metadata blocks. Do NOT omit sections just because they are advanced.
If something is unknown, generate a best-effort placeholder that is still valid JSON and still follows the linking rules.

===============================================================================
SECTION 0 — HARD RULES (do not break these)
===============================================================================
- Output ONE markdown document.
- Use UNIX newlines (\\n).
- Use EXACTLY 2 spaces per indentation level. Never use tabs.
- **The TREE is NOT “Markdown formatting”.** Node lines are plain lines.
  - Do NOT use markdown headings in the tree area (no "#", "##", "###").
  - Do NOT use markdown lists in the tree area (no leading "-", "*", "1.").
  - Do NOT use markdown emphasis/links expecting rendering — the app will treat it as literal text.
  - If you accidentally output headings/bullets, Diregram will interpret them as node titles and your structure will be wrong.
- Below the "---" separator you MAY use headings/sections as normal documentation text (this area is not part of the node tree).
- Fenced code blocks below '---' must be valid JSON.
  You requested “generate everything”, so do NOT omit metadata blocks; instead generate minimal valid JSON using safe defaults, and keep all links consistent.

===============================================================================
SECTION 1 — HOW NODES ARE PARSED (core tree)
===============================================================================
- Each non-empty line OUTSIDE fenced code blocks becomes a node.
- Parent/child relationships are determined ONLY by indentation.
- A single file MAY contain multiple top-level roots (multiple indentation-0 nodes). There is NO structural requirement to have exactly one root.
  - Recommendation (not required): use one product root for coherence, but multiple roots are allowed (e.g. multiple separate diagrams in one file).
- IDs: Diregram currently generates node ids from the ORIGINAL markdown line index:
  node-0, node-1, node-2, ...
  This means IDs can change if lines are inserted/removed above.
  Some advanced metadata (swimlane placement, process-node-type) references node ids directly, so those are FRAGILE.

Example:
Root
  Child A
  Child B
    Grandchild

===============================================================================
SECTION 1.5 — NODE INTENT (FOCUS PER NODE; do not mix levels)
===============================================================================
Every node line must have a clear intent. Use the RIGHT editor/diagram for the RIGHT content.
- Before you finalize ANY layer, run an artifact-type fit check:
  - IA nodes should read like places in navigation (portal / section / screen / page / function), not prose journeys.
  - #flow# nodes should read like actions, decisions, waits, or outcomes.
  - Expanded-grid nodes should read like UI components/content blocks and match their uiType.
  - Data objects should read like durable domain entities, attributes, and relationships.
  - Conditional hubs should read like stable state/timeframe variants, not steps.
  - Tech Flow boxes should read like systems/modules/services, not screens or user tasks.
- If a label sounds like the wrong artifact, rename it or move it before continuing.
  - Example: "user can click confirm" is behavior prose and must be normalized into the correct artifact:
    - IA: "Order review" / "Confirmation"
    - Expanded UI button: "Confirm"
    - #flow# step: "Confirm order"
    - Data object: never use this as an object name

1) Main Canvas “normal” nodes (NO #flow#, NO #flowtab#):
- Purpose: Sitemap / information architecture.
- Structure: main navigation → sub-navigation → screens → screen content → functions.
- Multiple portals/surfaces rule (MUST):
  - If the product has multiple portals/surfaces (e.g. public site, self-service portal, operations/admin portal, partner/vendor portal), you MUST represent EACH portal as its OWN top-level IA root (indentation level 0).
  - Do NOT nest multiple portals under a single parent IA node (it breaks filtering/tagging and makes mixed-surface navigation ambiguous).
- End state: leaf nodes often become “functions” (capabilities). A function can THEN be modeled as a process flow by adding #flow# when you need step-by-step behavior.
- Do NOT put step-by-step user journeys here unless the node is marked #flow#.

2) Process nodes (#flow#) in the main canvas:
- Purpose: Business flow / user journey (what the user/system does, in order).
- Structure: parent→child nesting for linear sequences; sibling children for branching/validation splits.
- Linear-chain rule (CRITICAL MUST):
  - If step B happens after step A with no decision/split, step B MUST be a child of step A, not a sibling of step A.
  - Sibling children are reserved for true alternate outcomes/branches only.
- “Type” is NOT in the node line. If you need “validation” vs “branch” vs “step/action/time/end/goto”, you MUST encode it in metadata blocks (see process-node-type-* below).
- UI-grounding rule (MUST):
  - Non-swimlane #flow# steps MUST be anchored to concrete UI and/or observable system actions.
  - MUST NOT encode actors in node titles (NO "<actor>:" prefixes such as "System:" or "Admissions Admin:"). Actors must be machine-checkable via tags/swimlanes.
  - AVOID purely conceptual chapter headings in non-swimlane flows (e.g. "Awareness", "Consideration", "Engagement") — those belong in Flow tab swimlanes and/or lifecycle hubs.
  - Exception (allowed conceptual nodes): decision/guard checks and routing constructs:
    - validation/branch questions (e.g. "Eligible?", "Payment successful?")
    - time/wait states (e.g. "Queued for review")
    - goto/loop/redirect steps (e.g. "Retry payment" / "Return to upload step")
- Session/timeframe scope (MUST):
  - A single non-swimlane #flow# process must represent ONE coherent session/timeframe (one sitting / one work session).
  - If the journey crosses time (days/weeks), async waiting, or handoffs across roles/system, you MUST split it using Flowtab swimlanes (journey/handoffs), lifecycle hubs (Status/Phase dimensions), and/or separate session-scoped #flow# roots linked by lifecycle states.

3) Flow tab journey nodes (#flowtab# root + its children):
- Purpose: HIGH-level journey map. Each node is a major step/handoff/phase, not micro-UI details.
- The detailed step-by-step behavior belongs in #flow# process nodes and/or flow-node-N graphs.

4) Swimlane (flow tab) lanes + stages:
- Semantics: lane/stage changes indicate a change of “party” or “session”.
  Examples: switching system, switching actor roles, waiting states, async processing, or a required condition before continuing.
- Use swimlanes to make handoffs and waiting/conditions visible at a glance.
  - Actor lane coverage (MUST):
    - If the journey involves multiple actors/system/partners, EACH must have its own swimlane lane (one lane per actor/system).
    - Do NOT combine different actors into one lane (it hides handoffs and makes the journey non-auditable).

5) Expanded nodes (<!-- expid:N --> + expanded-grid-N):
- Purpose: Screen/UI blueprint and content layout (what’s on the screen, components, states).
- Do NOT use expanded grids to “describe the business journey”; use #flow# for that.

6) Data objects:
- Purpose: Domain entities (fields, relationships, constraints), referenced by nodes/screens/flows when relevant.

===============================================================================
SECTION 2 — HUBS + VARIANTS (conditional siblings)
===============================================================================
Hubs are created automatically; you do not write “hub syntax”.

Conditions syntax:
Title (key=value, key2=value2)

Hub formation rule:
- If multiple sibling node lines have EXACTLY the same title text AND at least one of them has conditions, the app will treat them as ONE hub with multiple variants.

Avoid ambiguous hubs:
- Do NOT mix conditioned and non-conditioned siblings with the same title.
- If you need a default variant, make it explicit: (variant=default) or (status=any).

Variant selection:
- Actors choose condition key/values in the UI; the app selects the matching variant.
- If nothing is selected, the first variant acts as default.

GOOD:
Order (status=draft)
Order (status=submitted)
Order (status=approved)

BAD:
Order
Order (status=draft)

===============================================================================
SECTION 3 — GENERIC TOOLS: TAGS + ANNOTATIONS
===============================================================================
TAGS
- Syntax on a node line:
  <!-- tags:tag-1,tag-2 -->
- Tags are IDs (not names). If you invent new tag IDs, define them in a tag-store block (see metadata schemas below).
- Tagging is NOT implied. It is explicit and mandatory for key node types (MUST):
  - Every #flow# node line MUST include a <!-- tags:... --> comment with EXACTLY ONE actor tag from group tg-actors.
  - Actor tags in tg-actors MUST be app-specific and use ids shaped like actor-<role-slug>.
  - Do NOT default to a fixed actor list such as applicant/staff/system/partner unless those are genuinely the right roles for this product.
  - Across tg-actors, include at least one concrete actor tag for each coverage class:
    - self-service or external user role
    - operational/admin role handling work, approvals, cases, or content
    - platform/back-office/system role handling configuration, integrations, or automation
  - These are coverage classes only. Do NOT literally emit umbrella tags unless they are the actual product terms.
  - Every IA screen node with <!-- expid:N --> MUST include a ui-surface tag from group tg-uiSurface (choose exactly one):
    - ui-surface-public, ui-surface-portal, ui-surface-admin, ui-surface-partner
  - DO NOT encode actors in titles; actors belong in tags + Flowtab swimlane lanes.
  - All tags referenced in <!-- tags:... --> MUST exist in the \`\`\`tag-store\`\`\` tags[] list.

PINNED TAGS (UI display; optional but recommended when used)
- Pinned tags are a VIEW feature: only pinned tags that are ALSO on the node are shown above the node.
- Ordering: displayed chips follow the pinned-tag order (first 3 chips, then "+x" for the rest; hover reveals all).
- Storage:
  - Global pinned tags (main canvas): stored in a \`\`\`pinned-tags\`\`\` JSON block below '---':
    { "tagIds": ["tag-1", "tag-2"] }
  - Flowtab swimlane pinned tags (per flow): stored per flow in \`\`\`flowtab-swimlane-<fid>\`\`\` as:
    { "pinnedTagIds": ["tag-1", "tag-2"] }

ANNOTATIONS (freeform)
- Syntax on a node line:
  <!-- ann:URL_ENCODED_TEXT -->
- Encoding rules:
  - Write newlines as literal \\n first
  - Then URL-encode the whole annotation string
- Use annotations for behavior that cannot be expressed by structure:
  - validations, branching rules, edge cases, and user-facing behavior notes.

===============================================================================
SECTION 4 — FLOW CONCEPTS (there are 3; do not mix)
===============================================================================
4.1 Process / UI flow (process nodes in Canvas and Flow tab)
--------------------------------
How to mark a process node in the TREE:
- Add #flow# to the node line:
  Checkout #flow#

What #flow# does:
- Enables “process-flow mode” features:
  - process node types (step/single_screen_steps/time/loop/action/validation/branch/end/goto)
  - connector labels
  - goto shortcuts
  - and a detailed flow graph editor (stored in metadata blocks)

What to focus on (WIZARD / multi-step UX):
- Use process flows to draw wizard-like experiences: multi-step UI journeys with validations, branching, and clear start/end.
- Model each step as a flow graph node (in \`\`\`flow-node-N\`\`\` -> nodes[]).
- Use "validation" or "branch" nodes for decision points.
- Put the decision meaning into edge labels (human language), e.g. "Eligible", "Not eligible", "Missing required fields".
- Use "goto" nodes for shortcuts like "Edit previous step" or "Jump to summary" after changes.
- Linear-chain analysis (MUST):
  - Default sequential steps to parent→child→grandchild nesting.
  - Do NOT flatten sequential “next step” actions into sibling lists.
  - Sibling children are only correct when the parent is a real validation/branch split with alternate outcomes.
- Non-swimlane flow realism (MUST):
  - Each step should correspond to a SCREEN or an explicit system action that a user/admin can observe.
  - If a step cannot be tied to UI or an observable system event, it is probably too conceptual — move it to a Flow tab swimlane stage/label instead.
  - Screen-boundary analysis is REQUIRED:
    - For every adjacent next/previous step, decide whether the user is still on the SAME underlying screen context.
    - If multiple tasks still happen under one screen, group that contiguous range using "single_screen_steps" instead of pretending each task is a new screen.
    - This grouping matters for graph/RAG semantics because those tasks should resolve to one shared screen context.

Single Screen Steps (group tasks under ONE screen; process flows only):
- Treat this as a required analysis pass for non-swimlane #flow# trees, not an optional cleanup.
- Use when multiple steps are realistically completed on the SAME underlying screen context before moving on.
- Heuristics:
  - Repeatable tasks before moving to the next step (e.g. add/edit multiple items, review multiple sections).
  - Pattern: main screen → open overlay → back → open another overlay → back (same base screen).
  - High review density: lots of content the user must review in one place before proceeding.
- Workflow:
  1) Generate the process flow first.
  2) Run the post-generation “Single Screen Steps” checklist.
  3) In Diregram UI: set the start node’s \`\`\`process-node-type-N\`\`\` to "single_screen_steps", then pick its “Last step” (writes \`\`\`process-single-screen-N\`\`\`).

IMPORTANT LIMITATION:
- There is currently NO supported line-text syntax to set the process node type (like "#validation#").
  Types are stored in fenced JSON blocks keyed by a running number (see metadata).
  - CRITICAL LINKING RULE (MUST; easy to miss):
    - \`\`\`process-node-type-N\`\`\` is keyed by N (a running number). It does NOT “attach” to nodeId by itself.
    - Therefore, for EVERY \`\`\`process-node-type-N\`\`\` block you create, you MUST also have a matching \`\`\`flow-nodes\`\`\` entry with runningNumber N that points to the SAME #flow# node (lineIndex/content/parentPath).
    - If this linkage is missing or mismatched, the UI will fall back to the default type ("step") and your “validation” will NOT render as a diamond.
  - If you model a split in the tree (2+ sibling children) you should ALSO set an appropriate type:
    - "validation" when the split is a check/guard (valid vs invalid, eligible vs ineligible).
    - "branch" when the split is a choice/path selection (multiple user/system routes).
    - Otherwise default to "step" / "action" / "time" / "end" as appropriate.

4.2 Conditional / lifecycle flow (hubs + dimensions)
--------------------------------
Purpose:
- Model lifecycle/state logic per dimension key (e.g. Status lifecycle: draft → submitted → approved).
- The TREE defines the possible values as Hub variants using (key=value).
- Lifecycle/state meaning must be expressed directly via the hub/variant structure and/or annotations.
- Do NOT generate \`<!-- desc:... -->\` anchors or \`\`\`dimension-descriptions\`\`\` blocks.

4.3 Flow tab business journey swimlane
--------------------------------
Purpose:
- This is the HIGH-LEVEL user journey map (business flow), not an integration/API spec.
- Use it to show major phases across lanes (roles) and stages (phases/columns).
- Pair it with:
  - process flows (#flow# + flow-node-N) for detailed step-by-step wizard behavior
  - expanded grids (expanded-grid-N) for concrete screen/UI layout
How to mark a Flow tab root node in the TREE:
- Add #flowtab# and a stable fid:
  Onboarding Journey #flowtab# <!-- fid:flowtab-1 -->

What fid does:
- Links the flow tab root to its swimlane metadata block: \`\`\`flowtab-swimlane-flowtab-1\`\`\`

CRITICAL LIMITATION:
- Swimlane placement is stored as placement[nodeId] where nodeId is currently "node-<lineIndex>".
  This is fragile if you edit the markdown above those nodes.
  You asked AI to generate EVERYTHING, so the AI MUST compute correct node ids and keep markdown stable.

Swimlane intent reminder:
- Lanes/stages should reflect party/session boundaries (different system, different actors/roles, waiting/async, condition gates).
  If nothing changes, do NOT move nodes just to “fill the grid”.
- If the journey involves multiple actors/system/partners, EACH must have its own lane (one lane per actor/system). Do NOT combine actors in one lane.
- Required swimlane format coverage (MUST; at least one for each generated format):
  - Include at least one cross-system flow (handoff between different systems/apps).
  - Include at least one cross-actor flow (handoff between different actors/roles).
  - Include at least one multi-touchpoint flow (switching touchpoints such as web/mobile/app/offline).
  - For physical real-world touchpoint steps, add:
    <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
    and DO NOT link that node in \`\`\`flowtab-process-references\`\`\`.
- Non-linearity reminder (MUST):
  - Do NOT force the Flow tab journey to look like a guaranteed smooth linear path.
  - If the underlying process has meaningful alternates/outcomes, represent them as branches at a high level:
    - Use sibling children under a decision node (not a single nested chain).
    - Label each parent→child edge in \`\`\`flow-connector-labels\`\`\` with conditional language (IF/ELSE), not "Next/Continue".

WORKED EXAMPLE (Flow tab swimlane):

Onboarding Journey #flowtab# <!-- fid:flowtab-1 -->
  Discover product
  Sign up
  Verify email
  First login
---
\`\`\`flowtab-swimlane-flowtab-1
{
  "fid": "flowtab-1",
  "lanes": [
    { "id": "branch-1", "label": "Visitor" },
    { "id": "branch-2", "label": "System" }
  ],
  "stages": [
    { "id": "stage-1", "label": "Awareness" },
    { "id": "stage-2", "label": "Activation" }
  ],
  "placement": {
    "node-0": { "laneId": "branch-1", "stage": 0 },
    "node-1": { "laneId": "branch-1", "stage": 0 },
    "node-2": { "laneId": "branch-1", "stage": 0 },
    "node-3": { "laneId": "branch-2", "stage": 1 },
    "node-4": { "laneId": "branch-1", "stage": 1 }
  }
}
\`\`\`

IMPORTANT:
- node ids are derived from markdown line index; if you add/remove lines above, update placement keys.

4.4 Tech Flow tab (system/integration layout)
--------------------------------
Purpose:
- A grid-based “tech flow” workspace for integration/system-level diagrams.
- Similar left navigation as Flow tab, but the right side is a full-screen grid editor (not the main canvas engine).

When MUST you use Tech Flow? (technical diagrams)
- If the intent is a technical diagram like:
  - sequence diagram
  - use case diagram
  - architecture diagram
  - integration diagram
  - system context diagram
  - service interactions / message flows
  then you MUST model it as a **Tech Flow** (not the main canvas nodes, and not Flowtab swimlanes).

How to mark a Tech Flow root node in the TREE:
- Add #systemflow# and a stable sfid:
  Payments Pipeline #systemflow# <!-- sfid:systemflow-1 -->

How Tech Flow layout is persisted (NON-NODE markdown sectioning):
- All Tech Flow editor data is stored below '---' in a fenced code block:
  \`\`\`systemflow-systemflow-1
  { ... JSON ... }
  \`\`\`
- CRITICAL: keep boxes/zones/links inside the fenced block so it is NOT interpreted as normal nodes.

Modeling workflow (2 passes) (MUST; matches how teams actually work)
1) Architecture / system context (first pass):
- Start from the system architecture diagram (high-level boxes + groupings).
- MUST include at least ONE architecture Tech Flow diagram in the document.
- This architecture diagram is the merge target for multiple sequences (see below).
- Reuse the SAME actors/portals/surfaces you already defined in IA:
  - self-service portal / operations portal / partner portal / public site
  - shared common modules (design system, auth, notifications, file store, analytics)
- Group the diagram using zones[] (preferred):
  - Zone for each portal/surface
  - Zone for shared platform modules
  - Zone for external systems/partners
- Keep the first pass mostly about ownership boundaries and module grouping (not message order).

2) Sequence / interaction flow (second pass):
- Rule (MUST): 1 sequence diagram = 1 Tech Flow root (treat it like a “swimlane document” for that scenario).
  - Create a new #systemflow# root for EACH integration scenario (Payments auth, Identity verify, File upload pipeline, etc.).
  - Do NOT cram multiple unrelated sequences into one systemflow; it becomes unreadable and un-auditable.
- After the architecture is grouped, add message links between modules for the sequence diagram.
- Represent modules as skinny tall rectangles (lifeline-like):
  - set gridWidth small (e.g. 2–3)
  - set gridHeight tall (e.g. 6–12)
  - arrange them left-to-right across the grid
- Use links[] to represent messages:
  - order: number (1,2,3…) for sequence order
  - text: label for the message (verb + payload), e.g. "Create PaymentIntent", "POST /verify", "Emit event"
  - dashStyle:"dashed" for async/background work
  - endShape:"arrow" for calls, endShape:"circle"/"square" for events/queues if helpful
  - points[] may be used for bend points (optional; the editor can auto-route)

Merging sequences onto architecture (MUST guidance):
- Keep the architecture systemflow as the canonical module inventory + grouping (zones).
- For each sequence systemflow, reuse the same module names (and ideally the same dataObjectId links) as the architecture diagram.
- Optional: On the architecture diagram, add a small set of high-level links annotated with the sequence id/name (e.g. "S1 Authorize", "S2 Refund") rather than copying every step.

Schema (v1):
{
  "version": 1,
  "gridWidth": 24,
  "gridHeight": 24,
  "boxes": [
    { "key": "sfbox-1", "name": "API Gateway", "icon": "🧭", "dataObjectId": "do-1", "gridX": 0, "gridY": 0, "gridWidth": 3, "gridHeight": 2 }
  ],
  "zones": [
    { "id": "sfzone-1", "name": "Payments", "boxKeys": ["sfbox-1"] }
  ],
  "links": [
    { "id": "sflink-1", "fromKey": "sfbox-1", "toKey": "sfbox-2", "fromSide": "right", "toSide": "left", "order": 1, "text": "Authorize" }
  ]
}

===============================================================================
SECTION 5 — EXPANDED NODES (UI CONSTRUCTION / SCREEN MODELING)
===============================================================================
What is an “expanded node”?
- Any node can be expanded in the UI to open an Expanded Grid editor.
- The Expanded Grid is used to design UI screens/components as a grid layout: cards for list/buttons/tabs/navOut/etc.

What is it for?
- Expanded nodes are the UI-construction layer: screen layout, navigation affordances, components.
- The Expanded Grid is a grid-based layout that helps the IA focus on real UI navigation (buttons, lists, tabs, navOut, etc.).

How expanded content is persisted (anchor + 3 blocks):
- On the node line, you may see:
  <!-- expid:N -->       = stable expanded id (anchors expanded UI content)
  <!-- expanded:N -->    = currently expanded (UI state hint)
- Below '---', expanded content is stored in:
  - \`\`\`expanded-states\`\`\` (registry)
  - \`\`\`expanded-grid-N\`\`\` (grid nodes / UI components)
  - \`\`\`expanded-metadata-N\`\`\` (layout sizing)

WORKED EXAMPLE (Expanded UI screen, end-to-end):

Checkout Screen #flow# <!-- expid:1 -->
---
\`\`\`expanded-states
{
  "nextRunningNumber": 2,
  "entries": [
    { "runningNumber": 1, "content": "Checkout Screen", "parentPath": [], "lineIndex": 0 }
  ]
}
\`\`\`
\`\`\`expanded-metadata-1
{ "width": 4, "height": 4, "gridWidth": 6, "gridHeight": 4, "dataObjectId": "do-1" }
\`\`\`
\`\`\`expanded-grid-1
[
  { "key": "grid-1-1", "content": "Cart items", "uiType": "list", "dataObjectId": "do-1", "relationKind": "attribute", "relationCardinality": "one", "gridX": 0, "gridY": 0, "gridWidth": 4, "gridHeight": 2 },
  { "key": "grid-1-2", "content": "Apply promo", "uiType": "button", "gridX": 4, "gridY": 0, "gridWidth": 2, "gridHeight": 1 },
  { "key": "grid-1-3", "content": "Continue to review", "uiType": "button", "gridX": 4, "gridY": 1, "gridWidth": 2, "gridHeight": 1 }
]
\`\`\`

Meaning of relationKind/cardinality (modeling guidance):
- relationKind=attribute: component represents fields of the SAME data object (e.g. Order.total).
- relationKind=relation: component represents a RELATED object (e.g. Order has many OrderItems).
- relationKind=none: purely UI component.
- relationCardinality:
  - one: single record
  - oneToMany: list
  - manyToMany: join

===============================================================================
SECTION 6 — DATA OBJECTS (shared domain model)
===============================================================================
What are data objects (be precise)?
- A global “main data model” / entity store.
- Data objects can be linked from:
  - node lines (<!-- do:do-1 -->)
  - node lines with specific attribute selections (<!-- doattrs:__objectName__,attr-1,attr-2 -->; requires do:)
  - expanded-grid nodes ("dataObjectId": "do-1")
  - expanded-grid nodes with attribute selections ("dataObjectAttributeIds": ["__objectName__", "attr-1"])
  - expanded-metadata-N with attribute selections ("dataObjectAttributeIds": ["__objectName__", "attr-1"])
- They are stored in \`\`\`data-objects\`\`\` JSON.
- The "data" field is flexible; this prompt recommends a consistent structure (fields + relations) so AI output is useful.

WORKED EXAMPLE (data-objects with fields + relations):

Root
  Order Details #flow# <!-- do:do-1 --> <!-- expid:2 -->
---
\`\`\`data-objects
{
  "nextId": 3,
  "objects": [
    {
      "id": "do-1",
      "name": "Order",
      "annotation": "Primary checkout entity",
      "data": {
        "fields": [
          { "name": "id", "type": "string" },
          { "name": "status", "type": "string" },
          { "name": "total", "type": "money" }
        ],
        "attributes": [
          { "id": "attr-1", "name": "status", "sample": "pending" },
          { "id": "attr-2", "name": "total", "sample": "99.00" }
        ],
        "relations": [
          { "name": "customer", "to": "do-2", "cardinality": "one" },
          { "name": "items", "to": "do-3", "cardinality": "oneToMany" }
        ]
      }
    },
    { "id": "do-2", "name": "Customer", "annotation": "", "data": { "fields": [{ "name": "id", "type": "string" }] } }
  ]
}
\`\`\`

Link a node line to a data object:
- Append:
  <!-- do:do-1 -->

Link a node line to specific attributes of its linked object:
- Append (same line as do:):
  <!-- doattrs:__objectName__,attr-1,attr-2 -->

Link an expanded grid node to a data object:
- In expanded-grid JSON, set:
  "dataObjectId": "do-1"

Link an expanded grid node to specific attributes of its linked object:
- In expanded-grid JSON, set:
  "dataObjectAttributeIds": ["__objectName__", "attr-1", "attr-2"]

===============================================================================
SECTION 7 — REQUIRED IDS / RUNNING NUMBERS (AI MUST GENERATE AND KEEP CONSISTENT)
===============================================================================
You asked the AI to generate EVERYTHING (tree + JSON). Therefore:
- You MUST generate anchors + metadata blocks together.
- You MUST keep all running numbers unique and correctly linked.

Inline comment anchors:
- <!-- rn:N -->       = comment anchor for Figma-style comments (unique)
  Used by: Comments system (stable targetKey is n:N).
- <!-- expid:N -->    = expanded UI anchor (unique)
  Must match: \`\`\`expanded-states\`\`\` entry runningNumber N, plus blocks \`\`\`expanded-grid-N\`\`\` and \`\`\`expanded-metadata-N\`\`\`.
- <!-- expanded:N --> = optional UI-state marker (unique). If present, it should match an expid N.
- <!-- hubnote:N -->  = hub notes anchor (unique)
  Must match: \`\`\`conditional-hub-notes\`\`\` entry runningNumber N.
  Recommended: use the SAME N for hubnote:N and expid:N on that hub line.
- (REMOVED) Dimension description anchors (\`<!-- desc:... -->\`) are not used. Do not generate them.

===============================================================================
SECTION 8 — '---' SEPARATOR + METADATA BLOCK SCHEMAS (advanced)
===============================================================================
Prefer including:
---
Everything BELOW is metadata. Each block is a fenced code block whose first line is its type.

All metadata MUST be valid JSON.

8.1 tag-store
Type: \`\`\`tag-store\`\`\`
Purpose:
- Defines the global tag vocabulary (tag groups + tag ids).
- Enables validation/highlighting/filtering in the Tag UI.
Used by:
- Tag manager + tag view UI.
Links to:
- Node lines via: <!-- tags:tag-1,tag-2 -->
Schema:
{
  "nextGroupId": 1,
  "nextTagId": 1,
  "groups": [
    { "id": "tg-ungrouped", "name": "ungrouped", "order": 0 },
    { "id": "tg-systems", "name": "system", "order": 1 },
    { "id": "tg-uiType", "name": "ui type", "order": 2 },
    { "id": "tg-actors", "name": "actors", "order": 3 },
    { "id": "tg-uiSurface", "name": "ui surface", "order": 4 }
  ],
  "tags": [
    { "id": "tag-ui-form", "groupId": "tg-uiType", "name": "form" },
    { "id": "actor-domain-role", "groupId": "tg-actors", "name": "domain role" },
    { "id": "ui-surface-public", "groupId": "tg-uiSurface", "name": "public" }
  ]
}

8.2 data-objects
Type: \`\`\`data-objects\`\`\`
Purpose:
- Defines the shared domain/entity store (Order, User, Payment…).
Used by:
- Data Objects tab (entity list), plus node linking + expanded UI linking.
Links to:
- Node lines via: <!-- do:do-1 -->
- Expanded grid nodes via: "dataObjectId": "do-1"
Schema:
{
  "nextId": 2,
  "objects": [
    { "id": "do-1", "name": "Order", "annotation": "optional", "data": { } }
  ]
}

8.3 expanded-states
Type: \`\`\`expanded-states\`\`\`
Purpose:
- Registry of which nodes have expanded UI history, keyed by a stable running number.
- This is what ties a node line to its \`\`\`expanded-grid-N\`\`\` and \`\`\`expanded-metadata-N\`\`\`.
Used by:
- Expanded node system (expanded grid + expanded metadata).
Links to:
- Node line comment: <!-- expid:N --> (stable expanded id on that node line)
- Node line comment: <!-- expanded:N --> (optional, marks currently expanded)
- Blocks: \`\`\`expanded-grid-N\`\`\`, \`\`\`expanded-metadata-N\`\`\`
Schema:
{
  "nextRunningNumber": 2,
  "entries": [
    { "runningNumber": 1, "content": "Screen A", "parentPath": ["Root"], "lineIndex": 10 }
  ]
}

8.4 expanded-grid-N
Type: \`\`\`expanded-grid-1\`\`\` (N = expid)
Purpose:
- Stores the Expanded Grid UI layout for an expanded node (screen modeling / UI construction).
Used by:
- Expanded Grid editor (what users see when expanding a node).
Links to:
- The node line must have <!-- expid:N --> so the app can find the right N.
Related:
- \`\`\`expanded-metadata-N\`\`\` controls grid size/dimensions.
Schema: JSON array of grid nodes:
[
  {
    "key": "grid-1-1",
    "content": "Search box",
    "icon": "🔎",
    "color": "slate",
    "uiType": "content|list|button|navOut|filter|tabs|wizard|sideNav|dropdown|collapsible|text",
    "dataObjectId": "do-1",
    "dataObjectAttributeIds": ["__objectName__", "attr-1"],
    "dataObjectAttributeMode": "data|input",
    "relationKind": "attribute|relation|none",
    "relationCardinality": "one|oneToMany|manyToMany",
    "textVariant": "h1|h2|h3|h4|h5|h6|normal|small",
    "textAlign": "left|center|right",
    "uiTabs": [
      {
        "id": "tab-1",
        "label": "Details",
        "icon": "ℹ️",
        "dataObjectId": "do-1",
        "dataObjectAttributeIds": ["__objectName__", "attr-1"],
        "dataObjectAttributeMode": "data|input",
        "items": [
          {
            "id": "item-1",
            "label": "Order number",
            "icon": "#",
            "dataObjectId": "do-1",
            "dataObjectAttributeIds": ["attr-1"],
            "dataObjectAttributeMode": "data|input"
          }
        ]
      }
    ],
    "uiSections": [
      {
        "id": "section-1",
        "label": "Advanced",
        "icon": "⚙️",
        "collapsedByDefault": false,
        "dataObjectId": "do-1",
        "dataObjectAttributeIds": ["attr-1"],
        "dataObjectAttributeMode": "data|input",
        "items": [
          { "id": "item-1", "label": "Audit log", "icon": "🧾", "dataObjectId": "do-2" }
        ]
      }
    ],
    "gridX": 0, "gridY": 0, "gridWidth": 2, "gridHeight": 1
  }
]

8.5 expanded-metadata-N
Type: \`\`\`expanded-metadata-1\`\`\`
Purpose:
- Controls the expanded node’s layout sizing (gridWidth/gridHeight, etc.).
Used by:
- Expanded node rendering and grid editor sizing.
Links to:
- Same N as <!-- expid:N --> and \`\`\`expanded-grid-N\`\`\`
Schema:
{ "width": 4, "height": 4, "gridWidth": 4, "gridHeight": 4, "dataObjectId": "do-1" }

8.6 flow-nodes (registry of #flow# nodes that have flow graphs)
Type: \`\`\`flow-nodes\`\`\`
Purpose:
- Registry mapping process nodes (#flow#) to a stable running number N for their flow graph.
Used by:
- Process flow editor (DimensionFlowEditor payload persistence).
Links to:
- Each entry’s runningNumber N links to \`\`\`flow-node-N\`\`\`.
- Entries match to a #flow# node by content + parentPath + lineIndex.
Schema:
{
  "nextRunningNumber": 2,
  "entries": [
    { "runningNumber": 1, "content": "Checkout", "parentPath": ["Root"], "lineIndex": 4 }
  ]
}

8.7 flow-node-N (the actual flow graph for a #flow# node)
Type: \`\`\`flow-node-1\`\`\`
Purpose:
- The actual UI/process flow graph (nodes + edges) for the process node whose runningNumber is N.
Used by:
- Process flow editor UI.
Links to:
- N must exist in \`\`\`flow-nodes\`\`\` entries.
Related:
- Line/connector text has two places it can live:
  - **Inside this flow graph**: \`\`\`flow-node-N\`\`\` -> \`edges["from__to"].label\` (labels shown in the flow editor).
  - **On the main canvas**: \`\`\`flow-connector-labels\`\`\` (labels shown on canvas connectors between two process nodes).
Schema:
{
  "nodes": [
    { "id": "flow-1", "label": "Enter details", "type": "step", "branchId": "branch-1" },
    { "id": "flow-2", "label": "Validate", "type": "validation", "branchId": "branch-1" },
    { "id": "flow-3", "label": "Done", "type": "end", "branchId": "branch-1" }
  ],
  "edges": {
    "flow-1__flow-2": { "label": "", "color": "#0f172a" },
    "flow-2__flow-3": { "label": "ok", "color": "#16a34a" }
  }
}

Flow graph node types:
- step, time, action, validation, branch, goto, end
Edge key format:
- "\${fromId}__\${toId}"

8.7a flow-connector-labels (canvas connector labels between two process nodes)
Type: \`\`\`flow-connector-labels\`\`\`
Purpose:
- Stores the label text + color for a connector between two nodes on the **main canvas** / **Flow tab canvas** when process-flow mode is enabled.
Used by:
- Canvas connector label editor.
Key format:
- "\${fromNodeId}__\${toNodeId}" where node ids are parsed ids (currently "node-<lineIndex>").
Fragility:
- Node ids are line-index based and can change if you reformat/move lines in markdown.
Schema:
{
  "node-12__node-34": { "label": "Valid", "color": "#0f172a" },
  "node-34__node-56": { "label": "Next", "color": "#0f172a" }
}

8.8 process-node-type-N (canvas-level rendering type for a #flow# node)
Type: \`\`\`process-node-type-1\`\`\` (N is the running number for that process node)
Purpose:
- Sets how a #flow# node renders on the main canvas / flow canvas (diamond for validation/branch, etc.).
Used by:
- Process node rendering on canvas (process-flow mode).
Links to:
- N is the process running number used for that #flow# node (from \`\`\`flow-nodes\`\`\`).
- MUST: A matching \`\`\`flow-nodes\`\`\` entry with runningNumber N MUST exist.
- NOTE: nodeId is a parsed node id (currently "node-<lineIndex>") and is inherently fragile under inserts/deletes above a node.
Fragility:
- If you include nodeId, it can break after reformatting; prefer relying on the runningNumber linkage.
Schema:
{ "type": "validation|branch|goto|end|step|single_screen_steps|time|loop|action", "nodeId"?: "node-12" }

8.8a process-single-screen-N (Single Screen Steps endpoint)
Type: \`\`\`process-single-screen-1\`\`\`
Purpose:
- Stores the end of the grouped range for a start node typed "single_screen_steps".
Used by:
- Canvas process-flow UI (Single Screen Steps grouping).
Links to:
- N is the process running number for the START node (from \`\`\`flow-nodes\`\`\`).
- lastStepRunningNumber is the process running number for the END node (from \`\`\`flow-nodes\`\`\`).
Schema:
{ "lastStepRunningNumber": 12 }

8.9 process-goto-N (canvas-level shortcut target)
Type: \`\`\`process-goto-1\`\`\`
Purpose:
- Stores a shortcut/jump target for a process node (canvas-level goto behavior).
Used by:
- Process-flow mode UI (goto configuration).
Links to:
- N is the process running number for the source node.
- targetId is a parsed node id (currently "node-<lineIndex>") and MUST exist.
Fragility:
- targetId can change if markdown lines shift.
Schema:
{ "targetId": "node-34" }

8.10 flowtab-swimlane-FID
Type: \`\`\`flowtab-swimlane-flowtab-1\`\`\`
Purpose:
- Stores the Flow tab swimlane configuration for a Flow tab root (lanes, stages, and placement).
Used by:
- Flow tab swimlane UI (lanes/stages headers + which node is in which cell).
Links to:
- The Flow tab root node line must include: <!-- fid:flowtab-1 -->
Fragility:
- placement keys are node ids (currently "node-<lineIndex>") and will break if ids change.
Schema:
{
  "fid": "flowtab-1",
  "lanes": [{ "id": "branch-1", "label": "Customer" }],
  "stages": [{ "id": "stage-1", "label": "Discover" }],
  "placement": {
    "node-12": { "laneId": "branch-1", "stage": 0 }
  }
}
WARNING: placement keys are node ids (node-<lineIndex>) and are fragile under edits.

8.12 conditional-hub-notes
Type: \`\`\`conditional-hub-notes\`\`\`
Purpose:
- Stores "dependencies" + "impact" notes for a Hub (helpful lifecycle documentation).
Used by:
- Hub notes UI on hubs (Logic/notes panels).
Links to:
- Hub node line comment: <!-- hubnote:N -->
- Also ensures the hub line has <!-- expid:N --> for long-term stability.
Schema:
{
  "nextRunningNumber": 2,
  "entries": [
    { "runningNumber": 1, "content": "Order", "parentPath": ["Root"], "lineIndex": 10, "dependencies": "...", "impact": "..." }
  ]
}

8.13 nexus-flows + nexus-flow-*
Types:
- \`\`\`nexus-flows\`\`\` (index)
- \`\`\`nexus-flow-flowdoc-1\`\`\` (a stored flow doc)
Purpose:
- Stores standalone “flow documents” (swimlane-like journey flows) independent of the tree.
Used by:
- Currently not wired into the visible UI in this repo build (storage exists for future/experimental use).
Links to:
- No direct linking to node lines; it is its own index + documents.
Schemas:
\`\`\`nexus-flows\`\`\`
{ "nextId": 2, "flows": [{ "id": "flowdoc-1", "name": "Checkout Journey", "createdAt": 123 }] }
\`\`\`nexus-flow-flowdoc-1\`\`\`
{ "id": "flowdoc-1", "name": "Checkout Journey", "lanes": [], "stages": [], "nodes": [], "edges": {}, "branches": [] }

8.14 flowtab-process-references
Type: \`\`\`flowtab-process-references\`\`\`
Purpose:
- Lets Flow tab nodes reference process nodes from the main canvas.
  - kind "whole": “this Flow tab step represents the whole process root”
  - kind "inner": “this Flow tab step represents a specific node inside a process”
Used by:
- Flow tab reference picker + reference indicator UI.
How it interacts with expanded UI:
- For kind "inner", the app will ensure the target process node is expanded (expid exists),
  then it will insert a LOCKED expanded-grid node into \`\`\`expanded-grid-N\`\`\` with:
  - key: flowref-N-<flowNodeId>
  - sourceFlowNodeId: <flowNodeId>
  This is how Flow tab can “project” an inner step into the expanded UI.
Links to:
- Map key: the Flow tab node id (node-<lineIndex>) for the flowtab root tree.
- rootProcessNodeId / targetNodeId: node ids of main canvas process nodes (node-<lineIndex>).
- expandedRunningNumber: expid/runningNumber of the expanded target.
- gridNodeKey: key of the inserted expanded-grid node.
Fragility:
- Depends heavily on node ids; breaks easily if markdown lines shift.
Schema:
{
  "node-12": { "kind": "whole", "rootProcessNodeId": "node-3", "targetNodeId": "node-3" },
  "node-13": { "kind": "inner", "rootProcessNodeId": "node-3", "targetNodeId": "node-9", "expandedRunningNumber": 1, "gridNodeKey": "flowref-1-node-13" }
}

===============================================================================
OUTPUT REQUIREMENTS (repeat)
===============================================================================
- Output ONE markdown document.
- 2-space indentation only.
- Prefer clean tree + #flow# + #flowtab# markers.
- Omit metadata unless you can keep all references consistent.

Now generate the markdown for the requested structure.`;

// Add-on prompt text (append-only; does not replace the base prompt).
export const AI_PROMPT_ADDON = `===============================================================================
PROMPT ADD-ON — FLOW + SWIMLANE + REGISTRY RELIABILITY (append to base prompt)
===============================================================================

Generate a complete Diregram markdown document for [PLATFORM_NAME].

===============================================================================
QUALITY PLAYBOOK (NON-NEGOTIABLE; add-only guidance)
===============================================================================
Core principle: Diregram is a multi-model document. Import-ready is not enough; it must be conceptually correct.
Your output combines distinct modeling layers — DO NOT blur them:
- Main canvas tree (non-#flow#, non-#flowtab#) = sitemap / navigation / information architecture (IA)
- Process flows (#flow#) = step-by-step behavior (decisions, validations, outcomes)
- Flow tab swimlanes (#flowtab# + flowtab-swimlane-*) = high-level journey / handoff view(s)
- Expanded nodes (<!-- expid:N --> + expanded-grid-N) = screen composition (what’s on the page)
- Conditional hubs ((Key=value) variants) = lifecycle / timeframe / state-based variants
- Data objects (data-objects) = domain entities + relationships, wired into screens/features

MUST DO (strict rules)
1) Keep navigation separate from step-by-step flow:
- If a user can click it in a menu: it’s a navigation/page node (usually non-#flow#).
- If it reads “then the user does X, then Y”: it’s a process node (#flow#).

1.5) Non-swimlane process flow realism (MUST):
- Non-swimlane #flow# steps MUST be UI-grounded (screens, user actions, or observable system actions).
- AVOID purely conceptual chapter headings as #flow# steps (e.g. "Awareness", "Research", "Consideration").
  - Those belong in Flow tab swimlanes (stages/chapters), not in main-canvas process steps.
- Allowed exceptions for conceptual wording in #flow#:
  - validation/branch questions (Eligible? Payment successful?)
  - time/wait states (Queued for review)
  - goto/loop/redirect steps (Retry / Return to previous step)

2) Model linear vs branching correctly:
- Linear sequences MUST be nested chains (parent → child → grandchild).
- Branching MUST be sibling children under the split node.

3) Every branching #flow# node MUST be typed AND labeled:
- If a #flow# node has 2+ direct children, you MUST:
  - set a process-node-type-* metadata block for that nodeId:
    - type "validation" for pass/fail checks
    - type "branch" for multi-path choice
  - add flow-connector-labels for EACH parent→child edge:
    - labels explain WHY the path is taken
    - success path color: #16a34a, error path color: #dc2626

4) Use conditional hubs for timeframe/lifecycle (NOT fake linear “waiting” steps):
- If time passes, async processing occurs, or availability depends on state, prefer:
  - hub variants like Thing (Status=draft), Thing (Status=submitted), ...
  - optional hub notes (if needed): <!-- hubnote:N --> + conditional-hub-notes block

5) Expanded nodes must be real screen composition (not prose):
- For each <!-- expid:N --> you MUST include:
  - expanded-states entry
  - expanded-metadata-N
  - expanded-grid-N
- Expanded grids should encode UI components and bind to data objects via dataObjectId where relevant.
- If you cannot reliably generate all expanded grids yet:
  - Put the expanded-node list aside first in a separate “parking lot” file (screen list + primary objects + relations),
  - Then finish expanded grids in a second pass using the Expanded Nodes checklist (coverage + link realization).

6) Data objects must be connected to the tree AND to screens:
- Add <!-- do:do-X --> anchors on key feature/page nodes to show which entity they operate on.
- Bind entities inside expanded-grid inner nodes using dataObjectId (screens can bind multiple entities).
- Do NOT leave orphan data objects (objects with no references).

6.5) Addendum — Data Objects UI Realization (MUST; prevents “modeled but invisible” objects)
Domain model is the source of truth (MUST):
- MUST define every entity in the block as an entry under data-objects.objects[].
- MUST define relationships using objects[].data.relations[] objects with:
  - name: relation name (string)
  - to: target data object id (e.g. "do-4")
  - cardinality: "one" | "oneToMany" | "manyToMany" | ...
- SHOULD model key relationships bidirectionally (preferred for analysis), e.g.:
  - AdmissionsApplication (do-2) -> payments (do-4)
  - Payment (do-4) -> application (do-2)

IA anchoring makes objects “eligible” in UI (MUST):
Some UI views/pickers only include objects that appear in IA. To avoid “invisible” objects:
- MUST include at least one IA anchor for every do-*:
  - Add <!-- do:do-X --> on the most relevant IA node line (screen/feature/flow/section).
- MUST anchor “secondary” objects too (common miss), e.g. verification/session/audit/interface payloads.
- Recommended placement:
  - Transaction objects: anchor on the process flow root and the primary IA feature/screen node.
  - Supporting objects: anchor on the screen/feature where users interact with it (Login for sessions, Upload for documents, Payment page for payments).

UI “Linked objects” is often driven by Expanded Screens (MUST for important relations):
Even if data-objects.relations is correct, the UI may only display “linked objects” when relationships are realized in expanded screens.
- MUST ensure each important transaction object has at least one expanded screen that:
  - sets expanded-metadata-N.dataObjectId to the primary object for that screen
  - includes expanded-grid-N cells referencing related objects using:
Required grid cell pattern (for link realization):
  - dataObjectId: related object id (e.g. "do-4")
  - relationKind: "relation"
  - relationCardinality: "one" or "oneToMany" (as appropriate)
Minimum coverage rule (MUST):
- For each transaction object (per main-canvas flow root), there MUST be at least one expanded screen where:
  - primary = that transaction object, AND
  - ≥ 2 grid cells use relationKind:"relation" pointing to supporting objects.

Primary-object sanity rules (MUST; prevents UI self-links):
- MUST set expanded-metadata-N.dataObjectId to match the conceptual focus:
  - Account dashboard / landing → ApplicantAccount (do-1)
  - Application wizard / application summary → AdmissionsApplication (do-2)
  - Payment screen → Payment (do-4)
- SHOULD NOT make a dashboard primary = a transaction object if the dashboard also lists that same object (self-link artifacts).

7) Maintain registry + node-id integrity (fragility):
- Node ids are node-<lineIndex> (0-based). If you insert/remove lines above referenced nodes, you MUST reindex ALL dependent registries and references:
  - expanded-states lineIndex
  - flow-nodes lineIndex + parentPath
  - process-node-type-* (nodeId match)
  - flow-connector-labels keys
  - flowtab-swimlane-* placement keys
  - hub registries (conditional-hub-notes) lineIndex
If you cannot guarantee correct reindexing, do NOT make structural edits.

TO AVOID (hard don’ts)
- Do NOT model “waiting” as a navigation node. Use lifecycle hubs or tracking/timeline content instead.
- Do NOT duplicate the same feature in two places (avoid “second sitemap” inside hub variants).
- Do NOT put operator-only workflows under self-service navigation; separate by role and tag appropriately.
- Do NOT leave orphan data objects.

Practical debug workflow (self-correct):
- Generate the tree first (stable line ordering).
- Add anchors (expid/fid/do/desc/hubnote) ONLY when you will also generate the matching blocks.
- Do NOT generate legacy conditional-hub desc anchors.
- Generate metadata blocks after '---'.
- Verify: JSON validity, connector validity (parent→child only), and orphan data object detection.
- If you edit the tree: immediately recompute ALL lineIndex/node-id based references.

===============================================================================
COMPLETENESS (AIM FOR COMPLETENESS; DO NOT SHRINK TO “PASS VALIDATION”)
===============================================================================
You MUST aim for completeness across ALL modeling layers. Imports can succeed while the model is conceptually incomplete.

Scope + counting rules (for completeness metrics)
MUST count (main canvas):
- IA/navigation nodes (sections → screens → screen content → functions)
- #flow# process ROOTS only (the parent/root node that represents a process), NOT their step children
MUST NOT count:
- data object registries (\`\`\`data-objects\`\`\` JSON, etc.)
- swimlane metadata blocks (\`\`\`flowtab-swimlane-*\`\`\`)
- #flow# step children (when measuring number of flows)

Layering rules (to prevent “shrinking to pass”)
- MUST keep the main canvas non-#flow# area as IA only (navigation/screens/content/functions).
- AVOID encoding step-by-step journeys in non-#flow# nodes.
- MUST encode step-by-step behavior ONLY under #flow# process nodes.

Expanded UI rules (expid registry integrity)
- MUST ensure every <!-- expid:N --> is globally unique and appears on exactly ONE tree line.
- MUST ensure each expid:N has:
  - an expanded-states entry with runningNumber: N
  - matching \`\`\`expanded-metadata-N\`\`\`
  - matching \`\`\`expanded-grid-N\`\`\`
- MUST ensure expanded-states.entries[].content matches the node title EXACTLY (importer is strict).
- AVOID duplicating the same screen concept twice with different expid to represent variants; instead merge to one canonical screen and represent variation via flows/hubs.

Data object completeness rules (flow-root-driven)
For EACH counted #flow# process root:
- MUST have exactly ONE transaction object (durable “thing moving through the flow”: Order, Case, Request, Application, etc.).
- MUST have supporting objects for step-produced artifacts (PaymentIntent, Document, Message, VerificationSession, EligibilityCheck, AuditEvent, etc.).
- MUST wire objects to the experience:
  - Primary object: anchor it with <!-- do:... --> on the process root and/or key screen nodes.
  - Secondary objects: MUST be referenced via additional screen nodes and/or expanded-grid nodes with dataObjectId.
- MUST NOT leave orphan objects in \`\`\`data-objects\`\`\` (each must be referenced by tree anchors and/or expanded grids).

Swimlane rules (must match process flows; can group multiple processes)
0) Required swimlane format coverage (MUST; at least one for each generated format):
- MUST include at least one cross-system flow (handoff between different systems/apps).
- MUST include at least one cross-actor flow (handoff between different actors/roles).
- MUST include at least one multi-touchpoint flow (switching touchpoints such as web/mobile/app/offline).
- For physical real-world touchpoint steps, MUST annotate:
  <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
- Physical real-world touchpoint steps MUST NOT be linked in \`\`\`flowtab-process-references\`\`\`.
1) Swimlane is a journey map, NOT a duplicate process spec:
- MUST use Flowtab swimlanes to show major phases/handoffs (actors, async waiting, system boundaries).
- AVOID putting micro-steps in Flowtab that belong inside a #flow# process graph.
1.5) Swimlane non-linearity (MUST):
- Do NOT force the journey to look like a smooth guaranteed linear happy path.
- If the underlying process has meaningful alternates/outcomes, represent them as branches at a high level:
  - Use sibling children under a decision/handoff node.
  - Use conditional connector labels (IF/ELSE language) on the Flowtab parent→child edges.
  - Avoid generic "Next/Continue/Proceed" labels for branch edges.
2) Swimlane steps MUST be linked to process flows (no implicit matching by name):
- MUST maintain a \`\`\`flowtab-process-references\`\`\` block mapping each Flowtab node that represents in-app/system process behavior (node-<lineIndex>) to:
  - kind "whole": rootProcessNodeId + targetNodeId = a process root nodeId
  - kind "inner": points to a specific nodeId inside a process
- EXCEPTION: nodes annotated with <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> --> are intentionally real-world touchpoints and MUST NOT have reference entries.
- MUST ensure referenced rootProcessNodeId / targetNodeId exist and node-<lineIndex> ids are correct.
2.5) Swimlane coverage (MUST; completeness requirement):
- For EACH counted #flow# process root, MUST have coverage in Flowtab:
  - MUST exist ≥1 entry in \`\`\`flowtab-process-references\`\`\` with kind:"whole" referencing that process root, OR
  - MUST explicitly mark that process root as out-of-scope for the journey map WITH a reason.
    - Use a supported annotation on the process root line:
      <!-- ann:OOS_JOURNEY%3A%20<reason> -->
    - AVOID leaving missing coverage implicit (it will be interpreted as incomplete).
3) One Flowtab CAN reference multiple process roots across its steps:
- MUST allow different steps to reference different process roots.
- MUST keep Flowtab at “chapter” level; AVOID duplicating full internal steps of each process inside Flowtab.
4) Swimlane blocks don’t support connectors:
- MUST express handoff meaning using \`\`\`flow-connector-labels\`\`\` on Flowtab parent→child edges (direct parent→child only).
- AVOID cross-tree connector labels.

Minimum-count rules (MUST; completeness guardrails)
- If the document contains ANY counted #flow# process roots (P > 0), MUST have at least ONE journey map (J ≥ 1).
- AVOID using “no journey map” unless you explicitly mark ALL process roots as out-of-scope using OOS_JOURNEY annotations.

IA vs non-IA strictness (clarity)
- MUST keep IA nodes as navigable items (sections/screens/menu items/functions).
- AVOID placing step-by-step “then do X” narratives in IA; put that only under #flow# nodes.
- MUST put detailed screen composition/content in expanded grids (expanded-grid-N), not as long child lists under a screen node.

Data object logic + declaration (MUST)
- For EACH counted #flow# process root:
  - MUST declare EXACTLY ONE transaction object using a single <!-- do:do-X --> anchor on the process root line.
  - AVOID multiple do: anchors on the same process root (it becomes ambiguous).
- MUST ensure data-objects are logically coherent (not just wired):
  - relations/cardinality should reflect what screens/flows create/update/read.
  - include consistent baseline fields (id, createdAt, updatedAt, status where applicable).
  - AVOID barebone objects that cannot support the screens/flows you defined.

Merge/link rules when validation fails (don’t shrink):
- When validation fails (duplicate expid, mismatched expanded-states, broken nodeIds), MUST resolve by merging duplicate concepts into a canonical node and re-linking flows/swimlane references to that node.
- MUST recompute ALL dependent registries after any tree edits (expanded-states, flow-nodes, process-node-type, flow-connector-labels, flowtab-swimlane placement, flowtab-process-references, hub registries).
- AVOID deleting screens/flows to satisfy validation unless product scope is intentionally reduced.

Optional completeness target (you MAY set explicit targets in your generation request):
- MUST generate at least:
  - S main-canvas screens with expid (each with expanded grid + primary object binding)
  - P #flow# process roots (each with 1 transaction object + ≥2 supporting objects wired)
  - J flowtab swimlane journeys, where each in-app/system step references a process (\`\`\`flowtab-process-references\`\`\`), physical real-world touchpoint steps are marked OFFLINE_PHYSICAL_STEP and unlinked, and each Flowtab edge has a connector label

CRITICAL REQUIREMENTS:
1) Tree Structure:
- Use #flow# for ALL process nodes (including flowtab roots AND their children).
- Use #flow# #flowtab# together for journey map roots.
- Branching: Use sibling children for validation splits (success/error paths at same level).
- Linear: Use nested children for sequential flows (parent→child→grandchild).
- Mark expanded nodes with <!-- expid:N -->.
- Mark flowtabs with <!-- fid:flowtab-N -->.

2) Flow Connector Labels (flow-connector-labels):
- ONLY label parent→child connectors that exist in the tree.
- NO cross-section connectors (e.g. node-8__node-23 won't work unless node-23 is a direct child of node-8).
- Label branches clearly: "Valid inputs" vs "Invalid inputs".
- Use color coding: green (#16a34a) for success, red (#dc2626) for errors.

3) Flow Node Graphs (flow-node-N):
- Fork branches MUST have forkSourceId on FIRST node of the new branch.
- Different branchId for each branch (branch-1, branch-error, etc.).
- Sequential nodes share same branchId.
- Goto nodes for returns (labels won't render but structure is still required).

4) Swimlanes (flowtab-swimlane-*):
- DO NOT include a "connectors" field (not implemented in the UI).
- Use lanes, stages, placement only.
- Placement uses actual node ids (currently node-<lineIndex>, fragile).
- Use lanes/stages to represent party/session boundaries (different users/roles, different systems, waiting/async, condition gates).

5) Line Indices:
- ALL registries use 0-indexed line numbers.
- cat -n shows 1-indexed, subtract 1.
- Re-verify ALL indices after ANY tree structure changes.

6) Complete Metadata Blocks Required:
- tag-store
- data-objects
- expanded-states (registry)
- expanded-metadata-N + expanded-grid-N (for each expid:N)
- flow-nodes (registry)
- flow-node-N (for each entry in flow-nodes that needs a graph)
- flow-connector-labels (parent→child only)
- flowtab-swimlane-FID (for each flowtab)
- conditional-hub-notes (if using hubs)

FOCUS AREAS:
☑ Normal (non-#flow#) nodes are sitemap/IA: navigation → screens → content → functions.
☑ #flow# nodes are business flow/user journey steps (not sitemap).
☑ If a #flow# node branches (2+ sibling children), set process-node-type to "validation" or "branch".
☑ Every #flow# child needs the #flow# marker.
☑ Branching = sibling children, Linear = nested children.
☑ flow-connector-labels = only parent→child edges.
☑ Fork branches = forkSourceId on FIRST node of branch.
☑ Line indices = 0-based, verify with cat -n.
☑ No "connectors" in swimlanes.`;

// Pre-generation checklist (meant to be part of the copied AI prompt).
export const PRE_GENERATION_CHECKLIST = `===============================================================================
PRE-GENERATION CHECKLIST (run mentally BEFORE outputting markdown)
===============================================================================

☐ Tree formatting:
  - EXACTLY 2 spaces per indentation level (no tabs).
  - No markdown headings/lists in the tree (no "#", "-", "*", "1.").

☐ Flow tagging:
  - Every process step line includes #flow# (including flowtab roots AND all children steps).
  - Every Flow tab root includes BOTH #flow# #flowtab# and has <!-- fid:flowtab-N -->.

☐ Completeness target (set BEFORE you write):
  - Pick explicit targets for the generation:
    - S = number of main-canvas screens that will have <!-- expid:N --> (each must have expanded-grid-N + expanded-metadata-N + primary data-object binding)
    - P = number of #flow# process ROOTS (parent roots only; do NOT count their step children)
    - J = number of #flowtab# journey roots (each must have swimlane metadata + references)
  - Use these targets to prevent “shrinking to pass validation”.
  - If P > 0, MUST set J ≥ 1 (unless ALL process roots are explicitly marked out-of-scope with OOS_JOURNEY annotations).

☐ Focus per node (diagram correctness):
  - Normal (non-#flow#, non-#flowtab#) nodes are sitemap/IA: navigation → screens → content → functions.
  - #flow# nodes describe business flow/user journey (step-by-step behavior).
  - Expanded nodes (<!-- expid:N -->) describe screen/UI layout (expanded-grid-N), not the business journey.
  - Flowtab swimlanes use lanes/stages to indicate party/session boundaries (different system/user, waiting/async, condition gates).
  - Data objects represent domain entities (fields/relationships), referenced from screens/flows as needed.

☐ Artifact-type reevaluation (run after each layer you draft):
  - IA labels MUST still read like portals/sections/screens/pages/functions someone can navigate to.
  - #flow# labels MUST still read like concrete actions/decisions/outcomes, not pages or components.
  - Expanded-grid labels MUST still match the uiType:
    - buttons/nav items = clickable labels like "Confirm" / "Back to orders"
    - text = headings/helper copy
    - lists/sections/tabs = grouped UI content labels
  - Data object / attribute / relation names MUST still read like durable business data, not screen text or instructions.
  - If something fails this test, rename it or move it BEFORE final output.

☐ Flow structure correctness:
  - Linear journeys are nested chains (parent→child→grandchild), not flat sibling lists.
  - Validation/branching splits are modeled as sibling children under the split node.
  - If a #flow# node has 2+ sibling children (a split), ensure it has a process-node-type-* metadata block set to "validation" or "branch".
  - Avoid accidental branching: do NOT place “next step” siblings under a step that isn’t actually a decision/validation.
  - Linear-chain audit:
    - For every set of sibling #flow# nodes, ask whether they are true alternate outcomes or just the next sequential steps.
    - If they are sequential, rewrite them into a nested parent→child→grandchild chain before final output.
  - Non-swimlane #flow# UI-grounding:
    - Step titles should reference screens/actions, not abstract phases.
    - Allowed conceptual exceptions: validation/branch questions, time/wait, goto/loop/redirect.
  - Single-screen boundary audit:
    - For every adjacent next/previous step, decide whether it is still the SAME underlying screen context.
    - If several tasks remain on one screen, plan a "single_screen_steps" start node and the matching grouped end step.
    - Do not over-split one screen into fake separate screens; graph/RAG should be able to read them as one screen context.

☐ Separator + metadata placement:
  - A single '---' separator exists.
  - ALL fenced JSON blocks are placed AFTER '---' (never inside the tree region).

☐ Swimlane constraints:
  - Each flowtab has a matching \`\`\`flowtab-swimlane-{fid}\`\`\` block.
  - Swimlane blocks contain lanes/stages/placement only (NO "connectors" field).
  - Required format coverage:
    - Include at least one cross-system flow, one cross-actor flow, and one multi-touchpoint flow.
    - Physical real-world touchpoint steps MUST use:
      <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
      and MUST NOT be linked in \`\`\`flowtab-process-references\`\`\`.
  - Swimlane non-linearity:
    - If there are meaningful alternate outcomes (fail/retry/reject/RFI), represent them as high-level branches (sibling children) OR explicitly mark omitted paths with:
      <!-- ann:OOS_PATH%3A%20<reason> -->

☐ Connector label constraints:
  - \`\`\`flow-connector-labels\`\`\` contains ONLY parent→child edges that exist in the tree.
  - No cross-section / non-tree edges.

☐ Registries + lineIndex sanity:
  - All registries use 0-based lineIndex values.
  - After writing the tree, recompute every registry entry’s lineIndex to match final line positions.

☐ Required blocks completeness:
  - tag-store, data-objects
  - expanded-states + expanded-metadata-N + expanded-grid-N for every <!-- expid:N -->
  - flow-nodes + flow-node-N for every referenced runningNumber
  - flow-connector-labels
  - flowtab-swimlane-{fid} for each flowtab
  - conditional-hub-notes ONLY if hubnote anchors appear in the tree

☐ Domain modeling wiring (non-negotiable):
  - Every data object in \`\`\`data-objects\`\`\` is referenced by at least one:
    - tree anchor <!-- do:do-X --> on a relevant feature/page node, OR
    - expanded-grid inner node field dataObjectId
  - Do NOT output orphan data objects (objects with zero references).
  - For EACH counted #flow# process root:
    - MUST have exactly ONE transaction object (durable “thing moving through the flow”).
    - MUST have ≥2 supporting objects for artifacts produced/used by steps.
    - MUST wire: primary object via <!-- do:... --> on the root and/or key screens; secondary objects via screen nodes and/or expanded-grid dataObjectId.
    - MUST declare the transaction object with EXACTLY ONE <!-- do:do-X --> on the process root line (avoid multiple do anchors).

☐ Timeframe vs navigation discipline:
  - Do NOT model “waiting/async/time passing” as navigation nodes.
  - Prefer conditional hubs (Status=..., Phase=..., etc.) + hub notes/annotations for lifecycle/timeframe modeling.
  - Avoid duplicating the same feature in two places (“second sitemap” inside hub variants).`;

// Separate copyable checklist for post-generation QA.
export const POST_GENERATION_VERIFICATION_CHECKLIST = `Post-Generation Verification Checklist

0) Diagram / Content Placement Sanity (focus per node)
☐ Normal (non-#flow#, non-#flowtab#) nodes:
  → Reads like sitemap/IA (navigation → screens → content → functions), NOT step-by-step journeys

☐ #flow# nodes:
  → Reads like business flow/user journey steps (actions, validations, decisions, outcomes)

☐ Expanded nodes (<!-- expid:N -->):
  → Contains screen/UI blueprint content (components, states, layout), not business-journey prose

☐ Swimlanes:
  → Lane/stage changes match party/session boundaries (different systems/users, waiting/async, condition gates)

☐ Data objects:
  → Entities/fields/relationships live in data-objects, referenced by screens/flows where needed

0.5) Completeness Metrics (counting rules; do NOT shrink to pass)
☐ MUST count (main canvas):
  → IA/navigation nodes (sections → screens → screen content → functions)
  → #flow# process ROOTS only (parents), NOT their step children
☐ MUST NOT count:
  → data/registry JSON blocks (e.g., \`\`\`data-objects\`\`\`)
  → swimlane metadata blocks (\`\`\`flowtab-swimlane-*\`\`\`)
  → #flow# step children (when measuring number of flows)
☐ Report your counts and compare to targets:
  → S = # of main-canvas screens with <!-- expid:N -->
  → P = # of #flow# process roots
  → J = # of #flowtab# journey roots
  → If counts are low, expand scope by adding missing screens/flows/objects — do NOT delete existing parts to “pass”.
☐ Minimum-count gate:
  → If P > 0, MUST have J ≥ 1 (unless ALL process roots are explicitly marked OOS_JOURNEY with reasons)

1) Tree Structure Validation
☐ Run: grep -c "#flow#" [file]
  → Should match total count of process nodes expected

☐ Run: grep "#flowtab#" [file]
  → Verify each flowtab root has BOTH #flow# #flowtab#

☐ Check branching structure visually:
  → Validation nodes should have 2+ sibling children
  → Linear flows should be nested (parent→child→grandchild)
☐ Linear sibling misuse check (MUST):
  → If a #flow# node has multiple direct children, verify they are true alternate paths rather than sequential next steps
  → If the children are sequential, rewrite them as a nested chain and remove the fake branch

☐ Verify all flowtab children are marked #flow#
☐ For each #flow# node that branches (2+ sibling children):
  → Verify there is a matching \`\`\`process-node-type-*\`\`\` block setting type to "validation" or "branch" for that node (by nodeId)
  → Verify there is a \`\`\`flow-connector-labels\`\`\` entry for EACH parent→child branch edge
  → Verify branch labels explain WHY the path is taken; green #16a34a for success, red #dc2626 for errors
☐ Single-screen boundary check (MUST for non-swimlane #flow#):
  → For each adjacent next/previous step range, verify whether the user is still on the SAME underlying screen context
  → If several tasks still belong to one screen, group them as Single Screen Steps instead of separate screens
  → When grouped, verify \`\`\`process-node-type-N\`\`\` = "single_screen_steps" on the start node and \`\`\`process-single-screen-N\`\`\` points to the last in-screen step
  → This grouping is important for graph/RAG so in-screen tasks map to one shared screen context

☐ Swimlane meaning check:
  → Lane/stage placement reflects party/session boundaries (different users/roles, different systems, waiting/async, condition gates)
  → If nothing changes between two steps, do NOT force a lane/stage change just to “fill the grid”
☐ Required swimlane format coverage check (MUST):
  → Include at least one cross-system flow, one cross-actor flow, and one multi-touchpoint flow.
  → Physical real-world touchpoint steps MUST use: <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
  → Physical real-world touchpoint steps MUST NOT have \`\`\`flowtab-process-references\`\`\` entries.
☐ Swimlane non-linearity check (MUST):
  → Do NOT make the journey look like a guaranteed smooth linear happy path.
  → If the process can diverge (fail/retry/reject/RFI/alternate methods), the Flowtab MUST:
    - represent a high-level branch (sibling children), OR
    - explicitly mark the omitted path with: <!-- ann:OOS_PATH%3A%20<reason> -->
  → Connector labels on Flowtab edges MUST be conditional (IF/ELSE), not "Next/Continue/Proceed".
☐ Swimlane-to-process linking (no implicit name matching):
  → If swimlane steps are intended to map to process flows, verify \`\`\`flowtab-process-references\`\`\` exists
  → Each Flowtab step node (node-<lineIndex>) has an entry of kind whole/inner, EXCEPT physical touchpoint steps marked with:
    <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
  → rootProcessNodeId / targetNodeId exist and are correct node-<lineIndex> ids
☐ Swimlane coverage gate (MUST; completeness):
  → For EACH counted #flow# process root:
    - MUST be referenced by ≥1 flowtab-process-references entry with kind:"whole", OR
    - MUST be explicitly marked out-of-scope on the process root line using: <!-- ann:OOS_JOURNEY%3A%20<reason> -->
  → AVOID implicit gaps (missing coverage without a reason).

2) Registry Line Index Verification
☐ Run: cat -n [file] | grep "<!-- expid:"
  → Get actual 1-indexed lines, subtract 1
  → Compare against expanded-states lineIndex values
☐ expid uniqueness + strict content match:
  → Each expid:N appears on EXACTLY one tree line (no duplicates)
  → expanded-states has runningNumber:N
  → expanded-metadata-N and expanded-grid-N exist
  → expanded-states.entries[].content matches the node title EXACTLY

☐ Run: cat -n [file] | grep "#flow# <!--"
  → Verify flow-nodes registry line indices match

☐ Check conditional-hub-notes line indices
  → Must match nodes with <!-- hubnote: --> anchors

3) Flow Connector Labels Validation
☐ For each entry "node-X__node-Y" in flow-connector-labels:
  → Verify node-Y is a DIRECT CHILD of node-X in tree
  → Run: cat -n [file] | sed -n 'Xp' and sed -n 'Yp'
  → Check indentation: Y should be indented MORE than X

☐ Check for invalid cross-section connectors
  → No connectors between nodes in different sections

☐ Verify branch labels:
  → Success paths use green color (#16a34a)
  → Error paths use red color (#dc2626)

4) Flow Node Graph Structure
☐ For each validation/branching node:
  → Find all branches (different branchId values)
  → Verify FIRST node in each branch has forkSourceId
  → Example: branch-error's first node should have forkSourceId pointing to validation node

☐ Check edge labels in flow-node-N blocks:
  → Format: "flow-X__flow-Y": { "label": "...", "color": "..." }
  → Labels explain WHY the branch is taken

☐ Verify goto nodes:
  → type: "goto"
  → gotoTargetId points to valid node
  → Note: Labels won't render for goto (known limitation)

5) Swimlane Configuration
☐ Check each flowtab-swimlane-* block:
  → Has fid field matching flowtab id
  → Has lanes array (actors/roles)
  → Has stages array (journey phases)
  → Has placement object
  → Does NOT have "connectors" field

☐ Verify placement references:
  → Each "node-N" key should match actual line index

6) Expanded Grids Verification
☐ Count expanded-grid-N blocks:
  → Should equal number of <!-- expid:N --> anchors in tree

☐ Verify each expanded-metadata-N exists:
  → One for each expanded-grid-N

☐ Check grid structure:
  → gridX, gridY, gridWidth, gridHeight all present
  → No overlapping grid positions

7) Hub System (if applicable)
☐ Conditional hub notes:
  → Each hub has <!-- hubnote:N --> anchor
  → conditional-hub-notes registry has entry
  → lineIndex matches actual hub node

8) Final Import Test
☐ Import into Diregram app
  → Check validation report for errors/warnings

9) Data Object Coverage + Orphan Detection
☐ For each do-* in \`\`\`data-objects\`\`\`:
  → Verify it is referenced by at least one:
    - tree anchor <!-- do:do-X -->, OR
    - expanded-grid inner node dataObjectId
  → If a data object is never referenced, REMOVE IT (or add the missing references).
☐ Flow-root-driven domain completeness:
  → For EACH counted #flow# process root:
    - Exactly ONE transaction object exists (Order/Case/Request/Application/etc.) and is wired via <!-- do:... --> on the root and/or key screens
    - ≥2 supporting objects exist (PaymentIntent/Document/Message/VerificationSession/EligibilityCheck/AuditEvent/etc.) and are wired via anchors and/or expanded-grid dataObjectId
    - MUST prove which object is the transaction object:
      - The process root line MUST contain exactly ONE <!-- do:do-X --> anchor (the transaction object)
      - AVOID multiple do anchors on the same process root

11) Domain Logic Review (conceptual correctness; not just structure)
☐ Data object logic:
  → Relations/cardinality in \`\`\`data-objects\`\`\` MUST reflect what screens/flows create/update/read
  → Objects MUST include baseline fields consistently (id, createdAt, updatedAt; status enum where applicable)
  → Any object with status MUST have defined states/transitions (dimension descriptions or equivalent), OR MUST be explicitly marked out-of-scope with a reason
☐ Flow↔screen reachability:
  → Each #flow# process root MUST be reachable from at least one IA screen (expid or navigation screen node)
  → AVOID “floating” flows with no screen entry point

10) Anti-duplication sanity
☐ Check you did NOT model the same feature twice:
  → Portal/sections/pages exist once in navigation (main canvas normal nodes)
  → Lifecycle hubs/variants define state meaning + enablement, not a second sitemap of actions

☐ Common issues to check:
  → EXPANDED_ENTRY_CONTENT_MISMATCH = wrong line index
  → FLOW_NODE_ENTRY_NOT_FLOW = missing #flow# marker
  → UNCLOSED_CODE_BLOCK = missing closing backticks
  → MISSING_DIM_DESC_BLOCK = prose section header mismatch

☐ Visual verification in UI:
  → Connector labels appear on parent→child edges
  → Branching shows fork with labeled paths
  → Swimlanes display nodes in correct lanes/stages
  → Flow tab shows journey progression`;

// Split/structured version of the post-generation checklist.
// This keeps ALL existing rules, but reorganizes them so reviewers can run it in passes:
//  - A) Technical markdown correctness
//  - B) IA correctness (main canvas non-#flow#)
//  - C) Swimlane correctness + coverage
//  - D) Data objects correctness (logical + wired)
//  - E) Completeness summary
export const POST_GENERATION_VERIFICATION_CHECKLIST_SPLIT = `Post-Generation Verification Checklist (Split)

A) Technical Markdown Correctness (structural; must be import-ready)
☐ Indentation:
  → EXACTLY 2 spaces per level, no tabs
  → No indentation jumps > 1 level at a time

☐ Separator + fences:
  → Exactly one '---' separator exists
  → No fenced code blocks appear above '---' (tree region)
  → All fenced blocks below '---' are strict JSON
  → No UNCLOSED_CODE_BLOCK errors (closing backticks exist)

☐ Registry integrity (lineIndex/node-id based):
  → Node ids are node-<lineIndex> (0-based) and are FRAGILE under edits
  → If the tree changed, ALL registries must be recomputed (expanded-states, flow-nodes, process-node-type, connector labels, swimlane placement, flowtab refs, hub registries)

☐ Expanded UI (strict):
  → Each <!-- expid:N --> appears on EXACTLY one tree line (no duplicates)
  → expanded-states has runningNumber:N
  → expanded-metadata-N exists
  → expanded-grid-N exists
  → expanded-states.entries[].content matches the node title EXACTLY

☐ Tags + actor tagging (MUST; machine-checkable semantics):
  → If the markdown uses <!-- tags:... --> ANYWHERE, it MUST include exactly one \`\`\`tag-store\`\`\` block
  → All tag IDs used in <!-- tags:... --> MUST exist in tag-store.tags[] (unknown tag IDs = FAIL)
  → tag-store MUST include required groups:
    - tg-actors (actors)
    - tg-uiSurface (ui surface) IF the markdown uses any <!-- expid:N -->
  → tg-actors MUST be app-specific:
    - Use ids shaped like actor-<role-slug>
    - Do NOT default to applicant/staff/system/partner unless those are the true product roles
    - Include at least one concrete actor tag for each coverage class: self-service/external user, operational/admin, platform/back-office/system
  → Actor prefixes MUST NOT appear in node titles:
    - FAIL if a node title starts with an actor prefix such as "System:" or "Admissions Admin:"
  → Every #flow# node line MUST include <!-- tags:... --> and EXACTLY ONE actor tag from tg-actors
  → Every screen node with <!-- expid:N --> MUST include at least one ui-surface tag from tg-uiSurface (prefer exactly one)

☐ Connector label validity:
  → Every key "node-X__node-Y" in \`\`\`flow-connector-labels\`\`\` is a DIRECT parent→child edge in the tree
  → No cross-section / non-tree edges

☐ Process splits (strict):
  → For each branching #flow# node (2+ direct children):
    - MUST have \`\`\`process-node-type-*\`\`\` type validation|branch (by nodeId)
    - MUST have \`\`\`flow-connector-labels\`\`\` entries for EACH branch edge
    - Branch labels explain WHY; green #16a34a for success, red #dc2626 for errors

☐ Process node type linkage (MUST; prevents “validation not rendering”):
  → If ANY \`\`\`process-node-type-N\`\`\` blocks exist, a \`\`\`flow-nodes\`\`\` registry MUST exist
  → For EACH \`\`\`process-node-type-N\`\`\` block:
    - \`\`\`flow-nodes\`\`\` MUST contain an entry with runningNumber N
    - That entry’s lineIndex MUST point to the SAME nodeId referenced by the process-node-type block
  → If this mapping is missing/mismatched, the UI will fall back to default type ("step") and diamonds will not appear

☐ Linear-chain structure (CRITICAL MUST):
  → Sequential next steps MUST appear as parent→child→grandchild, not as sibling children under one parent
  → If a node has 2+ direct #flow# children, they MUST represent real alternate outcomes and SHOULD be typed validation|branch
  → If they are not alternate outcomes, the tree structure is wrong even if the markdown imports

☐ Single Screen Steps linkage (MUST when same-screen grouping is present):
  → Every non-swimlane #flow# should be reviewed for same-screen grouping, not only obvious wizard steps
  → If adjacent tasks remain on one screen, the START node SHOULD use \`\`\`process-node-type-N\`\`\` = "single_screen_steps"
  → The grouped range MUST have a matching \`\`\`process-single-screen-N\`\`\` whose lastStepRunningNumber resolves to the final in-screen task
  → This is important for graph/RAG so previous/next in-screen tasks are not misread as separate screens

☐ Swimlane JSON constraints:
  → Each \`\`\`flowtab-swimlane-*\`\`\` block has lanes/stages/placement only
  → MUST NOT include a "connectors" field
  → placement keys refer to existing node ids (node-<lineIndex>)

☐ Flowtab references (if present):
  → \`\`\`flowtab-process-references\`\`\` is a JSON object/map
  → Every entry references existing node ids (rootProcessNodeId/targetNodeId)
  → For kind:"inner", expandedRunningNumber/gridNodeKey must resolve (best-effort)

B) IA Correctness (main canvas non-#flow# area must be IA only)
☐ Navigability rule:
  → Main canvas non-#flow# nodes MUST be things a user can click to reach (sections/screens/menu items/functions)
  → AVOID generic ideas / conceptual prose as IA nodes

☐ Layering rule:
  → AVOID encoding step-by-step journeys in non-#flow# nodes
  → MUST encode step-by-step behavior ONLY under #flow# process nodes

☐ Screen content placement:
  → Detailed screen composition/content MUST live in expanded-grid-N (not as long child lists under a screen node)

☐ Screen surface tagging (MUST):
  → Every screen node with <!-- expid:N --> MUST include a ui-surface tag (tg-uiSurface), e.g.:
    - ui-surface-public / ui-surface-portal / ui-surface-admin / ui-surface-partner

☐ Multi-portal IA roots (MUST):
  → If the product has multiple portals/surfaces (public site, self-service portal, operations/admin portal, partner/vendor portal), EACH portal MUST be its own top-level IA root (indentation level 0).
  → Do NOT nest multiple portals under a single parent IA node.

C) Swimlane Correctness + Coverage (journey map; must reflect main canvas processes)
☐ Swimlane meaning:
  → Lane/stage changes reflect party/session boundaries (different users/roles, different systems, waiting/async, condition gates)
  → AVOID lane/stage churn just to “fill the grid”

☐ Required swimlane format coverage (MUST; at least one for each generated format):
  → Include at least one cross-system flow (handoff between different systems/apps).
  → Include at least one cross-actor flow (handoff between different actors/roles).
  → Include at least one multi-touchpoint flow (switching touchpoints such as web/mobile/app/offline).
  → Physical real-world touchpoint steps MUST use:
    <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->
  → Physical real-world touchpoint steps MUST NOT have \`\`\`flowtab-process-references\`\`\` entries.

☐ Actor semantics (MUST for #flow# nodes; recommend for Flowtab steps):
  → MUST NOT encode actors in node titles (no "<actor>:" prefixes such as "System:" or "Admissions Admin:")
  → Every #flow# node line MUST declare EXACTLY ONE app-specific actor tag from tg-actors.
  → Across tg-actors, include at least one concrete actor tag for each coverage class: self-service/external user, operational/admin, platform/back-office/system.
  → Swimlane lanes MUST represent those actor boundaries:
    - If the journey involves multiple actor roles or systems, EACH must have its own lane (one lane per actor/system). Do NOT combine actors in one lane.
    - If a lane label clearly implies an actor (e.g. "Admissions staff", "System"), placed nodes SHOULD have the matching actor tag
    - If a mismatch is intentional, add an annotation explaining it (handoff vs execution actor, shared responsibility, etc.)

☐ Swimlane-to-process linking (no implicit matching by name):
  → If swimlane steps are intended to map to process flows, \`\`\`flowtab-process-references\`\`\` MUST exist
  → Each Flowtab step node (node-<lineIndex>) has an entry of kind whole/inner, EXCEPT physical touchpoint steps marked with:
    <!-- ann:OFFLINE_PHYSICAL_STEP%3A%20<reason> -->

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

D) Data Objects Correctness (logical + wired; must support screens/flows)
☐ Orphan detection:
  → Each do-* in \`\`\`data-objects\`\`\` MUST be referenced by at least one:
    - tree anchor <!-- do:do-X -->, OR
    - expanded-grid node dataObjectId
  → AVOID orphan objects (dead weight)

☐ Transaction object declaration (MUST):
  → For EACH counted #flow# process root:
    - MUST declare EXACTLY ONE transaction object via exactly one <!-- do:do-X --> on the process root line
    - AVOID multiple do anchors on the same process root

☐ Flow-root-driven completeness:
  → For EACH counted #flow# process root:
    - Exactly ONE transaction object exists (Order/Case/Request/Application/etc.) and is wired
    - ≥2 supporting objects exist and are wired (PaymentIntent/Document/Message/VerificationSession/EligibilityCheck/AuditEvent/etc.)

☐ Domain logic review (conceptual correctness):
  → Relations/cardinality MUST reflect what screens/flows create/update/read
  → Baseline fields MUST be consistent (id, createdAt, updatedAt; status where applicable)
  → Any object with status MUST have defined states/transitions (dimension descriptions or equivalent), OR MUST be explicitly marked out-of-scope with a reason

E) Completeness Summary (counts; do not shrink scope to pass)
☐ Counting rules:
  → MUST count IA/navigation nodes and #flow# process ROOTS only (not step children)
  → MUST NOT count registry blocks or swimlane metadata blocks
☐ Report S/P/J:
  → S = unique expid screens
  → P = #flow# process roots (main canvas only)
  → J = #flowtab journey roots
☐ If counts are low:
  → Expand scope by adding missing screens/flows/objects
  → AVOID deleting content just to satisfy validation
`;

// Repo-local verifier script (context-agnostic; checks Diregram markdown format + linkage rules only).
export const PYTHON_MARKDOWN_VERIFIER_SCRIPT = String.raw`#!/usr/bin/env python3
"""
Diregram markdown verifier (repo-local sanity checks)

Usage:
  python3 verify_diregram.py /absolute/path/to/file.md

Purpose:
  - Context-agnostic verification of Diregram markdown FORMAT + LINKAGE integrity.
  - Mirrors the highest-signal checks from the app's import validator and the post-generation checklist.

What it checks (high-signal):
  - Fences: detects unclosed \`\`\` fences (UNCLOSED_CODE_BLOCK)
  - Tree formatting: 2-space indentation, no tabs, no fenced blocks before ---
  - Node ids: assumes node ids are node-<lineIndex> (0-based)
  - Completeness metrics: reports S/P/J counts using the same counting rules as the checklist
  - Expanded UI integrity: expid uniqueness, expanded-states + expanded-grid-N + expanded-metadata-N, strict content match
  - flow-nodes integrity (if present): lineIndex validity and #flow# marker at that line
  - process-node-type integrity: nodeId must exist, and branching #flow# nodes must be typed validation|branch
  - flow-connector-labels: keys must be direct parent->child edges in the tree
    - branching #flow# nodes must have connector labels for each branch edge
  - Swimlanes: flowtab-swimlane-* blocks must NOT include "connectors"
  - Flowtab refs (if present): flowtab-process-references must reference existing nodeIds; validates inner refs' grids when specified
  - Hub notes (best-effort): conditional-hub-notes lineIndex fields must be in-range
  - Data objects: detects orphan do-* objects by requiring references via <!-- do:... --> and/or dataObjectId fields in expanded UI blocks

Exit code:
  - 0 if no errors
  - 1 if any errors
  - 2 for usage errors
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


@dataclass
class Issue:
    level: str  # "error" | "warning"
    code: str
    message: str


def scan_fences(lines: list[str]) -> list[str]:
    in_fence = False
    start_line = 0
    errors: list[str] = []
    for i, l in enumerate(lines):
        if l.startswith("\`\`\`"):
            if not in_fence:
                in_fence = True
                start_line = i + 1
            else:
                in_fence = False
    if in_fence:
        errors.append(f"Unclosed fenced code block starting near line {start_line}.")
    return errors


def parse_fenced_blocks(text: str) -> list[tuple[str, str]]:
    # Returns [(block_type, body_string)] for fences like:
    # \`\`\`type
    # {...}
    # \`\`\`
    return re.findall(r"\`\`\`([^\n]+)\n(.*?)\n\`\`\`", text, flags=re.S)


def iter_dataobjectid_values(v: Any) -> Iterable[str]:
    # Extract only values under keys named "dataObjectId" to avoid false positives
    # (e.g. do-* ids inside \`\`\`data-objects\`\`\`).
    if isinstance(v, dict):
        for k, vv in v.items():
            if k == "dataObjectId" and isinstance(vv, str):
                yield vv
            yield from iter_dataobjectid_values(vv)
    elif isinstance(v, list):
        for vv in v:
            yield from iter_dataobjectid_values(vv)


def strip_inline_comments(s: str) -> str:
    # Remove <!-- ... --> segments.
    return re.sub(r"<!--[\s\S]*?-->", "", s).strip()


def strip_flow_markers(s: str) -> str:
    # Remove known inline markers that are not part of the node title.
    s = s.replace("#flow#", " ").replace("#flowtab#", " ").replace("#common#", " ")
    return re.sub(r"\s+", " ", s).strip()


def strip_conditions_suffix(s: str) -> str:
    # Mimic parser behavior: if the final (...) contains at least one "=", treat it as conditions and remove it.
    m = re.search(r"\s*\(([^)]*)\)\s*$", s)
    if not m:
        return s.strip()
    inner = m.group(1)
    if "=" not in inner:
        return s.strip()
    return (s[: m.start()]).strip()


def node_title_from_tree_line(line: str) -> str:
    # Best-effort approximation of parser display content:
    # - remove HTML comments
    # - remove flow markers (#flow#, #flowtab#, #common#)
    # - remove conditions suffix "(Key=value, ...)" if present
    s = strip_inline_comments(line)
    s = strip_flow_markers(s)
    s = strip_conditions_suffix(s)
    return s.strip()


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 verify_diregram.py /absolute/path/to/file.md")
        raise SystemExit(2)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"FAIL: file not found: {path}")
        raise SystemExit(1)

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    issues: list[Issue] = []
    for msg in scan_fences(lines):
        issues.append(Issue("error", "UNCLOSED_CODE_BLOCK", msg))

    # Separator
    try:
        sep = next(i for i, l in enumerate(lines) if l.strip() == "---")
    except StopIteration:
        issues.append(Issue("error", "MISSING_SEPARATOR", "missing '---' separator"))
        sep = -1

    tree = lines[:sep] if sep != -1 else lines

    # Tree must not contain fenced code blocks
    for i, l in enumerate(tree):
        if l.strip().startswith("\`\`\`"):
            issues.append(Issue("error", "FENCE_IN_TREE", f"fenced code block found in tree at line {i+1}; move metadata below '---'"))

    # Indentation checks (tree only)
    last_nonempty_indent = 0
    for i, l in enumerate(tree):
        if "\t" in l:
            issues.append(Issue("error", "TAB_IN_TREE", f"tab found in tree at line {i+1}"))
        if not l.strip():
            continue
        indent = len(l) - len(l.lstrip(" "))
        if indent % 2 != 0:
            issues.append(Issue("error", "BAD_INDENT", f"indent not multiple of 2 at line {i+1}: indent={indent}"))
        if indent - last_nonempty_indent > 2:
            issues.append(Issue("error", "INDENT_JUMP", f"indent jump > 2 at line {i+1}: prev={last_nonempty_indent}, now={indent}"))
        last_nonempty_indent = indent

    # Build indentation map + node features (lineIndex -> indent/title/markers)
    node_indent: dict[int, int] = {}
    node_title: dict[int, str] = {}
    is_flow: set[int] = set()
    is_flowtab: set[int] = set()
    fid_by_line: dict[int, str] = {}

    fid_re = re.compile(r"<!--\s*fid:([^>]+)\s*-->")
    do_re = re.compile(r"<!--\s*do:([^>]+)\s*-->")
    ann_re = re.compile(r"<!--\s*ann:([^>]+)\s*-->")
    for i, l in enumerate(tree):
        if not l.strip():
            continue
        node_indent[i] = len(l) - len(l.lstrip(" "))
        node_title[i] = node_title_from_tree_line(l)
        if "#flow#" in l:
            is_flow.add(i)
        if "#flowtab#" in l:
            is_flowtab.add(i)
        m = fid_re.search(l)
        if m:
            fid_by_line[i] = (m.group(1) or "").strip()

    node_ids = {f"node-{i}" for i in node_indent.keys()}

    def direct_children(i: int) -> list[int]:
        base = node_indent[i]
        kids: list[int] = []
        for j in range(i + 1, len(tree)):
            if j not in node_indent:
                continue
            ind = node_indent[j]
            if ind <= base:
                break
            if ind == base + 2:
                kids.append(j)
        return kids

    def nearest_ancestor(child_idx: int) -> int | None:
        c_indent = node_indent[child_idx]
        for j in range(child_idx - 1, -1, -1):
            if j not in node_indent:
                continue
            if node_indent[j] < c_indent:
                return j
        return None

    def in_flowtab_subtree(idx: int) -> bool:
        # True if idx is the flowtab root or any descendant of a flowtab root.
        cur = idx
        while True:
            if cur in is_flowtab:
                return True
            anc = nearest_ancestor(cur)
            if anc is None:
                return False
            cur = anc

    # Parse fenced blocks + strict JSON
    parsed_blocks: dict[str, Any] = {}
    for t, body in parse_fenced_blocks(text):
        try:
            parsed_blocks[t] = json.loads(body)
        except Exception as e:
            issues.append(Issue("error", "INVALID_JSON", f"invalid JSON in block '{t}': {e}"))

    # Completeness metrics (S/P/J)
    expid_occ: dict[int, int] = {}
    for i, l in enumerate(tree):
        if not l.strip():
            continue
        for m in re.findall(r"<!--\s*expid:(\d+)\s*-->", l):
            n = int(m)
            expid_occ[n] = expid_occ.get(n, 0) + 1
    S = sum(1 for _, c in expid_occ.items() if c > 0)
    J = len([i for i in is_flowtab])
    # P = #flow# process ROOTS (exclude flowtab subtree, exclude step children)
    P = 0
    for i in sorted(is_flow):
        if in_flowtab_subtree(i):
            continue
        anc = nearest_ancestor(i)
        if anc is None:
            P += 1
        else:
            # Root if nearest #flow# ancestor does not exist
            cur = anc
            has_flow_ancestor = False
            while cur is not None:
                if cur in is_flow:
                    has_flow_ancestor = True
                    break
                cur = nearest_ancestor(cur)
            if not has_flow_ancestor:
                P += 1
    print(f"Completeness metrics: S={S} (unique expid), P={P} (#flow# process roots), J={J} (#flowtab roots)")

    # Process root detection (same logic as P counting; returns line indices)
    process_roots: list[int] = []
    for i in sorted(is_flow):
        if in_flowtab_subtree(i):
            continue
        anc = nearest_ancestor(i)
        if anc is None:
            process_roots.append(i)
            continue
        cur = anc
        has_flow_ancestor = False
        while cur is not None:
            if cur in is_flow:
                has_flow_ancestor = True
                break
            cur = nearest_ancestor(cur)
        if not has_flow_ancestor:
            process_roots.append(i)

    # Flowtab checks
    for r in sorted(is_flowtab):
        if r not in is_flow:
            issues.append(Issue("error", "FLOWTAB_ROOT_MISSING_FLOW", f"flowtab root missing #flow# at line {r+1}"))
        fid = fid_by_line.get(r, "")
        if not fid:
            issues.append(Issue("error", "FLOWTAB_ROOT_MISSING_FID", f"flowtab root missing <!-- fid:... --> at line {r+1}"))
        for k in direct_children(r):
            if k not in is_flow:
                issues.append(Issue("error", "FLOWTAB_CHILD_MISSING_FLOW", f"flowtab child missing #flow# at line {k+1}"))

    # flow-connector-labels validation (parent->child keys)
    labels = parsed_blocks.get("flow-connector-labels")
    if labels is None:
        issues.append(Issue("error", "MISSING_FLOW_CONNECTOR_LABELS", "missing \`\`\`flow-connector-labels\`\`\` block"))
        labels = {}
    if labels is not None and not isinstance(labels, dict):
        issues.append(Issue("error", "BAD_FLOW_CONNECTOR_LABELS", "\`\`\`flow-connector-labels\`\`\` must be a JSON object"))
        labels = {}

    bad_edges: list[str] = []
    for edge_key in list(labels.keys()) if isinstance(labels, dict) else []:
        if not isinstance(edge_key, str) or "__" not in edge_key:
            bad_edges.append(str(edge_key))
            continue
        parent, child = edge_key.split("__", 1)
        try:
            pi = int(parent.split("-")[1])
            ci = int(child.split("-")[1])
        except Exception:
            bad_edges.append(edge_key)
            continue
        if pi not in node_indent or ci not in node_indent:
            bad_edges.append(edge_key)
            continue
        if nearest_ancestor(ci) != pi:
            bad_edges.append(edge_key)
    if bad_edges:
        issues.append(Issue("error", "BAD_FLOW_CONNECTOR_EDGE", f"flow-connector-labels has non-parent->child keys (showing up to 10): {bad_edges[:10]}"))

    # process-node-type blocks must reference existing nodeIds
    ptype_by_nodeid: dict[str, str] = {}
    for t, parsed in parsed_blocks.items():
        if not t.startswith("process-node-type-"):
            continue
        if not isinstance(parsed, dict):
            issues.append(Issue("error", "BAD_PROCESS_NODE_TYPE", f"block '{t}' must be a JSON object"))
            continue
        node_id = parsed.get("nodeId")
        ptype = parsed.get("type")
        if not isinstance(node_id, str) or not isinstance(ptype, str) or not node_id or not ptype:
            issues.append(Issue("error", "BAD_PROCESS_NODE_TYPE", f"block '{t}' must contain string fields 'nodeId' and 'type'"))
            continue
        if node_id not in node_ids:
            issues.append(Issue("error", "MISSING_NODE_ID", f"block '{t}' references nodeId '{node_id}', but that node id does not exist in this markdown"))
            continue
        ptype_by_nodeid[node_id] = ptype

    # Branching #flow# nodes: type + labels for branch edges
    branchers = [i for i in sorted(is_flow) if len(direct_children(i)) >= 2]
    for i in branchers:
        node_id = f"node-{i}"
        ptype = ptype_by_nodeid.get(node_id)
        if not ptype:
            issues.append(Issue("error", "MISSING_PROCESS_NODE_TYPE", f"branching #flow# node {node_id} is missing process-node-type-*"))
        elif ptype not in ("validation", "branch"):
            issues.append(Issue("error", "BAD_PROCESS_NODE_TYPE", f"branching #flow# node {node_id} must be type validation|branch, found '{ptype}'"))
        for k in direct_children(i):
            edge = f"node-{i}__node-{k}"
            if isinstance(labels, dict) and edge not in labels:
                issues.append(Issue("error", "MISSING_BRANCH_LABEL", f"missing flow-connector-labels entry for branch edge {edge}"))

    # Swimlane blocks: no 'connectors', and best-effort fid existence
    fid_set = set(fid_by_line.values())
    for t, parsed in parsed_blocks.items():
        if not t.startswith("flowtab-swimlane-"):
            continue
        if isinstance(parsed, dict) and "connectors" in parsed:
            issues.append(Issue("error", "SWIMLANE_HAS_CONNECTORS", f"swimlane block '{t}' must NOT include a 'connectors' field"))
        fid = t[len("flowtab-swimlane-") :]
        if fid and fid not in fid_set:
            issues.append(Issue("warning", "ORPHAN_FLOWTAB_SWIMLANE", f"block '{t}' exists but no node has <!-- fid:{fid} -->"))

        # Placement references sanity (best-effort)
        if isinstance(parsed, dict):
            placement = parsed.get("placement")
            if isinstance(placement, dict):
                for k in placement.keys():
                    if isinstance(k, str) and k.startswith("node-") and k not in node_ids:
                        issues.append(Issue("error", "BAD_SWIMLANE_PLACEMENT_NODE", f"swimlane '{t}' placement references missing node id '{k}'"))

    # Expanded anchors integrity
    dup_expids = sorted([n for n, c in expid_occ.items() if c > 1])
    if dup_expids:
        issues.append(Issue("error", "DUPLICATE_EXPID", f"duplicate expid(s) found in tree: {dup_expids}"))

    es = parsed_blocks.get("expanded-states")
    expanded_entries_by_rn: dict[int, dict[str, Any]] = {}
    if expid_occ and es is None:
        issues.append(Issue("error", "MISSING_EXPANDED_STATES", "found <!-- expid:N --> anchors but missing \`\`\`expanded-states\`\`\` block"))
    if isinstance(es, dict):
        entries = es.get("entries")
        if not isinstance(entries, list):
            issues.append(Issue("error", "BAD_EXPANDED_STATES", "\`\`\`expanded-states\`\`\` must contain an array field 'entries'"))
        else:
            for e in entries:
                if not isinstance(e, dict):
                    continue
                rn = e.get("runningNumber")
                li = e.get("lineIndex")
                if isinstance(rn, int):
                    expanded_entries_by_rn[rn] = e
                if li is not None and (not isinstance(li, int) or li < 0 or li >= len(lines)):
                    issues.append(Issue("error", "EXPANDED_BAD_LINE", f"expanded-states entry rn={rn} has invalid lineIndex {li}"))
                # Strict content match (mirrors validator warning, but completeness rules make it mandatory)
                if isinstance(li, int) and li in node_title and isinstance(e.get("content"), str):
                    if e["content"] != node_title[li]:
                        issues.append(Issue("error", "EXPANDED_ENTRY_CONTENT_MISMATCH", f"expanded-states entry rn={rn} content does not match node title at line {li+1}"))

    for n in sorted(expid_occ.keys()):
        if isinstance(es, dict) and n not in expanded_entries_by_rn:
            issues.append(Issue("error", "MISSING_EXPANDED_ENTRY", f"expanded-states missing runningNumber entry for expid:{n}"))
        if f"expanded-grid-{n}" not in parsed_blocks:
            issues.append(Issue("error", "MISSING_EXPANDED_GRID", f"missing \`\`\`expanded-grid-{n}\`\`\` block for expid:{n}"))
        if f"expanded-metadata-{n}" not in parsed_blocks:
            issues.append(Issue("error", "MISSING_EXPANDED_METADATA", f"missing \`\`\`expanded-metadata-{n}\`\`\` block for expid:{n}"))

    # flow-nodes (best-effort; mirrors validator)
    fn = parsed_blocks.get("flow-nodes")
    if isinstance(fn, dict):
        entries = fn.get("entries")
        if isinstance(entries, list):
            for e in entries:
                if not isinstance(e, dict):
                    continue
                rn = e.get("runningNumber")
                li = e.get("lineIndex")
                if li is None or not isinstance(li, int) or li < 0 or li >= len(lines):
                    issues.append(Issue("error", "FLOW_NODE_BAD_LINE", f"flow-nodes entry rn={rn} has invalid lineIndex {li}"))
                    continue
                if li not in node_indent:
                    issues.append(Issue("warning", "FLOW_NODE_ENTRY_NO_NODE", f"flow-nodes entry rn={rn} points to line {li+1}, but no node was parsed there"))
                elif li not in is_flow:
                    issues.append(Issue("warning", "FLOW_NODE_ENTRY_NOT_FLOW", f"flow-nodes entry rn={rn} points to line {li+1}, but that node is not marked with #flow#"))

    # flowtab-process-references (strict if present)
    refs = parsed_blocks.get("flowtab-process-references")
    if refs is not None:
        if not isinstance(refs, dict):
            issues.append(Issue("error", "BAD_FLOWTAB_REFS", "flowtab-process-references must be a JSON object/map"))
        else:
            for k, v in refs.items():
                if not isinstance(k, str) or not isinstance(v, dict):
                    issues.append(Issue("warning", "BAD_FLOWTAB_REF", f"flowtab-process-references has an invalid entry at key '{k}'"))
                    continue
                kind = v.get("kind")
                root_id = v.get("rootProcessNodeId")
                target_id = v.get("targetNodeId")
                if kind not in ("whole", "inner") or not isinstance(root_id, str) or not isinstance(target_id, str) or not root_id or not target_id:
                    issues.append(Issue("warning", "BAD_FLOWTAB_REF", f"flowtab-process-references['{k}'] is missing required fields"))
                    continue
                if root_id not in node_ids:
                    issues.append(Issue("error", "FLOWTAB_REF_MISSING_NODE", f"flowtab-process-references['{k}'] rootProcessNodeId '{root_id}' does not exist"))
                if target_id not in node_ids:
                    issues.append(Issue("error", "FLOWTAB_REF_MISSING_NODE", f"flowtab-process-references['{k}'] targetNodeId '{target_id}' does not exist"))
                if kind == "inner":
                    exp_rn = v.get("expandedRunningNumber")
                    grid_key = v.get("gridNodeKey")
                    if exp_rn is not None and (not isinstance(exp_rn, int) or exp_rn <= 0):
                        issues.append(Issue("warning", "BAD_FLOWTAB_REF_RN", f"flowtab-process-references['{k}'] has invalid expandedRunningNumber"))
                    if isinstance(exp_rn, int) and isinstance(grid_key, str) and grid_key:
                        grid = parsed_blocks.get(f"expanded-grid-{exp_rn}")
                        if grid is None:
                            issues.append(Issue("warning", "FLOWTAB_REF_MISSING_EXPANDED_GRID", f"flowtab-process-references['{k}'] points to expanded-grid-{exp_rn}, but it does not exist"))
                        elif isinstance(grid, list):
                            if not any(isinstance(n, dict) and n.get("key") == grid_key for n in grid):
                                issues.append(Issue("warning", "FLOWTAB_REF_MISSING_GRID_NODE", f"flowtab-process-references['{k}'] gridNodeKey '{grid_key}' not found in expanded-grid-{exp_rn}"))

    hub = parsed_blocks.get("conditional-hub-notes")
    if isinstance(hub, dict):
        entries = hub.get("entries")
        if isinstance(entries, list):
            for e in entries:
                if not isinstance(e, dict):
                    continue
                rn = e.get("runningNumber")
                li = e.get("lineIndex")
                if li is None or not isinstance(li, int) or li < 0 or li >= len(lines):
                    issues.append(Issue("error", "HUBNOTE_BAD_LINE", f"conditional-hub-notes entry rn={rn} has invalid lineIndex {li}"))

    # Data objects: orphan detection via anchors and dataObjectId usage in expanded UI blocks
    dobj = parsed_blocks.get("data-objects")
    if dobj is None:
        issues.append(Issue("warning", "MISSING_DATA_OBJECTS_BLOCK", "missing \`\`\`data-objects\`\`\` block"))
    elif isinstance(dobj, dict):
        objs = dobj.get("objects")
        if not isinstance(objs, list):
            issues.append(Issue("error", "BAD_DATA_OBJECTS", "\`\`\`data-objects\`\`\` must be an object with an array field 'objects'"))
        else:
            do_ids = [o.get("id") for o in objs if isinstance(o, dict)]
            do_ids = [x for x in do_ids if isinstance(x, str) and re.match(r"^do-\d+$", x)]

            do_refs_tree: set[str] = set()
            for l in tree:
                for m in re.findall(r"<!--\s*do:(do-\d+)\s*-->", l):
                    do_refs_tree.add(m)

            # Only consider "dataObjectId" fields in non-data-objects JSON blocks
            do_refs_ui: set[str] = set()
            for t, parsed in parsed_blocks.items():
                if t == "data-objects":
                    continue
                for v in iter_dataobjectid_values(parsed):
                    if isinstance(v, str) and re.match(r"^do-\d+$", v):
                        do_refs_ui.add(v)

            orphans = sorted([d for d in do_ids if d not in do_refs_tree and d not in do_refs_ui])
            if orphans:
                issues.append(Issue("error", "ORPHAN_DATA_OBJECT", f"orphan data object(s) not referenced by <!-- do:... --> or any dataObjectId in expanded UI: {orphans}"))

    # Requirements: swimlane coverage + transaction object declaration + basic flow↔screen linkage
    import urllib.parse

    def has_oos_journey(line: str) -> bool:
        # Expect annotation like: <!-- ann:OOS_JOURNEY%3A%20<reason> -->
        m = ann_re.search(line)
        if not m:
            return False
        raw = (m.group(1) or "").strip()
        if not raw:
            return False
        try:
            decoded = urllib.parse.unquote(raw)
        except Exception:
            decoded = raw
        return decoded.strip().startswith("OOS_JOURNEY:")

    # 1) Minimum journeys gate: if P > 0, must have J >= 1 unless ALL roots are OOS_JOURNEY
    if P > 0 and J == 0:
        all_oos = all(has_oos_journey(tree[i]) for i in process_roots) if process_roots else False
        if not all_oos:
            issues.append(Issue("error", "MISSING_JOURNEY_MAP", "P > 0 but J == 0; must include at least one #flowtab journey (or mark ALL process roots OOS_JOURNEY with reasons)"))

    # 2) Transaction object declaration: each process root must have exactly ONE do: anchor on the root line
    for i in process_roots:
        do_matches = do_re.findall(tree[i])
        do_matches = [d.strip() for d in do_matches if d.strip()]
        if len(do_matches) != 1:
            issues.append(Issue("error", "BAD_TRANSACTION_OBJECT_DECL", f"process root node-{i} must declare EXACTLY ONE transaction object via <!-- do:do-X --> on the root line; found {len(do_matches)}"))
        else:
            do_id = do_matches[0]
            if not re.match(r"^do-\d+$", do_id):
                issues.append(Issue("error", "BAD_TRANSACTION_OBJECT_DECL", f"process root node-{i} has invalid do id '{do_id}' (expected do-N)"))

    # 3) Flow↔screen linkage (best-effort): each process root should have at least one expid in its subtree (entry screen)
    expid_re = re.compile(r"<!--\s*expid:(\d+)\s*-->")
    for i in process_roots:
        base = node_indent.get(i, 0)
        has_exp = bool(expid_re.search(tree[i]))
        if not has_exp:
            for j in range(i + 1, len(tree)):
                if j not in node_indent:
                    continue
                if node_indent[j] <= base:
                    break
                if expid_re.search(tree[j]):
                    has_exp = True
                    break
        if not has_exp:
            issues.append(Issue("warning", "FLOW_ROOT_NO_SCREEN", f"process root node-{i} has no <!-- expid:N --> in its subtree; flow may be unreachable from a screen"))

    # 4) Swimlane coverage: each process root must be referenced by a kind:'whole' flowtab-process-references OR be OOS_JOURNEY
    refs = parsed_blocks.get("flowtab-process-references")
    covered_roots: set[str] = set()
    if isinstance(refs, dict):
        for _, v in refs.items():
            if not isinstance(v, dict):
                continue
            if v.get("kind") != "whole":
                continue
            rid = v.get("rootProcessNodeId")
            tid = v.get("targetNodeId")
            if isinstance(rid, str) and isinstance(tid, str) and rid and tid:
                covered_roots.add(rid)
    for i in process_roots:
        nid = f"node-{i}"
        if nid in covered_roots:
            continue
        if has_oos_journey(tree[i]):
            continue
        issues.append(Issue("error", "MISSING_SWIMLANE_COVERAGE", f"process root {nid} is not referenced by any flowtab-process-references kind:'whole' entry and is not marked OOS_JOURNEY"))

    # Print report
    errs = [x for x in issues if x.level == "error"]
    warns = [x for x in issues if x.level == "warning"]
    for it in issues:
        prefix = "FAIL" if it.level == "error" else "WARN"
        print(f"{prefix} [{it.code}] {it.message}")
    if errs:
        print(f"\nRESULT: FAIL ({len(errs)} error(s), {len(warns)} warning(s))")
        raise SystemExit(1)
    print(f"\nRESULT: OK (0 errors, {len(warns)} warning(s))")


if __name__ == "__main__":
    main()
`;

export const FULL_AI_PROMPT = `${AI_PROMPT}\n\n${AI_PROMPT_ADDON}\n\n${PRE_GENERATION_CHECKLIST}`;
