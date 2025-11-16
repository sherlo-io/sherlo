/**
 * Utilities for extracting code from mock value markers
 * Simplified version - Metro handles TypeScript transformation automatically
 */

/**
 * Extracts code string from function markers
 * Used during mock generation to get code strings from extracted AST nodes
 */
export function extractCodeFromMarker(value: any): string | null {
  // Handle function objects with __isFunction marker from AST extraction
  if (value && typeof value === 'object' && (value as any).__isFunction) {
    return (value as any).__code || null;
  }

  return null;
}
