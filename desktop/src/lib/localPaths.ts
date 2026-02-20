export type ProjectLite = { id: string; name: string };

export function joinPath(a: string, b: string): string {
  const aa = a.replace(/[\\/]+$/, '');
  const bb = b.replace(/^[\\/]+/, '');
  return `${aa}/${bb}`;
}

export function safeFolderName(name: string): string {
  const base = name.trim() || 'Untitled';
  return base
    .replace(/[\\/]/g, '-')
    .replace(/[:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
}

export function projectLocalPath(p: ProjectLite, rootVault: string, syncRootFolderName: string) {
  const name = safeFolderName(p.name);
  const suffix = p.id.slice(0, 8);
  const rel = `${syncRootFolderName}/${name}__${suffix}`;
  const abs = joinPath(rootVault, rel);
  return { rel, abs };
}

