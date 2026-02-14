export function isEnterEditShortcut(e: KeyboardEvent): boolean {
  const isCmd = e.metaKey || e.ctrlKey;
  return (isCmd && e.key === 'Enter') || e.key === 'F2';
}

