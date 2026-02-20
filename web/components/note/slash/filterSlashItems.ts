import type { SlashItem } from '@/components/note/slash/SlashMenu';

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    const label = String(it.label || '').toLowerCase();
    const id = String(it.id || '').toLowerCase();
    return label.includes(q) || id.includes(q);
  });
}

