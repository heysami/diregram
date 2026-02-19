export function parseJsonl<T = unknown>(input: string): T[] {
  const lines = String(input || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

