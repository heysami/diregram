export const POST_GEN_CHECKLIST_TAGS = `Post-Generation Checklist — Tags (tag-store + node tagging + pinned tags)

Goal:
  - Make tagging machine-checkable and consistent across views (Main canvas, Flowtab swimlane, Data Objects).
  - Prevent common drift: tags referenced but not defined, actor semantics encoded in titles, or pinned tags that never render.

☐ tag-store existence (MUST if any tags are used):
  → If the markdown uses <!-- tags:... --> anywhere, it MUST include exactly one \`\`\`tag-store\`\`\` block.
  → All tag IDs used in <!-- tags:... --> MUST exist in tag-store.tags[].

☐ Required tag groups (MUST when relevant):
  → tg-actors MUST exist (actors):
    - actor-applicant / actor-staff / actor-system / actor-partner
  → tg-uiSurface MUST exist IF the markdown uses any <!-- expid:N --> screen nodes.

☐ Actor semantics (STRICT for #flow# nodes):
  → Every #flow# node line MUST include <!-- tags:... --> and EXACTLY ONE actor tag from tg-actors.
  → Actors MUST NOT be encoded in node titles:
    - FAIL if titles start with "System:" / "Staff:" / "Applicant:" / "Partner:"

☐ Screen surface semantics (STRICT for UI blueprint nodes):
  → Every screen node with <!-- expid:N --> MUST include at least one tg-uiSurface tag (prefer exactly one):
    - ui-surface-public / ui-surface-portal / ui-surface-admin / ui-surface-partner

☐ Node tags format + hygiene:
  → Tag lists MUST be comma-separated IDs: <!-- tags:tag-1,tag-2 -->
  → No empty IDs, no duplicate IDs within a node.
  → Avoid creating redundant near-duplicate tags (e.g., "actor-system" vs "system").

☐ Pinned tags (UI display rules; metadata must exist to render):
  → Global pinned tags (non-Flow view):
    - If the UI is expected to show pinned tags above nodes on the main canvas, the markdown SHOULD include a \`\`\`pinned-tags\`\`\` block with { "tagIds": [...] }.
  → Flowtab swimlane pinned tags (per flow):
    - If the Flowtab swimlane is expected to show pinned tags above nodes, each \`\`\`flowtab-swimlane-<fid>\`\`\` block SHOULD include "pinnedTagIds": [...]
  → Ordering:
    - Render order MUST follow the pinned tag order (first 3 chips, then "+x").
  → Visibility:
    - Only pinned tags that are ALSO present on the node are shown above that node.
`;

