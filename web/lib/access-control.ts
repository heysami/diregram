function normalizeEmail(s: string) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Returns true if the provided access JSON allows `edit` for the userEmail.
 *
 * Shape expected:
 * `{ people: Array<{ email: string, role: 'edit' | 'view' | ... }> }`
 */
export function canEditFromAccess(access: unknown, userEmail: string | null): boolean {
  if (!access || typeof access !== 'object') return false;
  const people = (access as { people?: unknown }).people;
  if (!Array.isArray(people) || people.length === 0) return false;
  if (!userEmail) return false;
  const e = normalizeEmail(userEmail);
  if (!e) return false;
  return people.some((p) => {
    if (!p || typeof p !== 'object') return false;
    const rec = p as { email?: unknown; role?: unknown };
    const email = typeof rec.email === 'string' ? normalizeEmail(rec.email) : '';
    const role = typeof rec.role === 'string' ? String(rec.role) : 'view';
    return !!email && email === e && role === 'edit';
  });
}

