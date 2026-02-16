## Vision editor performance / freeze-avoidance guide

This repo previously hit a hard Chrome hang (`RESULT_CODE_HUNG`) when opening the Vision “vector” tile editor. The root cause was **very high-frequency work on the main thread triggered by tldraw lifecycle/events**, plus a few “large-string” footguns.

### The big gotchas (checklist)

- **tldraw store listeners**
  - **Do not** listen to all store changes and do heavy work (snapshot + `JSON.stringify`) on every event.
  - Prefer: `store.listen(cb, { scope: 'document' })` so camera/selection/session changes don’t trigger persistence.

- **Stable props to `<Tldraw />`**
  - Unstable function/array props can cause repeated editor re-inits/mount churn.
  - Keep these **stable**:
    - `shapeUtils` (memoize once)
    - `getShapeVisibility` (useCallback)
    - `onMount` (useCallback)
  - If you see repeated `onMount` calls, suspect **prop identity churn** first.

- **Don’t render huge raw markdown in the DOM**
  - Even a collapsed `<details>` can keep the heavy `<pre>` content in the DOM and freeze the tab.
  - Use an explicit toggle + preview truncation.

- **Don’t pretty-print large JSON blocks**
  - `JSON.stringify(doc, null, 2)` balloons size and makes save/parse loops much slower.
  - Use compact JSON for `visionjson` persistence.

- **Avoid decoding hundreds of thumbnail data URLs by default**
  - Thumbnails should be opt-in or lazy, and capped in size.

### Where the “freeze prevention” lives now

- **tldraw lifecycle/persistence**: `components/vision/tldraw/useTldrawTileController.ts`
- **VisionDoc parsing (Yjs text → VisionDoc)**: `hooks/use-vision-doc-state-from-yjs.ts` (uses `visionjson.worker.ts`)
- **VisionDoc writing (VisionDoc → Yjs text)**: `hooks/use-vision-doc-writer-to-yjs.ts`

### Debugging symptoms

- **Chrome shows `RESULT_CODE_HUNG`**: look for a hot loop (mount churn, broad listeners, render loop).
- **Endless “refresh / reconnect” feel**: can be caused by rapid remounts that tear down and recreate Yjs/tldraw repeatedly.

