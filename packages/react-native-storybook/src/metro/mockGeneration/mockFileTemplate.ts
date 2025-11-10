/**
 * Generates the mock file template code
 * Handles the structure and boilerplate for generated mock files
 */

import { generateDeserializeFunctionsCode } from '../mockSerialization';
import { generateFunctionsObjectCode } from '../mockSerialization';
import { generateSpecialValueReconstructionCode } from './specialValueReconstruction';

/**
 * Options for generating a mock file template
 */
export interface MockFileTemplateOptions {
  packageName: string;
  requireStatement: string;
  fallbackRequireStatement: string;
  modulePathForLog: string;
  requirePathForLog: string;
  fallbackPathForLog: string;
  storyMocksFunctions: Record<string, Record<string, string>>;
  storyMocksValues: Record<string, Record<string, string>>;
  storyMocksSerialized: Record<string, Record<string, any>>;
  namedExportNames: string[];
  hasDefaultExport: boolean;
  generateMockProperty: (exportName: string) => string;
}

/**
 * Generates the complete mock file code template
 *
 * @param options - Options for generating the mock file template
 * @returns The complete JavaScript code for the mock file
 */
export function generateMockFileTemplate(options: MockFileTemplateOptions): string {
  const {
    packageName,
    requireStatement,
    fallbackRequireStatement,
    modulePathForLog,
    requirePathForLog,
    fallbackPathForLog,
    storyMocksFunctions,
    storyMocksValues,
    storyMocksSerialized,
    namedExportNames,
    hasDefaultExport,
    generateMockProperty,
  } = options;

  return `/**
 * Auto-generated mock file for ${packageName}
 * This file checks __SHERLO_CURRENT_STORY_ID__ at runtime to return the correct mock
 */

// Try to load the real module BEFORE we define our mocks (to avoid circular dependency)
// For relative paths, we resolve them upfront to ensure Metro can find them
// For package names, we use :real suffix to bypass our mock redirect
let realModule = null;
let realModuleLoadAttempted = false;
const loadRealModule = () => {
  if (realModuleLoadAttempted) {
    return realModule;
  }
  realModuleLoadAttempted = true;
  try {
    realModule = ${requireStatement};
  } catch (e) {
    // If :real doesn't work, try direct require (might work for some cases)
    try {
      realModule = ${fallbackRequireStatement};
    } catch (e2) {
      realModule = null;
    }
  }
  return realModule;
};
// Try to load immediately (Metro will process this during bundling)
loadRealModule();

// Functions/classes stored as actual code (no runtime deserialization needed)
${generateFunctionsObjectCode(storyMocksFunctions)}

// Primitives/objects stored as JSON strings
const storyMocks_values = ${JSON.stringify(storyMocksValues, null, 2)};

// Legacy format (for backward compatibility during transition)
const storyMocks = ${JSON.stringify(storyMocksSerialized, null, 2)};
// Note: null values are expected for exports that don't have mocks defined

// Helper to get current story ID from global
// SAFETY: Returns null in production (when Storybook is not active)
// This ensures mocks are NEVER returned in production apps - all code paths fall back to realModule
const getCurrentStory = () => {
  const storyId = (typeof global !== 'undefined' && global.__SHERLO_CURRENT_STORY_ID__) || null;
  return storyId;
};

${generateDeserializeFunctionsCode()}

${generateSpecialValueReconstructionCode()}

${namedExportNames.length === 0 && hasDefaultExport ? generateDefaultOnlyExportTemplate(packageName) : generateNamedExportsTemplate(namedExportNames, hasDefaultExport, packageName, generateMockProperty)}
`;
}

/**
 * Generates template for modules with only a default export
 */
function generateDefaultOnlyExportTemplate(packageName: string): string {
  return `
// Only default export - export it directly with a getter for dynamic resolution
const getDefaultExport = function() {
  const storyId = getCurrentStory();
  const storyMock = storyMocks[storyId];

  if (storyMock && storyMock.default) {
    const parsedValue = JSON.parse(storyMock.default);
    const mockValue = deserializeFunctions(parsedValue);
    return mockValue;
  }

  // Fallback to real implementation
  if (realModule) {
    return realModule.default || realModule;
  } else {
    // No default mock found and real module not available
    // Try to require the real module one more time (in case it wasn't available at module load time)
    // This handles cases where the module becomes available later
    try {
      const lateRealModule = require('${packageName}:real');
      if (lateRealModule) {
        return lateRealModule.default || lateRealModule;
      }
    } catch (e) {
      // Still not available
    }
    // Return undefined - the component should handle this gracefully
    return undefined;
  }
};

// For default-only exports, use a Proxy to make module.exports itself return the default value
// This avoids Metro's interop wrapping it in another { default: ... } layer
// Use an empty object as the target so the Proxy is always valid, even when getDefaultExport() returns undefined
const defaultExportProxy = new Proxy({}, {
  get: function(target, prop) {
    // Always re-fetch the default export (it might have changed based on story)
    const currentValue = getDefaultExport();
    if (currentValue && typeof currentValue === 'object') {
      return currentValue[prop];
    }
    // If currentValue is not an object, return undefined for property access
    // This handles the case where realModule is null and we returned {}
    return undefined;
  },
  ownKeys: function(target) {
    const currentValue = getDefaultExport();
    if (currentValue && typeof currentValue === 'object') {
      return Object.keys(currentValue);
    }
    return [];
  },
  getOwnPropertyDescriptor: function(target, prop) {
    const currentValue = getDefaultExport();
    if (currentValue && typeof currentValue === 'object') {
      return Object.getOwnPropertyDescriptor(currentValue, prop);
    }
    return undefined;
  },
  has: function(target, prop) {
    const currentValue = getDefaultExport();
    if (currentValue && typeof currentValue === 'object') {
      return prop in currentValue;
    }
    return false;
  },
});

module.exports = defaultExportProxy;
`;
}

/**
 * Generates template for modules with named exports (and optionally a default export)
 */
function generateNamedExportsTemplate(
  namedExportNames: string[],
  hasDefaultExport: boolean,
  packageName: string,
  generateMockProperty: (exportName: string) => string
): string {
  return `
// Smart mock that checks current story at runtime
const mock = {
${namedExportNames.map((exportName) => generateMockProperty(exportName)).join(',\n')}
};

${hasDefaultExport ? `
// Handle default export separately with getter/setter to allow Metro's ES module interop
Object.defineProperty(mock, 'default', {
  get: function() {
    const storyId = getCurrentStory();
    const storyMock = storyMocks[storyId];

    if (storyMock && storyMock.default) {
      const parsedValue = JSON.parse(storyMock.default);
      const mockValue = deserializeFunctions(parsedValue);
      return mockValue;
    }

    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      return realModule.default || realModule;
    } catch (e) {
      // No default mock found and real module not available
      return undefined;
    }
  },
  set: function(value) {
    // Allow Metro's interop to assign to default by replacing the property descriptor
    Object.defineProperty(mock, 'default', {
      value: value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  },
  enumerable: true,
  configurable: true,
});
` : ''}

module.exports = mock;

${hasDefaultExport ? `
// Also set module.exports.default directly for Metro's ES module interop
// This ensures default imports work correctly
Object.defineProperty(module.exports, 'default', {
  get: function() {
    return mock.default;
  },
  set: function(value) {
    mock.default = value;
  },
  enumerable: true,
  configurable: true,
});
` : ''}
`;
}

