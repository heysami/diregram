## DO NOT REGRESS: Node creation & cross-tab stability

This app renders the same underlying markdown (`doc.getText('nexus')`) in multiple views (Canvas / Flows / Data Objects).
Historically, two issues caused “random” breakage where Enter/Tab stopped creating nodes or flows became uneditable.

### 1) `lineIndex` drift when parsing markdown

**Symptom**
- After adding metadata/code blocks (e.g. ` ```flowtab-swimlane-*``` `) and switching tabs, node creation/editing breaks for later flows.

**Root cause**
- `parseNexusMarkdown` filters out code blocks for tree parsing.
- If `node.lineIndex` is computed from the *filtered* list index, it no longer matches the *real* markdown line index.
- All edit operations splice into the real `lines[]` using `node.lineIndex`, so the wrong line gets modified.

**Solution**
- `web/lib/nexus-parser.ts` preserves the **original markdown line index** even when skipping code blocks.
- Never change `node.lineIndex` to be “index in filtered list”.

### 2) Flow tab Enter/Tab swallowed by other controls

**Symptom**
- In Flow tab (swimlane), Enter/Tab sometimes stops creating nodes even though a node is selected.

**Root cause**
- The canvas container’s React `onKeyDown` can be bypassed by other focusable controls/overlays.

**Solution**
- `web/hooks/use-flowlike-global-enter-tab.ts` captures Enter/Tab at the **window level** (capture phase) when Flow-like mode is active,
  ignores real form fields, and calls the same create-sibling/create-child logic.

If you touch `NexusCanvas` keyboard handling or the markdown parser, re-check these invariants.

