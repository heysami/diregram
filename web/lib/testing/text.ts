export function singleLine(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

