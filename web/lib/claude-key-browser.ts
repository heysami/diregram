export const CLAUDE_KEY_STORAGE = 'diregram.claudeApiKey.v1';

export function loadClaudeApiKeyFromBrowser(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(CLAUDE_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function saveClaudeApiKeyToBrowser(next: string): void {
  if (typeof window === 'undefined') return;
  const value = String(next || '').trim();
  try {
    if (!value) window.localStorage.removeItem(CLAUDE_KEY_STORAGE);
    else window.localStorage.setItem(CLAUDE_KEY_STORAGE, value);
  } catch {
    // ignore
  }
}

export async function ensureClaudeApiKeyWithPrompt(promptText?: string): Promise<string> {
  const existing = loadClaudeApiKeyFromBrowser();
  if (existing) return existing;
  if (typeof window === 'undefined') return '';
  const entered = String(
    window.prompt(
      promptText || 'Enter your Claude API key. This will be saved in this browser only.',
      '',
    ) || '',
  ).trim();
  if (!entered) return '';
  saveClaudeApiKeyToBrowser(entered);
  return entered;
}
