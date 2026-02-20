export const NOTE_SLASH_EVENT = 'note:slash' as const;

// Keep as constants so UI + extension never drift.
export const SLASH_MENU_ROOT_ATTR = 'data-note-slash-menu' as const;
export const SLASH_MENU_ROOT_SELECTOR = `[${SLASH_MENU_ROOT_ATTR}="1"]` as const;

