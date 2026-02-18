export type LastGlobalPublishRecord = {
  id: string;
  name: string;
  atIso: string;
};

function storageKey(fileId: string): string {
  return `nx:lastGlobalPublish:${fileId}`;
}

export function loadLastGlobalPublishRecord(fileId: string | null | undefined): LastGlobalPublishRecord | null {
  if (!fileId) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== 'object') return null;
    const id = typeof parsed.id === 'string' ? parsed.id : '';
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    const atIso = typeof parsed.atIso === 'string' ? parsed.atIso : '';
    if (!id || !atIso) return null;
    return { id, name, atIso };
  } catch {
    return null;
  }
}

export function saveLastGlobalPublishRecord(fileId: string | null | undefined, record: LastGlobalPublishRecord): void {
  if (!fileId) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(fileId), JSON.stringify(record));
  } catch {
    // ignore
  }
}

