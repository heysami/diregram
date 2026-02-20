import { secureStorage } from './secureStorage';

const KEY = 'nexusmap.sync.openai_api_key.v1';

export async function loadOpenAiKey(): Promise<string> {
  const raw = await secureStorage.getItem(KEY);
  return String(raw || '').trim();
}

export async function saveOpenAiKey(apiKey: string): Promise<void> {
  const k = String(apiKey || '').trim();
  if (!k) throw new Error('API key is required');
  await secureStorage.setItem(KEY, k);
}

export async function clearOpenAiKey(): Promise<void> {
  await secureStorage.removeItem(KEY);
}

