/**
 * ⚠️ IMPORTANT: This module is stable and working. Do not modify unless fixing bugs.
 * 
 * This module provides utility functions for common node operations.
 * These utilities are used by common-node-logic.ts and other modules that work with common nodes.
 * 
 * Modifying this module can break common node matching, toggling, and content comparison.
 * 
 * If you need different behavior, consider:
 * 1. Creating a new module for your specific use case
 * 2. Extending this module with optional parameters (carefully)
 * 3. Discussing with the team before making changes
 */

/**
 * Normalize node content for comparison by removing tags and trimming whitespace
 * 
 * This is used when matching common nodes across variants to ensure consistent comparison
 * even if tags or whitespace differ slightly.
 * 
 * @param content - The content string to normalize
 * @returns Normalized content (trimmed, with #common# tags removed)
 */
export function normalizeNodeContent(content: string): string {
  return content.trim().replace(/#common#/g, '').trim();
}

/**
 * Check if a line in markdown contains the #common# tag
 * 
 * @param line - The markdown line to check
 * @returns true if the line contains #common#, false otherwise
 */
export function hasCommonTag(line: string | undefined): boolean {
  return line?.includes('#common#') ?? false;
}
