import type { SupabaseClient } from '@supabase/supabase-js';
import type { LayoutDirection } from '@/lib/layout-direction';
import { normalizeLayoutDirection } from '@/lib/layout-direction';

export async function fetchProfileDefaultLayoutDirection(
  supabase: SupabaseClient,
  userId: string,
): Promise<LayoutDirection> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('default_layout_direction')
      .eq('id', userId)
      .maybeSingle();
    const raw = (data as { default_layout_direction?: string | null } | null)?.default_layout_direction;
    return normalizeLayoutDirection(raw);
  } catch {
    return 'horizontal';
  }
}

export async function updateProfileDefaultLayoutDirection(
  supabase: SupabaseClient,
  userId: string,
  next: LayoutDirection,
): Promise<void> {
  await supabase.from('profiles').update({ default_layout_direction: next }).eq('id', userId);
}

