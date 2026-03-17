export const POST_GEN_CHECKLIST_IA = `Post-Generation Checklist — IA Correctness (main canvas non-#flow# area must be IA only)

MUST:
  - Keep main canvas non-#flow# nodes as navigable UI items (sections/screens/menu items/functions).
  - Keep step-by-step behavior ONLY under #flow# process nodes.
AVOID:
  - Generic ideas, conceptual prose, or user-journey narratives in IA nodes.

☐ Navigability rule:
  → Main canvas non-#flow# nodes MUST be things a user can click to reach (sections/screens/menu items/functions)
  → AVOID generic ideas / conceptual prose as IA nodes

☐ IA title / artifact-fit sanity (MUST):
  → Screen/page/section nodes SHOULD read like destinations or navigation items:
    - GOOD: "Checkout", "Order history", "Application details", "Payment settings"
  → Function leaves MAY read like concise capabilities, but still as UI-reachable items:
    - GOOD: "Submit application", "Download invoice"
  → Move or rewrite anything that reads like:
    - step/action prose ("user can click confirm", "then verify email")
    - low-level component labels without screen context ("Confirm button", "Dropdown")
    - raw domain entities that belong in data-objects ("Order", "Invoice"), unless the node is clearly a screen such as "Order details"

☐ Multi-portal IA roots (MUST):
  → If the product has multiple portals/surfaces (public site, self-service portal, operations/admin portal, partner/vendor portal), EACH portal MUST be its own top-level IA root (indentation level 0).
  → Do NOT nest multiple portals under a single parent IA node.

☐ Layering rule:
  → AVOID encoding step-by-step journeys in non-#flow# nodes
  → MUST encode step-by-step behavior ONLY under #flow# process nodes
  → Reminder: if a node reads like “then / next / after”, it is NOT IA — move it under a #flow# process.

☐ Screen content placement:
  → Detailed screen composition/content MUST live in expanded-grid-N (not as long child lists under a screen node)
  → Reminder: the tree may name screens and high-level sections, but component-level detail belongs in expanded-grid-N.
  → For LLM-generated screen layouts, prefer using explicit expanded-grid uiTypes to convey structure:
    - tabs / wizard / sideNav / dropdown: navigation + grouped content lists
    - collapsible: grouped sections that can expand/collapse
    - text (with textVariant/textAlign): headings, labels, helper text
  → Avoid encoding these as long prose paragraphs; encode them as structured expanded-grid JSON.

☐ Screen surface tagging (MUST):
  → Every screen node with <!-- expid:N --> MUST include a ui-surface tag (tg-uiSurface), e.g.:
    - ui-surface-public / ui-surface-portal / ui-surface-admin / ui-surface-partner
  → AVOID mixing multiple ui surfaces on one screen unless you intentionally support multiple surfaces (if so, annotate why).
`;
