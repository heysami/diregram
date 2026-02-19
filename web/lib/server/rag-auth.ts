export function hasValidRagApiKey(request: Request): boolean {
  const expected = process.env.RAG_API_KEY;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)\s*$/i);
  if (!m) return false;
  return m[1] === expected;
}

