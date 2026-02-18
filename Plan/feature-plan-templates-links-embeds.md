# Plan: Templates, Deep Links, Vision Card Embeds, and `test` File Type

This document is an implementation plan for building the following NexusMap features:

- **Templates** (whole-doc + fragments) with **variables**, **append-only apply**, and a required **rendered preview** step.
- **Note↔Note deep linking** to a specific **block/embed id** (not only file-level linking).
- **Vision card embeds in Notes** (MVP: **thumbnail only**, targeting a specific card).
- **Refactor “Tests” into a first-class file kind**: new workspace `DocKind = 'test'`, migrating from legacy diagram-embedded `testing-store`.

The plan is grounded in existing repo architecture:

- All docs persist canonical markdown in **`Y.Text('nexus')`** and are snapshot-saved to localStorage (and Supabase `files.content` in hosted mode).
- Notes already support structured blocks via fenced code blocks (`nexus-embed`, `nexus-table`, `nexus-test`, etc.).
- Vision is stored as a fenced snapshot (`visionjson`), and **cards** are `nxcard` shapes that may include `props.thumb` (PNG data URL or URL).

---

## Goals and non-goals

### Goals

- **Portable templates**: templates are plain text (Markdown + fenced JSON), easy to export/import, diff, and share.
- **Safe apply UX**: templates must **preview rendered output** before committing; apply should be **append/merge** (not replace) by default.
- **Deep references**: notes can link to a specific “thing” inside another note; embeds can target a specific vision card.
- **Separation of concerns**: tests become their own file kind, reducing coupling to diagram markdown structure.

### Non-goals (initially)

- No full semantic “DSL” that replaces snapshot JSON for grid/vision.
- No “perfectly stable deep linking to arbitrary prose” on day 1 (we start with block/embed ids that already exist).
- No public marketplace implementation in MVP (we design for it and implement later).

---

## Repo primitives (current touchpoints)

### File kinds and routing

- File kinds: `DocKind = 'diagram' | 'note' | 'grid' | 'vision'` in `web/lib/doc-kinds.ts`
- Editor routing: `web/components/EditorRouter.tsx` reads `?file=<id>` and chooses editor by `kind`.

### Persistence

- Canonical markdown stored in `Y.Text('nexus')` for all file kinds.
- Seeding + debounced snapshots handled by:
  - `web/hooks/use-yjs-nexus-text-persistence.ts`
- Local snapshots stored under:
  - `web/lib/local-doc-snapshots.ts`

### Existing note block embeds (important because they already have IDs)

- `nexus-embed` block:
  - UI node: `web/components/note/tiptap/nodes/NexusEmbedNode.tsx`
  - Renderer: `web/components/note/embeds/NexusEmbedBlock.tsx`
- `nexus-test` block:
  - UI node: `web/components/note/tiptap/nodes/NexusTestNode.tsx`
  - Renderer: `web/components/note/embeds/NexusTestBlock.tsx`
- `nexus-table` block:
  - analogous pattern (not repeated here)

### Vision card thumb storage (bloat + embed source)

- Vision snapshot codec: `web/lib/visionjson.ts`
- Vision cards are `nxcard` shapes:
  - `web/components/vision/v2/tldraw/shapes/NxCardShapeUtil.tsx`
  - card props include `thumb?: string` and nested `tileSnapshot?: string`.

### Tests today (legacy)

- Stored inside **diagram markdown** as ` ```testing-store`:
  - `web/lib/testing-store.ts`
- Diagram testing UI:
  - `web/components/TestingCanvas.tsx`
- Notes embed tests via ` ```nexus-test`:
  - `web/components/note/embeds/NexusTestBlock.tsx`

---

## Feature 1: Vision card embeds in Notes (thumbnail only)

### Desired UX

- In a note, insert an embed that targets **a specific card** in a **specific vision file**.
- Render a **thumbnail only** (MVP).
- Provide an action to open the vision file and focus/select the card.

### Data model (embed JSON)

Extend the embed system with a new kind.

