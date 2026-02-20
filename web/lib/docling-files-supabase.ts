'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET_ID = 'docling-files';

function safeName(name: string) {
  const raw = String(name || '').trim() || 'document';
  return raw
    .replace(/\0/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export async function uploadDoclingInput({
  supabase,
  userId,
  file,
  jobId,
}: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
  jobId?: string;
}): Promise<{ objectPath: string; jobId: string; filename: string }> {
  const jid = jobId || crypto.randomUUID();
  const filename = safeName(file.name || 'document');
  const objectPath = `docling/${userId}/in/${jid}/${filename}`;

  const { error } = await supabase.storage.from(BUCKET_ID).upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return { objectPath, jobId: jid, filename };
}

export async function createSignedDoclingFileUrl({
  supabase,
  objectPath,
  expiresInSeconds,
}: {
  supabase: SupabaseClient;
  objectPath: string;
  expiresInSeconds: number;
}): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET_ID).createSignedUrl(objectPath, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

