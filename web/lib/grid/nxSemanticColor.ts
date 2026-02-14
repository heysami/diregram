export type NxSemanticKind = 'r' | 'g' | 'y' | 'b' | 's';

export function nxNormalizeKind(kind: string | undefined): NxSemanticKind {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'r' || k === 'g' || k === 'y' || k === 'b') return k;
  return 's';
}

export function nxSemanticTextColor(kind: string | undefined): string {
  switch (nxNormalizeKind(kind)) {
    case 'r':
      return '#b91c1c'; // red-700
    case 'g':
      return '#15803d'; // green-700
    case 'y':
      return '#a16207'; // yellow-700-ish
    case 'b':
      return '#1d4ed8'; // blue-700
    default:
      return '#0f172a'; // slate-900
  }
}

export function nxSemanticBgColor(kind: string | undefined): string {
  switch (nxNormalizeKind(kind)) {
    case 'r':
      return '#fee2e2'; // red-100
    case 'g':
      return '#dcfce7'; // green-100
    case 'y':
      return '#fef9c3'; // yellow-100
    case 'b':
      return '#dbeafe'; // blue-100
    default:
      return '#f1f5f9'; // slate-100
  }
}

