'use client';

function keyForFamilies(families: string[]): string {
  return families
    .map((f) => f.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

function familyParam(family: string): string {
  // Google Fonts expects spaces as '+'.
  // Keep ':' and '@' intact for advanced specs like "Inter:wght@400;700".
  return encodeURIComponent(family).replace(/%20/g, '+');
}

function baseFamilyName(family: string): string {
  // Strip any Google Fonts axis syntax (":wght@...") when using document.fonts.load().
  return family.split(':')[0]?.trim() || family.trim();
}

/**
 * Best-effort Google Fonts loader.
 *
 * - Injects a stylesheet link to fonts.googleapis.com
 * - Awaits `document.fonts` readiness so Fabric text can render correctly
 */
export async function loadGoogleFonts(families: string[]): Promise<void> {
  if (typeof document === 'undefined') return;
  const clean = families.map((f) => f.trim()).filter(Boolean);
  if (clean.length === 0) return;

  const key = keyForFamilies(clean);
  const existing = document.querySelector<HTMLLinkElement>(`link[data-google-fonts-key="${CSS.escape(key)}"]`);
  if (!existing) {
    const href = `https://fonts.googleapis.com/css2?${clean.map((f) => `family=${familyParam(f)}`).join('&')}&display=swap`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-google-fonts-key', key);
    document.head.appendChild(link);
  }

  // Wait for the font faces to be usable.
  try {
    const fontSet: FontFaceSet | undefined = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontSet) return;
    await Promise.all(
      clean.map(async (f) => {
        const base = baseFamilyName(f);
        if (!base) return;
        try {
          await fontSet.load(`16px "${base}"`);
        } catch {
          // ignore
        }
      }),
    );
    await fontSet.ready;
  } catch {
    // ignore
  }
}

