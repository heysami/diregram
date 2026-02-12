/**
 * Normalize markdown newlines so all internal string operations behave consistently.
 * We standardize on UNIX newlines (`\n`) because various storage utilities search for
 * the separator using `\n---\n` and split on `\n`.
 */
export function normalizeMarkdownNewlines(text: string): string {
  // Convert CRLF and bare CR to LF.
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