#### Proposed `nexus-embed` JSON for vision cards

```json
{
  "id": "embed-<uuid>",
  "kind": "visionCard",
  "fileId": "<visionFileId>",
  "cardId": "<tldrawShapeId>"
}
```

Notes:
- `id` is the embed block id (already required by existing embeds for comment targeting).
- `fileId` selects the source doc (local or Supabase).
- `cardId` must match the `nxcard` shape id inside the vision snapshot.

### Implementation plan

- **1. Spec update**: extend `NexusEmbedSpec` in `web/components/note/embeds/NexusEmbedBlock.tsx` to include `kind:'visionCard'`.
- **2. File selection UI**:
  - Update embed link modal to allow choosing a **vision file** and then a **card**.
  - Source of files: `useWorkspaceFiles({ kinds: [...] })`.
  - Card listing: parse `visionjson` from the target file’s `Y.Text('nexus')`, inspect snapshot document records and filter `type === 'nxcard'`.
- **3. Render**:
  - In `NexusEmbedBlock`, load remote doc via `useRemoteNexusDoc` (pattern already used).
  - Parse `visionjson` with `loadVisionDoc(...)` or direct `extractVisionJsonPayload + parseVisionJsonPayload`.
  - Find `nxcard` with `id === cardId`.
  - Read `thumb` from `shape.props.thumb`.
  - Render:
    - Image (if `thumb` exists)
    - fallback placeholder if missing
    - “Open in Vision” button → route to `/editor?file=<fileId>` and pass `cardId` in query (e.g. `&focusCard=<cardId>`).
- **4. Focus behavior (best-effort)**:
  - In Vision editor, read `focusCard` from URL and select/zoom to that card on mount.

### Risks and mitigations

- **Thumb may be absent or too large**: render placeholder and encourage externalized thumbs later.
- **Card id stability**: tldraw IDs are stable within snapshot; duplication/cloning should preserve uniqueness.

---

## Feature 2: Note↔Note linking with deep targets (block/embed ids)

### Desired UX

- Link to another note by file **and** to a **specific content target** inside that note.
- MVP deep targets:
  - IDs that already exist for embedded blocks (`nexus-embed.id`, `nexus-test.id`, `nexus-table.id`).
- Future: add anchors for arbitrary prose blocks if needed.

### Data model options

We support two complementary mechanisms:

1) **Inline deep link in text** (clickable link in prose)
2) **Block-level embed** (renders a referenced block or snippet from another note)

### Inline link syntax (proposal)

Use bracket-marker syntax consistent with existing inline comments:

```
[[note:<fileId>#<blockId>]]Label[[/note]]
```

Example:

```
See [[note:2d6f...#embed-9c3a]]the system flow embed[[/note]] for details.
```

### Block-level “note block embed” (optional but recommended)

Extend `nexus-embed` with a new kind:

```json
{
  "id": "embed-<uuid>",
  "kind": "noteBlock",
  "fileId": "<noteFileId>",
  "blockId": "<embedId>"
}
```

This would render (read-only) the target block from the other note.

### Implementation plan

#### 1) Define what a “blockId” means (MVP)

- Treat blockId as the `id` inside existing note fenced blocks:
  - `nexus-embed` JSON has `id`
  - `nexus-test` JSON has `id`
  - `nexus-table` JSON has `id`

This means “deep linking” is immediately useful without building a full block-id system for every paragraph.

#### 2) Parsing + serialization (markdown codec)

- Update `web/components/note/tiptap/markdownCodec.ts`:
  - Parse inline `[[note:...]]...[[/note]]` into a new link mark (`noteLink`) with attrs `{ fileId, blockId? }`.
  - Serialize it back to the same bracket format.

#### 3) Click navigation

- On click, route to `/editor?file=<fileId>`.
- After the note opens, scroll/highlight:
  - Find the first block with matching `blockId` (embed block id).
  - Highlight by adding a temporary CSS class on the node view wrapper (all embed nodes already render wrappers).

#### 4) Insert UI (slash + picker)

