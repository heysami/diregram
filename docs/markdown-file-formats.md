# NexusMap Markdown File Formats: Grid, Note, Vision

This document describes **how NexusMap represents the `grid`, `note`, and `vision` file types in Markdown**, with an emphasis on:

- **Importability**: what you must include so a copied Markdown file can be imported and reconstruct the file.
- **Non-bloat**: what metadata is unnecessary because the app can infer/regenerate it.
- **Semantic meaning**: what the app can infer from Markdown *structure* vs what must be encoded as structured data.

> Scope note: this doc is about the **three file types** (`grid`, `note`, `vision`). The app also has a separate “diagram” markdown importer with a `---` separator and many metadata blocks; that is intentionally not covered here.

---

## Shared conventions (applies to all 3)

### 1) Optional doc header (`nexus-doc`)

NexusMap supports an optional top-of-file header block:

````markdown
```nexus-doc
{
  "kind": "grid",
  "version": 1
}
```
````

- **What it does**: makes the file self-describing (`kind` + header `version`).
- **Required?** No. Current loaders don’t require it to reconstruct `grid`/`vision`/`note`.
- **Bloat judgement**: **not bloat**; it’s small and useful for portability and tooling.

Supported `kind` values: `"diagram" | "note" | "grid" | "vision"`.

### 2) Markdown outside the canonical payload

- For **`grid`** and **`vision`**, reconstruction comes from a **single fenced JSON block**. Any other Markdown in the file is effectively **human notes** (not used to reconstruct the core state).
- For **`note`**, the Markdown is the **document itself**.

---

## Grid files (`grid`)

### Canonical representation

A `grid` file is a Markdown document containing a fenced JSON block named `gridjson`:

````markdown
```gridjson
{ "...": "..." }
```
````

NexusMap loads the grid by searching for this block and coercing it into the `GridDocV1` schema (`version: 1`).

### Minimal required content (to reconstruct a grid)

To be recognized as a valid grid document (instead of falling back to a default blank grid), the `gridjson` must include:

- **Required**
  - `version: 1`
  - `sheets: [...]` with **at least one** sheet that has a non-empty `id` string

Everything else is best-effort coerced and/or defaulted (for example, missing rows/cols will be padded to minimum defaults).

### Minimal copy/paste-safe grid file template

This is the smallest “valid + importable” grid file (empty grid, but reconstructs as a grid document):

````markdown
```nexus-doc
{ "kind": "grid", "version": 1 }
```

```gridjson
{
  "version": 1,
  "activeSheetId": "sheet-1",
  "sheets": [
    { "id": "sheet-1" }
  ]
}
```
````

### What is necessary vs bloat (judgement)

Because `gridjson` is a **snapshot**, most “bloat vs not” decisions come down to whether you are storing:

- **Meaningful state** (must keep to preserve fidelity), or
- **Defaults / derived state** (often safe to omit if generating by hand or via tooling).

#### Usually meaningful (keep if you want fidelity)

- **Cell content**: `sheets[].grid.cells` (sparse map of cell values)
- **Row/column ordering**: `sheets[].grid.rows` and `sheets[].grid.columns` (IDs and order)
- **Tables**: `sheets[].grid.tables` (header rows/cols, filters, hidden rows/cols, etc.)
- **Cards**: `sheets[].cards` (grid-aligned cards)
- **Database mode**: `sheets[].database` when using database-mode grids

#### Often unnecessary (can be omitted / minimized)

- **Default sizing**:
  - `columns[].width` and `rows[].height` are optional fields.
  - If you are not using custom sizing, omitting default widths/heights reduces noise.
- **Region value** (deprecated):
  - `regions[].value` is deprecated; the loader migrates it into cell values and clears it.
  - If you’re authoring by hand, prefer leaving region `value` empty and store values per-cell.

### Legacy compatibility

If `gridjson` is missing but the file contains legacy `tablejson`, NexusMap can convert it into a grid document on load.

---

## Vision files (`vision`)

### Canonical representation

A `vision` file is a Markdown document containing a fenced JSON block named `visionjson`:

````markdown
```visionjson
{"version":2, "tldraw": { /* snapshot */ } }
```
````

This is a **snapshot-based** format. The app intentionally stores it **compact** (no pretty-print) because tldraw snapshots can become large.

### Minimal required content (to reconstruct a vision document)

- **Required**
  - `version: 2`
