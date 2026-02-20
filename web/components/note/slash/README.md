## Note slash menu architecture

This folder is structured so future features don’t accidentally split the slash-menu logic across multiple places.

- `tiptap/slashMenuExtension.ts`
  - **Only responsibility**: detect the `/` key in ProseMirror and emit the `note:slash` event with `{x,y,pos}`.
- `useSlashMenuController.ts`
  - **Single source of truth** for menu state (open/query/selection) and global interactions:
    - typing updates query (without inserting into the document)
    - arrows/enter run the selected command
    - escape / outside click closes
    - selection moving to another block closes
- `SlashMenu.tsx`
  - Presentational UI + viewport-aware positioning. Uses `SLASH_MENU_ROOT_ATTR` so outside-click logic is stable.

