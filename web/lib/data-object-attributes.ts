export type DataObjectAttribute = {
  id: string;
  name: string;
  sample?: string;
};

type DataObjectDataShape = {
  attributes?: unknown;
  [k: string]: unknown;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

export function loadDataObjectAttributes(data: unknown): DataObjectAttribute[] {
  if (!isRecord(data)) return [];
  const raw = (data as DataObjectDataShape).attributes;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((a): DataObjectAttribute | null => {
      if (!isRecord(a)) return null;
      const id = typeof a.id === 'string' ? a.id : '';
      const name = typeof a.name === 'string' ? a.name : '';
      const sample = typeof a.sample === 'string' ? a.sample : undefined;
      if (!id || !name) return null;
      return { id, name, sample };
    })
    .filter((x): x is DataObjectAttribute => x !== null);
}

export function upsertDataObjectAttributes(data: unknown, attrs: DataObjectAttribute[]): unknown {
  const base: Record<string, unknown> = isRecord(data) ? { ...(data as Record<string, unknown>) } : {};
  base.attributes = attrs;
  return base;
}

export function newDataObjectAttributeId(): string {
  // Client-only, created on explicit user action (safe for hydration).
  return `attr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

