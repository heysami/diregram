export const OPENAI_KEY_STORAGE = 'diregram.openaiApiKey.v1';

export function loadOpenAiApiKeyFromBrowser(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(OPENAI_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function saveOpenAiApiKeyToBrowser(next: string): void {
  if (typeof window === 'undefined') return;
  const value = String(next || '').trim();
  try {
    if (!value) window.localStorage.removeItem(OPENAI_KEY_STORAGE);
    else window.localStorage.setItem(OPENAI_KEY_STORAGE, value);
  } catch {
    // ignore
  }
}

export async function ensureOpenAiApiKeyWithPrompt(promptText?: string): Promise<string> {
  const existing = loadOpenAiApiKeyFromBrowser();
  if (existing) return existing;
  if (typeof window === 'undefined') return '';
  const entered = String(
    window.prompt(
      promptText || 'Enter your OpenAI API key (starts with sk-). This will be saved in this browser only.',
      '',
    ) || '',
  ).trim();
  if (!entered) return '';
  saveOpenAiApiKeyToBrowser(entered);
  return entered;
}
