import * as Y from 'yjs';

export type TestingTest = {
  id: string;
  name: string;
  /** Flow tab root id at creation time (best-effort; ids are line-index based) */
  flowRootId: string;
  /** Flow node id used as source (must exist in flowtab-process-references map) */
  flowNodeId: string;
  createdAt: number;
};

export type TestingStore = {
  nextId: number;
  tests: TestingTest[];
};

const BLOCK_TYPE = 'testing-store';

const DEFAULT_STORE: TestingStore = {
  nextId: 1,
  tests: [],
};

function findBlock(text: string): RegExpMatchArray | null {
  return text.match(new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n([\\s\\S]*?)\\n\\\`\\\`\\\``));
}

function upsertBlock(text: string, json: unknown): string {
  const dataBlock = `\`\`\`${BLOCK_TYPE}\n${JSON.stringify(json, null, 2)}\n\`\`\``;
  const re = new RegExp(`\\\`\\\`\\\`${BLOCK_TYPE}\\n[\\s\\S]*?\\n\\\`\\\`\\\``);
  if (re.test(text)) return text.replace(re, dataBlock);

  const separatorIndex = text.indexOf('\n---\n');
  if (separatorIndex !== -1) {
    return text.slice(0, separatorIndex + 5) + '\n' + dataBlock + text.slice(separatorIndex + 5);
  }
  return text + (text.endsWith('\n') ? '' : '\n') + '\n---\n' + dataBlock;
}

function normalizeStore(raw: unknown): TestingStore {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STORE };
  const rec = raw as Record<string, unknown>;
  const nextId = typeof rec.nextId === 'number' && Number.isFinite(rec.nextId) ? Math.max(1, rec.nextId) : 1;
  const testsRaw = Array.isArray(rec.tests) ? rec.tests : [];
  const tests: TestingTest[] = (testsRaw as unknown[])
    .map((t): TestingTest | null => {
      if (!t || typeof t !== 'object') return null;
      const r = t as Record<string, unknown>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
      if (typeof r.flowRootId !== 'string' || typeof r.flowNodeId !== 'string') return null;
      const createdAt = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : Date.now();
      return {
        id: r.id,
        name: r.name,
        flowRootId: r.flowRootId,
        flowNodeId: r.flowNodeId,
        createdAt,
      };
    })
    .filter((x): x is TestingTest => x !== null);

  return { nextId, tests };
}

export function loadTestingStore(doc: Y.Doc): TestingStore {
  const yText = doc.getText('nexus');
  const text = yText.toString();
  const match = findBlock(text);
  if (!match) return { ...DEFAULT_STORE };
  try {
    const parsed = JSON.parse(match[1]);
    return normalizeStore(parsed);
  } catch {
    return { ...DEFAULT_STORE };
  }
}

export function saveTestingStore(doc: Y.Doc, store: TestingStore): void {
  const yText = doc.getText('nexus');
  const current = yText.toString();
  const next = upsertBlock(current, store);
  if (next === current) return;
  doc.transact(() => {
    yText.delete(0, yText.length);
    yText.insert(0, next);
  });
}

