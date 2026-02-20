import { secureStorage } from './secureStorage';

export type RuntimeStateV1 = {
  version: 1;
  vaultPath: string;
  projectFolderId: string;
  watching: boolean;
  pulling: boolean;
};

const KEY = 'nexusmap.sync.runtime.v1';

export async function loadRuntimeState(): Promise<RuntimeStateV1 | null> {
  const raw = await secureStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RuntimeStateV1>;
    if (
      v &&
      v.version === 1 &&
      typeof v.vaultPath === 'string' &&
      typeof v.projectFolderId === 'string' &&
      typeof v.watching === 'boolean' &&
      typeof v.pulling === 'boolean'
    ) {
      return v as RuntimeStateV1;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveRuntimeState(next: RuntimeStateV1): Promise<void> {
  await secureStorage.setItem(KEY, JSON.stringify(next));
}