- Add a slash command (e.g. `/link`) that opens a file picker for notes and then a block picker for that note’s embed ids.
- Reuse `useWorkspaceFiles({ kinds:['note'] })`.
- For block picker, read remote note markdown and scan for `nexus-*` fences extracting JSON `id`s.

### Risks and mitigations

- **Embed id collisions**: enforce ids are UUID-like on creation; treat duplicates as “first match” and warn.
- **Deep linking only works for embed blocks initially**: document clearly; add anchors later if needed.

---

## Feature 3: Templates (variables, preview, append-only apply)

### Key requirements

- Templates are **Markdown** (with fenced JSON) so they can be stored, shared, diffed.
- Apply must show a **rendered preview** before commit.
- Applying to an existing doc must **append/merge**, not replace.

### Template packaging

Store templates as normal workspace files in a “Templates” folder, but mark them with a clear header fence.

#### Proposed template header

````markdown
```nexus-template
{
  "version": 1,
  "name": "Create/Edit Item Flow (Snippet)",
  "targetKind": "diagram",
  "mode": "appendFragment",
  "fragmentKind": "diagramTreeSnippet",
  "vars": [
    { "name": "item", "label": "Item name", "default": "Application" }
  ]
}
```
````

Template body is the payload (markdown to insert or use as file seed).

### Variable substitution

- Placeholder: `{{item}}`
- Optional transforms:
  - `{{item|slug}}` (lowercase + hyphens)
  - `{{item|upper}}`, `{{item|lower}}`

Keep transforms minimal and deterministic.

### Preview (render-only)

Before Apply, show:

- Template metadata (name, target kind, vars)
- A read-only **rendered preview** of what will be appended/created
- “Apply” and “Cancel”

Preview implementation notes:

- **Note templates**: render markdown using the note markdown renderer path.
- **Grid templates**: render a grid summary preview:
  - if fragment: show table/range/cards preview (mini table)
  - optionally allow “Raw markdown” toggle for debugging (not required)
- **Vision templates**: show a summary, and if card-based fragments are added later, show thumb previews.

### Apply behavior (append-only)

Templates have two primary application modes:

- **`createFile`**: template generates the initial markdown for a new file of `targetKind`.
- **`appendFragment`**: template generates a fragment that is **merged/appended** into an existing file of `targetKind`.

In MVP, “apply template” in an existing document must **not replace** the current content. It either:

- appends new blocks (note),
- merges fragment data into the existing snapshot (grid),
- inserts a tree snippet (diagram), or
- (later) appends a fragment into vision snapshots if/when we support vision fragments.

---

## Feature 4: Template fragments (explicit scope by kind)

This section defines which parts are templatised, and how partial templates should behave.

### Diagram (`diagram`): snippet templates only (MVP)

**Do not** attempt full-fidelity “entire diagram” templates in MVP because advanced metadata blocks often reference fragile `node-<lineIndex>` ids.

#### Supported fragment kind

- `fragmentKind: "diagramTreeSnippet"`

#### Payload (template body)

Template body is **tree lines only** (2 spaces per indent level), with variables:

```txt
Create {{item}} #flow# <!-- tags:actor-applicant -->
  Validate {{item}} #flow# <!-- tags:actor-system -->
  Save {{item}} #flow# <!-- tags:actor-system -->
Edit {{item}} #flow# <!-- tags:actor-applicant -->
  Load {{item}} #flow# <!-- tags:actor-system -->
  Update fields #flow# <!-- tags:actor-applicant -->
  Save changes #flow# <!-- tags:actor-system -->
```

#### Append strategy

When applying to an existing diagram:

- Choose insertion location:
  - default: **append at end** of the markdown tree area (before any `---` separator), or
  - if a node is selected: append **as children** of that node (indent = selected level + 1).
- Insert lines; **do not generate** `flow-nodes`, `process-node-type-*`, swimlane placement, etc. in MVP.

Later phase: offer “Generate/repair flow metadata” action after insertion.

---

### Note (`note`): fragments by blocks or inline range

#### Supported fragment kinds

