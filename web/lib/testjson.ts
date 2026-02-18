type JsonObject = Record<string, unknown>;

export type TestDocV1 = {
  version: 1;
  name: string;
  /** Diagram file id the test runs against. */
  sourceFileId: string;
  /** Flow tab root id at creation time (best-effort; ids are line-index based) */
  flowRootId: string;
  /** Flow node id used as source (must exist in flowtab-process-references map) */
  flowNodeId: string;
  createdAt?: number;
  updatedAt?: string;
};

export type TestDoc = TestDocV1;

function normalize(markdown: string): string {
  return String(markdown || '').replace(/\r\n/g, '\n');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coerceDoc(x: unknown): TestDoc | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as JsonObject;
  if (r.version !== 1) return null;
  const name = typeof (r as any).name === 'string' ? String((r as any).name) : '';
  const sourceFileId = typeof (r as any).sourceFileId === 'string' ? String((r as any).sourceFileId) : '';
  const flowRootId = typeof (r as any).flowRootId === 'string' ? String((r as any).flowRootId) : '';
  const flowNodeId = typeof (r as any).flowNodeId === 'string' ? String((r as any).flowNodeId) : '';
  if (!name.trim()) return null;
  if (!sourceFileId.trim()) return null;
  if (!flowRootId.trim()) return null;
  if (!flowNodeId.trim()) return null;
  const createdAt = typeof (r as any).createdAt === 'number' && Number.isFinite((r as any).createdAt) ? Number((r as any).createdAt) : undefined;
  const updatedAt = typeof (r as any).updatedAt === 'string' ? String((r as any).updatedAt) : undefined;
  return {
    version: 1,
    name: name.trim(),
    sourceFileId: sourceFileId.trim(),
    flowRootId: flowRootId.trim(),
    flowNodeId: flowNodeId.trim(),
    ...(createdAt !== undefined ? { createdAt } : null),
    ...(updatedAt ? { updatedAt } : null),
  };
}

function getTestJsonFullBlockRegex(): RegExp {
  return /```testjson\s*\n[\s\S]*?\n```/m;
}

export function extractTestJsonPayload(markdown: string): string | null {
  const text = normalize(markdown);
  const start = text.indexOf('```testjson');
  if (start < 0) return null;
  const afterFenceNl = text.indexOf('\n', start);
  if (afterFenceNl < 0) return null;
  const endFence = text.indexOf('\n```', afterFenceNl + 1);
  if (endFence < 0) return null;
  const payload = text.slice(afterFenceNl + 1, endFence).trim();
  return payload || null;
}

export function parseTestJsonPayload(payload: string): TestDoc | null {
  if (!payload || !payload.trim()) return null;
  const parsed = safeJsonParse(payload.trim());
  return coerceDoc(parsed);
}

export function loadTestDoc(markdown: string): { doc: TestDoc | null; source: 'testjson' | 'missing' | 'invalid' } {
  const payload = extractTestJsonPayload(markdown);
  if (!payload) return { doc: null, source: 'missing' };
  const doc = parseTestJsonPayload(payload);
  if (!doc) return { doc: null, source: 'invalid' };
  return { doc, source: 'testjson' };
}

export function saveTestDoc(markdown: string, doc: TestDoc): string {
  const text = normalize(markdown);
  const payload = JSON.stringify(doc, null, 2);
  const block = ['```testjson', payload, '```'].join('\n');
  if (getTestJsonFullBlockRegex().test(text)) {
    return text.replace(getTestJsonFullBlockRegex(), block);
  }
  const needsLeadingNewline = text.length > 0 && !text.endsWith('\n');
  const sep = text.trim().length === 0 ? '' : '\n\n';
  return text + (needsLeadingNewline ? '\n' : '') + sep + block + '\n';
}

