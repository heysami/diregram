import { invoke } from '@tauri-apps/api/core';

type InvokeResult<T> = T;

async function safeInvoke<T>(cmd: string, args: Record<string, any>): Promise<T> {
  return (await invoke(cmd, args)) as InvokeResult<T>;
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const v = await safeInvoke<string | null>('secure_storage_get', { key });
      return v ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    await safeInvoke<void>('secure_storage_set', { key, value });
  },
  async removeItem(key: string): Promise<void> {
    await safeInvoke<void>('secure_storage_remove', { key });
  },
};

