export const POST_GEN_CHECKLIST_VISION_COMPONENT_LIBRARY = `Post-Generation Checklist — Vision Component Library (tokens + coverage)

Goal:
  - Ensure the component SVG library is complete, token-accurate, and easy to paste into Vision cards.

☐ Token coverage (MUST):
  → Colors: primary/secondary/neutral + success/warn/error
  → Typography: font family, sizes, weights, line heights
  → Spacing scale
  → Radii
  → Shadows/elevation
  → Borders

☐ Source evidence (MUST):
  → Include sources for tokens (design system docs, Storybook, or sampled UI surfaces).
  → If inferred, clearly mark as inferred and why.

☐ Component coverage (MUST):
  → Buttons: primary/secondary/tertiary/destructive (+ icon variants)
  → Inputs: text/textarea/select/date/search with helper + error states
  → Tabs/segmented controls
  → Table/list patterns (header/rows/empty/loading)
  → Modal/dialog
  → Toast/alert
  → Navigation (side/top/breadcrumbs)

☐ State coverage (MUST for key components):
  → default / hover / active / disabled
  → error/invalid state for form controls
  → loading/empty for lists/tables where relevant

☐ Vector editability (MUST):
  → SVG blocks are simple and editable:
    - has viewBox
    - avoids embedded rasters/bitmaps
    - uses rect/path/text, minimal filters
  → Warn if: SVGs are extremely large or contain huge path data.
`;

