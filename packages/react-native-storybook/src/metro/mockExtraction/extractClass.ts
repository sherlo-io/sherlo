/**
 * Extracts class values from AST nodes
 */

/**
 * Extracts a class expression or declaration from an AST node
 *
 * @param value - The AST node to extract from
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @returns Marker object with class code, or null if not a class
 */
export function extractClass(value: any, t: any, generate: any): any {
  // For class expressions and class declarations, convert to code string
  if (t.isClassExpression(value) || t.isClassDeclaration(value)) {
    if (generate) {
      try {
        const code = generate(value).code;
        return { __isClass: true, __code: code };
      } catch {
        // Failed to generate code for class, using placeholder
        return { __isClass: true, __code: 'class {}' };
      }
    }
    // Fallback: return marker
    return { __isClass: true, __code: 'class {}' };
  }

  return null;
}

