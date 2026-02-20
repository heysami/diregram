import { buildAiGuideBundle } from '../../lib/aiGuideContent';

export type AiBundleFile = { relativePath: string; content: string };

export async function loadAiBundleFromHosted(apiBaseUrl: string): Promise<AiBundleFile[] | null> {
  const base = String(apiBaseUrl || '').trim().replace(/\/$/, '');
  if (!base) return null;
  const res = await fetch(`${base}/api/ai-guides/bundle`, { method: 'GET' });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) return null;
  if (!json?.ok || !Array.isArray(json?.files)) return null;
  const files = json.files
    .map((f: any) => ({ relativePath: String(f.relativePath || ''), content: String(f.content || '') }))
    .filter((f: AiBundleFile) => Boolean(f.relativePath));
  return files.length ? files : null;
}

export async function writeAiBundleToVault(opts: {
  invoke: (cmd: string, args?: any) => Promise<any>;
  vaultPath: string;
  apiBaseUrl?: string | null;
}): Promise<{ fileCount: number; source: 'hosted' | 'builtin' }> {
  const vp = String(opts.vaultPath || '').trim();
  if (!vp) throw new Error('vaultPath is required');

  const hosted = opts.apiBaseUrl ? await loadAiBundleFromHosted(opts.apiBaseUrl) : null;
  const bundle = hosted ?? buildAiGuideBundle();

  await opts.invoke('vault_ensure_dir', { vaultPath: vp, relativePath: 'NexusMap AI' }).catch(() => {});
  for (const f of bundle) {
    // eslint-disable-next-line no-await-in-loop
    await opts.invoke('vault_write_text_file', { vaultPath: vp, relativePath: f.relativePath, content: f.content });
  }
  return { fileCount: bundle.length, source: hosted ? 'hosted' : 'builtin' };
}

