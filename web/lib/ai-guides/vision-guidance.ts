export const VISION_AI_GUIDANCE_PROMPT_FROM_RESOURCES = `===============================================================================
VISION AI GUIDANCE PROMPT (USE CASE A: design system resources already provided)
Vision docs; importable markdown
===============================================================================

Goal
Generate a NexusMap Vision document that can be imported/opened in the Vision editor, plus a design-system-derived UI component library for rapid vector UI mockups.

IMPORTANT: A Vision document is NOT the NexusMap tree format.
- You MAY use normal markdown headings/lists.
- You MUST include the required fenced blocks so NexusMap recognizes this file as kind:vision.

===============================================================================
SECTION 1 — REQUIRED VISION MARKDOWN SKELETON (MUST)
===============================================================================

At the very top of the file, include a nexus-doc header:

\`\`\`nexus-doc
{
  "kind": "vision",
  "version": 1
}
\`\`\`

Then include exactly ONE \`\`\`visionjson block containing a JSON object with version 2:

\`\`\`visionjson
{"version":2}
\`\`\`

Notes:
- The minimal valid payload is {"version":2}. (tldraw content is optional.)
- Keep the visionjson payload compact. Large pretty-printed snapshots can freeze the browser.

===============================================================================
SECTION 2 — DESIGN SYSTEM EXTRACTION (MUST)
===============================================================================

You will be given design system documentation/resources (or explicit token tables). Use them as the source of truth.
If resources are incomplete, explicitly list missing tokens and choose best-effort defaults.

Record sources (MUST):
- Include links or citations (page names / paths) for token values you used.

Extract tokens (MUST):
- Colors (primary/secondary/neutral, semantic success/warn/error)
- Typography (font family, sizes, weights, line heights)
- Spacing scale (4/8/12/16… or similar)
- Radii (sm/md/lg)
- Shadows/elevation
- Border styles

===============================================================================
SECTION 3 — VISION CARD PLAN (MUST)
===============================================================================

Create multiple Vision cards (conceptually) — one per component family and key states.
For each card, define:
- Card title (component family + state)
- Target platform/surface (web/mobile/admin) if relevant
- Key states to cover:
  - default / hover / active / disabled
  - validation error / helper text (for inputs)
  - loading / empty states (for lists/tables)

Minimum component coverage (MUST):
- Buttons (primary/secondary/tertiary/destructive; with icons)
- Inputs (text, textarea, select, date, search; error + helper states)
- Tabs / segmented controls
- Tables / lists (headers, row states, pagination)
- Modals / dialogs
- Toasts / alerts
- Navigation (side nav / top nav / breadcrumbs)

===============================================================================
SECTION 4 — VECTOR REPRESENTATION LIBRARY (MUST)
===============================================================================

Because generating a full tldraw snapshot is complex, you MUST produce a copy/paste vector library using inline SVG blocks.

For each component (and state), output:
- A short label
- A small SVG with a proper viewBox and simple primitives (rect/path/text)
- Token-accurate colors/radius/typography (from Section 2)

Constraints (MUST):
- SVGs MUST be simple and editable (avoid raster images / embedded bitmaps).
- Use a consistent coordinate system (e.g., 0 0 320 120 for small components).
- Keep each SVG under a few KB.

Usage (FYI):
- In NexusMap Vision, create/select a card and paste SVG — the editor will import it as editable vector shapes.

===============================================================================
SECTION 5 — POST-GEN SELF-CHECK (MUST)
===============================================================================
- File starts with \`\`\`nexus-doc kind:vision
- Exactly one \`\`\`visionjson block exists and parses as JSON with version:2
- Token values are consistent across all SVGs
- Component library covers the minimum set and key states
`;

export const VISION_AI_GUIDANCE_PROMPT_FROM_WEBSITE = `===============================================================================
VISION AI GUIDANCE PROMPT (USE CASE B: discover design system from a website)
Vision docs; importable markdown
===============================================================================

Goal
1) Find the product’s design system documentation from the website (or infer tokens from the live UI).
2) Produce an importable Vision markdown skeleton + a token-accurate SVG component library.

===============================================================================
SECTION 1 — REQUIRED VISION MARKDOWN SKELETON (MUST)
===============================================================================

At the very top of the file, include a nexus-doc header:

\`\`\`nexus-doc
{
  "kind": "vision",
  "version": 1
}
\`\`\`

Then include exactly ONE \`\`\`visionjson block containing a JSON object with version 2:

\`\`\`visionjson
{"version":2}
\`\`\`

===============================================================================
SECTION 2 — FIND THE DESIGN SYSTEM (MUST)
===============================================================================

You MUST attempt to locate official design system docs:
- Search for pages/paths like:
  - /design-system, /components, /styleguide, /brand, /ui-kit, /storybook
- Look for “Storybook”, “Figma”, “Tokens”, “Components”, “Guidelines”.

If official docs are not accessible:
- Infer tokens from the live UI (colors/typography/spacing/radius/shadows).
- Record the exact UI surfaces/screens you used as evidence (page name + what element you sampled).

Record sources (MUST):
- Include the pages you used to extract tokens/components (URLs or page titles).

===============================================================================
SECTION 3 — VISION CARD PLAN (MUST)
===============================================================================

Create multiple Vision cards (conceptually) — one per component family and key states.
Follow the same minimum coverage as Use Case A (buttons/inputs/tabs/tables/modals/toasts/nav).

===============================================================================
SECTION 4 — VECTOR REPRESENTATION LIBRARY (MUST)
===============================================================================

Output a copy/paste SVG library for each component/state using token-accurate values.
Constraints:
- SVGs simple + editable (no rasters)
- consistent viewBox
- keep each SVG small

===============================================================================
SECTION 5 — POST-GEN SELF-CHECK (MUST)
===============================================================================
- Exactly one visionjson block, JSON parses, version:2
- Sources listed for tokens (docs or sampled UI)
- Tokens consistent across components
- Coverage + state coverage complete
`;

