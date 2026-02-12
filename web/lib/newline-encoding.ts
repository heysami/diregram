/**
 * Newline Encoding Utilities
 * 
 * Handles encoding/decoding of newlines in node content to prevent markdown parser
 * from interpreting them as new nodes. Uses `\\n` as the escape sequence.
 */

const NEWLINE_ESCAPE = '\\n';
const NEWLINE_CHAR = '\n';

/**
 * Encodes newlines in content for markdown storage.
 * Replaces actual newlines with `\\n` escape sequence.
 */
export function encodeNewlines(content: string): string {
  return content.replace(/\n/g, NEWLINE_ESCAPE);
}

/**
 * Decodes newlines in content from markdown.
 * Replaces `\\n` escape sequence with actual newlines.
 */
export function decodeNewlines(content: string): string {
  // Replace \\n with actual newline, but be careful not to replace \\\\n (escaped backslash + n)
  // We need to handle the case where the escape sequence is in the markdown
  return content.replace(/\\n/g, NEWLINE_CHAR);
}
