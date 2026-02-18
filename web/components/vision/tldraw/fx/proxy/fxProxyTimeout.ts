'use client';

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  const timeoutMs = Math.max(1, Number(ms || 0));
  return new Promise((resolve) => {
    let settled = false;
    const t = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    p.then((v) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      resolve(v);
    }).catch(() => {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      resolve(null);
    });
  });
}

