/**
 * Generates mock property code for special value exports (NaN, Infinity, Date, RegExp)
 */

/**
 * Generates a getter property for a special value export
 *
 * @param exportName - The name of the export
 * @param reconstructionCode - The JavaScript code to reconstruct the special value (e.g., "NaN", "Infinity", "new Date()")
 * @returns Generated JavaScript code for the special value property getter
 */
export function generateSpecialValueProperty(exportName: string, reconstructionCode: string): string {
  return `  get ${exportName}() {
    const storyId = getCurrentStory();

    // Check storyMocks_values for special value markers
    if (storyMocks_values[storyId] && storyMocks_values[storyId].${exportName}) {
      try {
        const parsedValue = JSON.parse(storyMocks_values[storyId].${exportName});
        // Reconstruct special values recursively (handles nested objects)
        return reconstructSpecialValues(parsedValue);
      } catch (e) {
        // Failed to parse mock value, falling back to real implementation
        // Fall through to real implementation
      }
    }

    // Fallback to real implementation
    let realValue = undefined;
    if (realModule) {
      if (realModule.${exportName} !== undefined) {
        realValue = realModule.${exportName};
      }
      if (realValue === undefined && realModule.default && realModule.default.${exportName} !== undefined) {
        realValue = realModule.default.${exportName};
      }
    }
    if (realValue !== undefined) {
      return realValue;
    } else {
      // Return default special value if no mock and no real value
      return ${reconstructionCode};
    }
  }`;
}

/**
 * Determines the reconstruction code for a special value based on its type
 *
 * @param firstExportValue - The first export value from the mock object
 * @returns The JavaScript code to reconstruct the special value
 */
export function getSpecialValueReconstructionCode(firstExportValue: any): string {
  if (firstExportValue && typeof firstExportValue === 'object') {
    if ((firstExportValue as any).__isNaN) {
      return 'NaN';
    } else if ((firstExportValue as any).__isInfinity) {
      return 'Infinity';
    } else if ((firstExportValue as any).__isNegativeInfinity) {
      return '-Infinity';
    } else if ((firstExportValue as any).__isDate) {
      const dateCode = (firstExportValue as any).__code;
      return dateCode || 'new Date()';
    } else if ((firstExportValue as any).__isRegExp) {
      const regexCode = (firstExportValue as any).__code;
      return regexCode || '/.*/';
    }
  }
  return 'undefined';
}

