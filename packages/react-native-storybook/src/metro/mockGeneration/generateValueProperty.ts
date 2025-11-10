/**
 * Generates mock property code for value exports (objects, constants, primitives)
 */

/**
 * Generates a getter property for a non-function export (objects, constants, etc.)
 *
 * @param packageName - The package/module name
 * @param exportName - The name of the export
 * @returns Generated JavaScript code for the value property getter
 */
export function generateValueProperty(packageName: string, exportName: string): string {
  return `  get ${exportName}() {
    const storyId = getCurrentStory();

    // Check storyMocks_values first (primitives/objects stored as JSON strings)
    if (storyMocks_values[storyId] && storyMocks_values[storyId].${exportName} !== undefined) {
      try {
        const parsedValue = JSON.parse(storyMocks_values[storyId].${exportName});
        // Reconstruct special values recursively (handles nested objects with NaN, Infinity, Date, RegExp)
        const reconstructedValue = reconstructSpecialValues(parsedValue);
        return reconstructedValue;
      } catch (e) {
        // Failed to parse mock value, falling back to real implementation
        // Fall through to real implementation
      }
    }

    // Fallback to real implementation
    // Check both direct export and default export (for modules that export default with named properties)
    let realValue = undefined;
    if (realModule) {
      // Check direct export first
      if (realModule.${exportName} !== undefined) {
        realValue = realModule.${exportName};
      }
      // If not found, check default export
      if (realValue === undefined && realModule.default && realModule.default.${exportName} !== undefined) {
        realValue = realModule.default.${exportName};
      }
    }
    // Explicitly check for undefined (null is a valid value that should be returned)
    if (realValue !== undefined) {
      return realValue;
    } else {
      // No mock found and real module not available
      return undefined;
    }
  }`;
}

