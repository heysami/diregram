## Vision v2 (canvas + cards) module

This folder contains the **Vision v2** feature: a single tldraw canvas that supports **cards** which open a nested vector editor and display the nested editor’s thumbnail back on the card.

### Design goals
- **Modular**: keep all v2-specific logic under `web/components/vision/v2/`.
- **Stable main-canvas interactions**: avoid global capture listeners and auto-conversion logic that can break stock `draw` / `arrow` tool behavior.
- **Backward-compatible import paths**: legacy files in `web/components/vision/*` and `web/components/vision/tldraw/*` re-export the v2 implementations.

### Key invariants (do not break)
- **Main canvas** (`VisionCanvas`): uses stock tldraw pointer behavior; no custom pointer handlers installed.
- **Cards** are `nxcard` shapes whose `props` include:\n  - `tileSnapshot` (JSON string of a nested tldraw snapshot)\n  - `thumb` (PNG data URL)\n- **Nested editor** exports a **256px** thumbnail from the `thumb` core frame and writes it back to the selected card.

### Public API
Use the barrel exports from `web/components/vision/v2/index.ts`.

