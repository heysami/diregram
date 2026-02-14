'use client';

export type TestingIndex = {
  tests: Array<{ id: string; name: string }>;
};

export function buildTestingIndexFromMarkdown(markdown: string): TestingIndex {
  const m = String(markdown || '').match(/```testing-store\n([\s\S]*?)\n```/);
  if (!m) return { tests: [] };
  try {
    const parsed = JSON.parse(String(m[1] || '{}'));
    const testsRaw = Array.isArray(parsed?.tests) ? parsed.tests : [];
    const tests = testsRaw
      .map((t: any) => ({ id: String(t?.id || '').trim(), name: String(t?.name || '').trim() }))
      .filter((t: any) => t.id && t.name);
    tests.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { tests };
  } catch {
    return { tests: [] };
  }
}

