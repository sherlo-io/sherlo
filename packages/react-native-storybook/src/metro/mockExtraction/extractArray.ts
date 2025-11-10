/**
 * Extracts array values from AST nodes
 */

/**
 * Extracts an array expression from an AST node
 * Recursively extracts elements using the provided extractMockValue function
 *
 * @param value - The AST array expression node
 * @param t - Babel types helper
 * @param generate - Babel generator function
 * @param extractMockValue - Function to recursively extract mock values from elements
 * @returns Array of extracted values, or empty array if extraction fails
 */
export function extractArray(
  value: any,
  t: any,
  generate: any,
  extractMockValue: (element: any) => any
): any[] {
  // For array expressions, extract elements recursively
  if (t.isArrayExpression(value)) {
    if (generate) {
      try {
        const elements: any[] = [];
        for (const element of value.elements) {
          if (element) {
            const extracted = extractMockValue(element);
            elements.push(extracted);
          } else {
            elements.push(null);
          }
        }
        return elements;
      } catch {
        // Failed to extract array, returning empty array
        return [];
      }
    }
    // Fallback: try to extract elements directly
    const elements: any[] = [];
    for (const element of value.elements) {
      if (element) {
        const extracted = extractMockValue(element);
        elements.push(extracted);
      } else {
        elements.push(null);
      }
    }
    return elements;
  }

  return null as any;
}

