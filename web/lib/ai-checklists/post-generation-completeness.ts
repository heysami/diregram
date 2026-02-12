export const POST_GEN_CHECKLIST_COMPLETENESS = `Post-Generation Checklist — Completeness Summary (counts; do not shrink scope to pass)

MUST:
  - Aim for completeness across layers; import-ready is not enough.
AVOID:
  - Deleting screens/flows to satisfy validation unless scope is intentionally reduced.

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
  → Reminder: fix by merging/relinking/reindexing — do NOT “shrink to pass”
`;

