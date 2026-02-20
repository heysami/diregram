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
  const name = typeof r['name'] === 'string' ? String(r['name']) : '';
  const sourceFileId = typeof r['sourceFileId'] === 'string' ? String(r['sourceFileId']) : '';
  const flowRootId = typeof r['flowRootId'] === 'string' ? String(r['flowRootId']) : '';
  const flowNodeId = typeof r['flowNodeId'] === 'string' ? String(r['flowNodeId']) : '';
  if (!name.trim()) return null;
  if (!sourceFileId.trim()) return null;
  if (!flowRootId.trim()) return null;
  if (!flowNodeId.trim()) return null;
  const createdAt = typeof r['createdAt'] === 'number' && Number.isFinite(r['createdAt']) ? Number(r['createdAt']) : undefined;
  const updatedAt = typeof r['updatedAt'] === 'string' ? String(r['updatedAt']) : undefined;
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
  // Support indented fences and trailing spaces: many editors nest blocks under list items.
  const m = text.match(/^[ \t]*```testjson[^\n]*\n([\s\S]*?)\n[ \t]*```/m);
  if (!m) return null;
  const payload = String(m[1] || '').trim();
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

