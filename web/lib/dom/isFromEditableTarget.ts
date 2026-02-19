export function isFromEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  try {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el.isContentEditable
    ) {
      return true;
    }
    return !!el.closest?.('input,textarea,select,[contenteditable="true"]');
  } catch {
    return false;
  }
}

