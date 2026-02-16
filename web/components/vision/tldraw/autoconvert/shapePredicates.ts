'use client';

export function isShapeRecordId(rid: string) {
  return String(rid || '').startsWith('shape:');
}

export function isDragging(editor: any) {
  try {
    return !!editor?.inputs?.getIsDragging?.();
  } catch {
    return false;
  }
}

export function getId(rec: any) {
  return String(rec?.id || '');
}

