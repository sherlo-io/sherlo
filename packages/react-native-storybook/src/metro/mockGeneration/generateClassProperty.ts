/**
 * Generates mock property code for class exports
 */

/**
 * Generates a getter property for a class export
 *
 * @param packageName - The package/module name
 * @param exportName - The name of the class export
 * @returns Generated JavaScript code for the class property getter
 */
export function generateClassProperty(packageName: string, exportName: string): string {
  return `  get ${exportName}() {
    const storyId = getCurrentStory();

    // Check storyMocks_functions first (classes stored as actual code, no deserialization needed)
    if (storyMocks_functions[storyId] && storyMocks_functions[storyId].${exportName}) {
      const mockClass = storyMocks_functions[storyId].${exportName};
      if (typeof mockClass === 'function' || (typeof mockClass === 'object' && mockClass !== null)) {
        return mockClass;
      }
    }

    // Fallback to real implementation
    // Check both direct export and default export (for modules that export default with named properties)
    const realClass = realModule && (
      (realModule.${exportName} !== undefined ? realModule.${exportName} : null) ||
      (realModule.default && realModule.default.${exportName} !== undefined ? realModule.default.${exportName} : null)
    );
    if (realClass) {
      return realClass;
    } else {
      // No mock found and real module not available
      return undefined;
    }
  }`;
}

