/**
 * Shared helpers for preserving node-line metadata comments when rewriting markdown lines.
 *
 * These comments are persistence anchors for multiple subsystems:
 * - expanded state:   <!-- expanded:N --> (current) and <!-- expid:N --> (history/stable id)
 * - running numbers:  <!-- rn:N -->
 * - descriptions:     <!-- desc:... -->
 * - node icons:       <!-- icon:... -->
 * - node tags:        <!-- tags:... -->
 */

export const KNOWN_NODE_LINE_COMMENT_RE =
  /<!--\s*(?:expanded:\d+|expid:\d+|rn:\d+|desc:[^>]*|ann:[^>]*|icon:[\s\S]*?|do:[^>]*?|doattrs:[^>]*?|dostatus:[^>]*?|tags:[^>]*)\s*-->/g;

export function extractKnownNodeLineComments(line: string): string[] {
  return line.match(KNOWN_NODE_LINE_COMMENT_RE) || [];
}

/**
 * Return a string like " <!-- expid:1 --> <!-- rn:7 -->" that can be appended to a rewritten line.
 * Returns empty string if none exist.
 */
export function buildPreservedNodeLineCommentSuffix(previousLine: string): string {
  const matches = extractKnownNodeLineComments(previousLine);
  if (!matches.length) return '';
  return ' ' + matches.join(' ');
}

