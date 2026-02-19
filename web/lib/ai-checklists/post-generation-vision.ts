export const POST_GEN_CHECKLIST_VISION_IMPORT = `Post-Generation Checklist — Vision Importability (file opens correctly)

Goal:
  - Ensure the Vision markdown is importable/openable in the Vision editor.

☐ File header (MUST):
  → The file begins with a \`\`\`nexus-doc block:
    { "kind": "vision", "version": 1 }

☐ visionjson block (MUST):
  → Exactly ONE \`\`\`visionjson block exists.
  → The payload parses as JSON and includes:
    - version: 2
  → Warn if: the payload is huge / pretty-printed (may freeze the browser).

☐ Token sourcing (MUST):
  → The doc includes the design system source references (links/page names).
  → Core tokens are stated and consistent:
    - colors, typography, spacing, radii, elevation/shadows, borders

☐ Visual sanity (SHOULD):
  → If the file includes component SVGs, typography/spacing/radius look consistent and match the design system.
`;

