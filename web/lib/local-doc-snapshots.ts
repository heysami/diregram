const PREFIX = 'nexusmap.fileSnapshot.v1';

function keyForFileId(fileId: string): string {
  return `${PREFIX}:${fileId}`;
}

export function loadFileSnapshot(fileId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(keyForFileId(fileId));
  } catch {
    return null;
  }
}

export function saveFileSnapshot(fileId: string, markdown: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyForFileId(fileId), markdown);
  } catch {
    // ignore
  }
}

