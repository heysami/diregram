export function isStringArrayEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

/**
 * Move an item (by id) to the position of another id, preserving relative order of others.
 */
export function moveIdInArray(list: string[], fromId: string, toId: string): string[] {
  if (fromId === toId) return list;
  const fromIndex = list.indexOf(fromId);
  const toIndex = list.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return list;
  const next = [...list];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, fromId);
  return next;
}

