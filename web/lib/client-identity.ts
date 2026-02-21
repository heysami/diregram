export type ClientIdentity = {
  id: string;
  name: string;
  /** Visual variant for retro UI (pattern fill class). */
  badgeClass: string;
};

const STORAGE_KEY = 'diregram.identity.v1';

function pickBadgeClass(seed: string): string {
  const options = ['mac-fill--dots-1', 'mac-fill--dots-2', 'mac-fill--hatch', 'mac-fill--hatch2', 'mac-fill--checker'];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function defaultNameFromId(id: string): string {
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || '0000';
  return `User ${short.toUpperCase()}`;
}

export function getOrCreateClientIdentity(): ClientIdentity {
  if (typeof window === 'undefined') {
    // SSR-safe fallback (should not really be used; app is client-heavy).
    const id = 'server';
    return { id, name: 'Server', badgeClass: pickBadgeClass(id) };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClientIdentity>;
      if (parsed.id && parsed.name) {
        return {
          id: parsed.id,
          name: parsed.name,
          badgeClass: parsed.badgeClass || pickBadgeClass(parsed.id),
        };
      }
    }
  } catch {
    // ignore
  }

  const id = window.crypto?.randomUUID?.() || `c-${Math.random().toString(16).slice(2)}`;
  const identity: ClientIdentity = {
    id,
    name: defaultNameFromId(id),
    badgeClass: pickBadgeClass(id),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
  return identity;
}

