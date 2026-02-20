import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from '../../lib/supabase';

export type Project = { id: string; name: string };

export async function fetchAccountProjects(sb: SupabaseClient): Promise<Project[]> {
  const session = await getSession(sb);
  if (!session?.user) throw new Error('Not signed in (session missing).');

  const { data, error } = await sb.from('folders').select('id,name').is('parent_id', null).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

