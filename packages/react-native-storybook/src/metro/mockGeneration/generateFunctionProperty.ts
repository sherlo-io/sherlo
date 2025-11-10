/**
 * Generates mock property code for function exports
 */

/**
 * Generates a function property for a function export
 *
 * @param packageName - The package/module name
 * @param exportName - The name of the function export
 * @returns Generated JavaScript code for the function property
 */
export function generateFunctionProperty(packageName: string, exportName: string): string {
  return `  ${exportName}: function(...args) {
    const storyId = getCurrentStory();

    // Check storyMocks_functions first (functions stored as actual code, no deserialization needed)
    if (storyMocks_functions[storyId] && storyMocks_functions[storyId].${exportName}) {
      const mockFn = storyMocks_functions[storyId].${exportName};
      if (typeof mockFn === 'function') {
        const result = mockFn(...args);
        return result;
      }
    }

    // Fallback to real implementation
    // Check both direct export and default export (for modules that export default with named properties)
    const realFn = realModule && (
      (typeof realModule.${exportName} === 'function' ? realModule.${exportName} : null) ||
      (realModule.default && typeof realModule.default.${exportName} === 'function' ? realModule.default.${exportName} : null)
    );
    if (realFn) {
      return realFn(...args);
    } else {
      // No mock found and real module not available
      return undefined;
    }
  }`;
}

