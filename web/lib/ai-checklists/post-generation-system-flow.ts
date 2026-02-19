export const POST_GEN_CHECKLIST_SYSTEM_FLOW = `Post-Generation Checklist — System Flow (system/integration diagrams)

Goal:
  - Ensure #systemflow roots and \`\`\`systemflow-<sfid>\`\`\` blocks are present, valid JSON, and render as intended.
  - Ensure architecture grouping (zones) and sequence ordering (links.order) are coherent.

☐ Minimum diagrams gate (MUST):
  → There MUST be at least ONE architecture System Flow diagram (module inventory + zones).
  → Each sequence diagram MUST be its own System Flow root (1 sequence = 1 systemflow root).

☐ Root anchor correctness (MUST):
  → Tree contains a System Flow root line:
    - includes #systemflow#
    - includes <!-- sfid:systemflow-N --> with a stable sfid

☐ Block existence + parse (MUST):
  → Exactly one fenced block exists for each sfid:
    - \`\`\`systemflow-systemflow-N
      { ... JSON ... }
      \`\`\`
  → JSON parses and includes:
    - version: 1
    - gridWidth/gridHeight numbers
    - boxes[], zones[], links[] arrays (can be empty)

☐ Boxes sanity (MUST):
  → Each box has: key, name, gridX, gridY, gridWidth, gridHeight
  → Keys are stable (sfbox-1, sfbox-2, ...)
  → Visual intent:
    - architecture context: reasonable box sizes (not all skinny-tall)
    - sequence: modules are skinny-tall lifelines (gridWidth small, gridHeight tall) and arranged left-to-right

☐ Zones grouping (SHOULD; architecture pass):
  → Use zones[] to group systems/portals/modules:
    - portal zones (applicant/admin/partner/public)
    - shared modules zone (auth/notifications/design system/etc.)
    - external systems zone (payment provider, identity provider, etc.)
  → Each zone.boxKeys references valid box keys and avoids duplicates.

☐ Links sanity (MUST):
  → Each link has: id, fromKey, toKey, (optional fromSide/toSide), (optional text)
  → fromKey/toKey reference existing boxes.
  → For sequence diagrams:
    - order is present and unique-ish (1..N)
    - text is clear (verb + payload)
    - dashStyle:"dashed" used for async/background where appropriate

☐ Anti-patterns (AVOID):
  - Encoding sequence as main-canvas #flow# nodes (use System Flow for technical diagrams).
  - Putting multiple unrelated sequences into one systemflow (hard to audit; violates 1 sequence = 1 systemflow root).
  - Unlabeled links (hard to audit).
  - No zones at all for a large architecture diagram (becomes unreadable).
`;

