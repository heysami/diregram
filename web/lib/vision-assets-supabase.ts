'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET_ID = 'vision-assets';

function extFromMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'bin';
}

async function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });
      return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return {};
  }
}

export async function uploadVisionImage({
  supabase,
  userId,
  fileId,
  cellKey,
  file,
}: {
  supabase: SupabaseClient;
  userId: string;
  fileId: string;
  cellKey: string;
  file: File;
}): Promise<{ objectPath: string; width?: number; height?: number }> {
  const ext = extFromMime(file.type || '');
  const objectPath = `vision/${userId}/${fileId}/${cellKey}/${crypto.randomUUID()}.${ext}`;

  const dims = await readImageDimensions(file);

  const { error } = await supabase.storage.from(BUCKET_ID).upload(objectPath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return { objectPath, ...dims };
}

export async function createSignedVisionAssetUrl({
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

