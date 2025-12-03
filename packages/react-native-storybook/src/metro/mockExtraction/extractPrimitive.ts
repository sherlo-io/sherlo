/**
 * Extracts primitive values from AST nodes
 */

import type { Node } from '@babel/types';

/**
 * Extracts a primitive value from an AST node
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @returns The extracted primitive value, or null if not a primitive
 */
export function extractPrimitive(value: any, t: any): any {
  // For literals, return the value
  if (t.isStringLiteral(value)) {
    return value.value;
  }
  if (t.isNumericLiteral(value)) {
    return value.value;
  }
  if (t.isBooleanLiteral(value)) {
    return value.value;
  }
  if (t.isNullLiteral(value)) {
    return null;
  }

  return null;
}

