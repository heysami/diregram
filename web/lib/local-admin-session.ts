export const LOCAL_ADMIN_USERNAME = 'samiadmin';
const STORAGE_KEY = 'diregram.localAdminSession.v1';

export type LocalAdminSession = {
  id: string;
  email: string;
  createdAt: number;
};

export function isLocalAdminLoginEnabled() {
  // Safe default: enabled in local dev, disabled in production builds unless explicitly enabled.
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_LOCAL_ADMIN_LOGIN === 'true';
}

export function getLocalAdminSession(): LocalAdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAdminSession> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string' || typeof parsed.createdAt !== 'number') return null;
    return { id: parsed.id, email: parsed.email, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export function setLocalAdminSession() {
  if (typeof window === 'undefined') return;
  const session: LocalAdminSession = {
    id: 'local-admin',
    email: LOCAL_ADMIN_USERNAME,
    createdAt: Date.now(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearLocalAdminSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