- `fragmentKind: "noteBlocks"` (selected block(s))
- `fragmentKind: "noteInline"` (selected inline text range)

#### Fragment export (MVP)

We export fragments as Markdown strings (not TipTap JSON) to keep templates portable.

- **Blocks**: serialize the selected blocks using the existing note markdown serializer and store that markdown as the template body.
- **Inline range**: store selected text as markdown and treat it as a paragraph when applying.

#### Apply strategy (append-only)

- Apply always appends:
  - blocks → insert as new blocks at end
  - inline range → append as a paragraph (or append to end of current paragraph if desired, but still append-oriented)

#### Deep-link compatibility

When exporting `noteBlocks`, preserve existing embed blocks and their JSON `id` fields. On apply, **regenerate embed ids** by default to avoid collisions (with an opt-out “keep ids” switch for power users).

---

### Grid (`grid`): fragments by table, range, cards

Grid is snapshot-based (`gridjson`) but we can still support partial templates by defining fragment payloads that merge cleanly.

#### Supported fragment kinds

- `fragmentKind: "gridTable"`
- `fragmentKind: "gridRange"`
- `fragmentKind: "gridCards"`

#### Fragment payload format (proposal)

Store fragment payload as JSON inside the template body under a dedicated fence:

````markdown
```grid-fragment
{
  "version": 1,
  "kind": "gridTable",
  "sheetIdHint": "sheet-1",
  "data": { }
}
```
````

Notes:
- `sheetIdHint` is best-effort; on apply, choose target sheet explicitly in UI.

#### `gridTable` fragment: single table only

Export:

- Table definition (`GridTableV1`)
- The referenced row/col id lists for the table
- The cell values within the table bounds (sparse)

Apply (merge):

- Pick target sheet + insertion strategy:
  - **append as new table** on target sheet
- Handle id collisions:
  - Generate new `tbl-*` id if conflict
  - If adding new rows/cols, generate new `r-*`/`c-*` ids and append them to the sheet’s `rows`/`columns`
- Write cells using `${rowId}:${colId}` keys.

#### `gridRange` fragment: rectangular cell range

Export:

- width/height in cells
- sparse list of non-empty cells with relative offsets, e.g. `{ dr, dc, value }`

Apply:

- Ask for anchor location (start row/col) or default to “first empty area”.
- Ensure target rows/cols exist (create if needed).
- Write values into sparse `cells`.

#### `gridCards` fragment: selected cards only

Export:

- Selected `GridCardV1[]` (content + spans)
- Optionally normalize positions relative to the top-left selected card (so apply can offset)

Apply:

- Place cards at an offset from a chosen anchor cell (default: below existing cards).
- Regenerate card ids to avoid collisions.

---

## Feature 5: Template apply UX (preview-first)

### Apply flow (common)

1) User selects a template (from templates folder / template picker).
2) User fills variable form.
3) App renders a **preview** (read-only):
   - What will be created/added
   - Where it will be appended/merged
4) User clicks **Apply** → only then we mutate `Y.Text('nexus')` / seed snapshots.

### Where preview rendering lives

- Notes: reuse note markdown rendering components.
- Grid: render a minimal grid preview component:
  - tables/ranges shown as a small HTML table
  - cards shown as a list or mini layout
- Diagram snippet: show tree lines and a warning about metadata not generated.

---

## Feature 6: Tests refactor into a new file kind (`test`)

### Problem statement (current state)

- Tests live inside diagram markdown as ` ```testing-store` (per diagram doc).
- Notes embed tests via ` ```nexus-test` which references:
  - `testId` and optional `fileId` (diagram file).
- This couples tests to diagram-specific storage, and makes sharing/reuse harder.

### Target state

- Add a new workspace file kind: **`test`**.
- A test file is import/exportable Markdown containing a versioned payload, e.g.:

````markdown
```nexus-doc
{ "kind": "test", "version": 1 }
```