- **Required for a non-empty canvas**
  - `tldraw` snapshot (the drawing lives inside `tldraw`)

If you omit `tldraw`, the file is still a valid (empty) vision doc.

### Minimal copy/paste-safe vision file template

Empty-but-valid vision doc:

````markdown
```nexus-doc
{ "kind": "vision", "version": 1 }
```

```visionjson
{"version":2}
```
````

### What is necessary vs bloat (judgement)

Vision is also snapshot-based, but it’s especially important to keep the Markdown payload **portable** by excluding per-user or cache state.

#### Necessary to preserve fidelity

- The **tldraw document snapshot** (shapes, props, metadata, and any nested editor/card state that is stored within the snapshot).
- Any **shape metadata** that encodes semantics (e.g., annotation roles, custom shape props). This belongs inside the snapshot, not in external Markdown structure.

#### Unnecessary / should not be stored in Markdown (the app can handle it)

- **Per-user session state** (camera position, selection state, temporary interaction UI).
- **Derived/cached rendering outputs** (raster caches, proxy outputs). These should be recomputed.

#### Optional (often bloat)

- `updatedAt`: best-effort timestamp; not required to reconstruct the canvas.

### Semantic meaning from Markdown structure (vision)

Markdown headings/lists/formatting are not used to reconstruct the canvas. Semantic meaning should be encoded via the **tldraw snapshot’s structure/meta**.

---

## Note files (`note`)

### Canonical representation

For notes, **the Markdown is the document**. NexusMap parses Markdown into its editor model (TipTap) and serializes back to Markdown.

### Supported “semantic” structures

Notes support normal Markdown structures (headings, paragraphs, lists, task items, blockquotes, fenced code blocks) *and* several NexusMap-specific blocks.

#### Inline range comments

Inline comments are represented directly in Markdown with bracket markers:

````markdown
This has a [[comment:c-1]]commented range[[/comment]].
````

- **Required for correctness**: the closing `[[/comment]]` must exist; otherwise it’s treated as literal text.

#### NexusMap-specific fenced blocks (typed content)

Notes support several special fenced blocks. The fence “language” defines a typed block, and the fence body is typically JSON:

- `nexus-embed` (JSON)
- `nexus-table` (JSON)
- `nexus-test` (JSON)
- `nexus-box` (JSON: `{ "title": string, "md": string }`)
- `nexus-toggle` (JSON: `{ "title": string, "open": boolean, "md": string }`)
- `nexus-columns` (JSON: `{ "columns": string[] }` where each string is Markdown)
- `nexus-tabs` (JSON: `{ "activeId": string, "tabs": [{ "id": string, "title": string, "md": string }] }`)

These are **real semantic meaning inferred from Markdown structure**: the app reads the fence type and interprets it as a specific block.

### Minimal copy/paste-safe note file template

````markdown
```nexus-doc
{ "kind": "note", "version": 1 }
```

## Example note

A normal paragraph.

- [ ] A task
- [x] A done task

Inline comment: [[comment:c-1]]this text[[/comment]].

```nexus-toggle
{
  "title": "Details",
  "open": true,
  "md": "Hidden **Markdown** here."
}
```
````

### What is necessary vs bloat (judgement)

Notes are the best fit for “constructable but not bloated” because the semantic structure is primarily normal Markdown.

- **Necessary**
  - Your Markdown content.
  - Only the NexusMap fences you actually use.
  - Inline comment markers only where comments exist.
- **Unnecessary / app-handled**
  - Cursor/selection/scroll/UI state.
  - Duplicate content (e.g., repeating tab bodies outside `nexus-tabs`).

---

## Quick comparison: importability and semantic inference

- **`note`**
  - **Importability**: very high (it’s just Markdown + a small set of typed fences)
  - **Semantic inference**: strong (headings/lists/tasks + typed fences are meaningful)
  - **Bloat risk**: moderate only if you overuse embedded JSON blocks

- **`grid`**
  - **Importability**: high if `gridjson` exists and is valid
  - **Semantic inference**: low from Markdown structure; semantics live in JSON
  - **Bloat risk**: high if you store lots of default snapshot state

- **`vision`**
  - **Importability**: high if `visionjson` exists and is valid
  - **Semantic inference**: low from Markdown structure; semantics live in the snapshot
  - **Bloat risk**: high due to snapshot size; mitigate by excluding session/caches

