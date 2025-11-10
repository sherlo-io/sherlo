/**
 * Extracts function values from AST nodes
 */

/**
 * Extracts a function or arrow function from an AST node
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with function code, or null if not a function
 */
export function extractFunction(value: any, t: any, generate: any): any {
  // For arrow functions and function expressions, convert to code string
  if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
    if (generate) {
      const code = generate(value).code;
      return { __isFunction: true, __code: code };
    }
    // Fallback: return marker
    return { __isFunction: true, __code: '() => {}' };
  }

  return null;
}