```testjson
{
  "version": 1,
  "name": "Eligibility happy path",
  "sourceDiagramFileId": "<fileId>",
  "flowRootId": "<node-id-or-stable-anchor>",
  "flowNodeId": "<node-id>",
  "createdAt": 1710000000000
}
```
````

Notes:
- In MVP we can keep `flowRootId`/`flowNodeId` semantics similar to today (even if node ids are fragile) and then evolve toward stable anchors later (e.g. running numbers).

### Impacted areas

- **Kinds**:
  - extend `DocKind` union and header-kind allowlist to include `'test'`.
- **Workspace**:
  - allow creating/opening `test` files in both local + Supabase modes.
- **EditorRouter**:
  - route kind `test` to a `TestEditorApp` (new).
- **Note embedding**:
  - update `nexus-test` embed spec to reference the **test file**, e.g. `{ id, testFileId }`.

### Migration strategy (incremental, safe)

1) Keep reading legacy `testing-store` from diagram docs for backward compatibility.
2) Add a “Migrate tests…” action in the testing UI:
   - For each legacy test in `testing-store`, create a new `test` file containing a `testjson` payload.
   - Keep legacy store until user confirms deletion.
3) Update note embeds:
   - When editing a `nexus-test` block, allow selecting from `test` files.
   - If an embed still uses legacy `{ fileId, testId }`, resolve it and offer one-click “Upgrade embed”.

### Refactor of current Testing UI

Today, `TestingCanvas` is a view within the diagram editor and expects tests in the same doc.

Target design:

- `TestEditorApp` renders:
  - a test runner view (reusing `TreeTestRunner` and `buildTreeTestModel`)
  - a source-diagram selector/link (the test needs a source diagram doc to run against)
- Diagram editor “Testing” view becomes:
  - either a launcher/browse view showing tests that reference this diagram, or
  - deprecated in favor of opening test files directly.

---

## Feature 7: Account-scoped templates and public publishing (later phases)

### Account-scoped templates (sync)

Goal: templates are available across projects/workspaces under your account.

Implementation options:

- **New Supabase table** `templates` keyed by `owner_id`:
  - `id`, `name`, `target_kind`, `mode`, `fragment_kind`, `vars_schema`, `content`, `visibility`
- Local-first caching to localStorage; sync when signed in.

### Public template library (publish + browse + install)

Goal: users can publish templates publicly and others can browse/install.

Requirements:

- Versioning: immutable published versions (`templateId@version`)
- Metadata: author, license, tags, target kinds
- Safety limits: size caps, validation (strict JSON fences), blocklist very large data URLs by default
- Install = clone into account templates (or into project templates folder)

---

## Feature 8: “Markdown guideline” templates

Your markdown authoring conventions can be shipped as templates:

- A **note template** that scaffolds how to document a feature (sections, checklists, prompts).
- A **diagram snippet template** that scaffolds a flow skeleton with variables (`{{item}}`, `{{actor}}`, etc.).

These templates should live in the Templates folder and be publishable later.

---

## Phased rollout (recommended order)

1) Project templates: `createFile` + `appendFragment`, variables, and rendered preview
2) Note deep links (`[[note:...]]`) + block-id highlighting
3) Vision card thumbnail embed (`kind:"visionCard"`)
4) Fragment exporters (grid table/range/cards; note blocks/inline)
5) New `test` file kind + migration from legacy `testing-store` + update note embeds
6) Account templates sync
7) Public template library

---

## Manual test checklist

- Templates:
  - Create new file from template (note/grid/vision).
  - Apply fragment template to existing note (blocks + inline) → appended content only.
  - Apply fragment template to existing grid (table/range/cards) → merged correctly, no data loss.
  - Preview always appears; cancel makes no changes.
- Note deep links:
  - Link to another note and open it.
  - Link to a blockId and scroll/highlight the target embed block.
- Vision card embed:
  - Embed a vision card; thumbnail renders; missing thumb shows fallback.
  - “Open in Vision” navigates and focuses card.
- Tests:
  - Create new `test` file and run against a source diagram.
  - Migrate legacy `testing-store` → creates `test` files; legacy still works until removed.

