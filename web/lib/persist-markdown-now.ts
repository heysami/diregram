'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

export function persistMarkdownNow(opts: {
  supabaseMode: boolean;
  supabase: SupabaseClient | null;
  fileId: string;
  markdown: string;
  updatedAtIso: string;
}) {
  const { supabaseMode, supabase, fileId, markdown, updatedAtIso } = opts;
  if (!supabaseMode) return;
  if (!supabase) return;
  supabase.from('files').update({ content: markdown, updated_at: updatedAtIso }).eq('id', fileId).then(() => {});
}

