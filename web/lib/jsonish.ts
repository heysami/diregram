export function parseJsonish(raw: string): unknown | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Safe, common repairs:
    // - strip JS comments
    // - remove trailing commas
    // - quote unquoted keys
    let s = trimmed;
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');
    s = s.replace(/(^|\s)\/\/.*$/gm, '');
    s = s.replace(/,\s*([}\]])/g, '$1');
    s = s.replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, '$1"$2":');
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
}

