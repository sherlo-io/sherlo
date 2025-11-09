/**
 * Generates a smart mock file that calls getCurrentStory() at runtime
 * This is a scrappy implementation for testing
 */

import * as path from 'path';
import * as fs from 'fs';
import { StoryMockMap } from './mockExtraction';

/**
 * Generates a mock file for a package that checks getCurrentStory() at runtime
 */
export function generateMockFile(
  packageName: string,
  storyMocks: StoryMockMap,
  projectRoot: string,
  fileName?: string
): string {
  // Collect all mocks for this package across all stories
  const packageMocksByStory: Record<string, any> = {};
  
  for (const [storyId, packageMocks] of storyMocks.entries()) {
    const pkgMock = packageMocks.get(packageName);
    if (pkgMock) {
      packageMocksByStory[storyId] = pkgMock;
    }
  }
  
  if (Object.keys(packageMocksByStory).length === 0) {
    throw new Error(`No mocks found for package ${packageName}`);
  }
  
  // Generate mock file code
  const storyIds = Object.keys(packageMocksByStory);
  const firstStoryMock = packageMocksByStory[storyIds[0]];
  const exportNames = Object.keys(firstStoryMock);
  const hasDefaultExport = exportNames.includes('default');
  // Exclude 'default' from named exports since we'll handle it separately
  const namedExportNames = exportNames.filter(name => name !== 'default');
  
  // Serialize functions to strings (scrappy approach)
  const storyMocksSerialized: Record<string, Record<string, string>> = {};
  for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
    storyMocksSerialized[storyId] = {};
    for (const [exportName, exportValue] of Object.entries(mock)) {
      // Handle function objects with __isFunction marker from AST extraction
      if (exportValue && typeof exportValue === 'object' && (exportValue as any).__isFunction) {
        storyMocksSerialized[storyId][exportName] = (exportValue as any).__code || '() => {}';
      } else if (typeof exportValue === 'function') {
        storyMocksSerialized[storyId][exportName] = exportValue.toString();
      } else if (typeof exportValue === 'object' && exportValue !== null) {
        // For objects (including default export objects), serialize as JSON
        storyMocksSerialized[storyId][exportName] = JSON.stringify(exportValue);
      } else {
        storyMocksSerialized[storyId][exportName] = JSON.stringify(exportValue);
      }
    }
  }
  
  // Helper function to generate mock property (for named exports only)
  const generateMockProperty = (exportName: string) => {
    // For named exports, check if it's a function or value
    const firstMock = storyMocksSerialized[storyIds[0]][exportName];
    const isFunction = firstMock && (
      firstMock.startsWith('(') || 
      firstMock.startsWith('function') || 
      firstMock.startsWith('async') ||
      firstMock.includes('=>')
    );
    
    if (isFunction) {
      return `  ${exportName}: function(...args) {
    const storyId = getCurrentStory();
    console.log('[SHERLO:mock] ${packageName}.${exportName} called for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.${exportName}) {
      const mockFn = eval('(' + storyMock.${exportName} + ')');
      const result = mockFn(...args);
      console.log('[SHERLO:mock] Returning mock result:', result);
      return result;
    }
    
    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      console.log('[SHERLO:mock] Using real implementation for story:', storyId);
      return realModule.${exportName}(...args);
    } catch (e) {
      console.warn('[SHERLO:mock] No mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    } else {
      // For non-function exports (objects, constants, etc.)
      return `  get ${exportName}() {
    const storyId = getCurrentStory();
    console.log('[SHERLO:mock] ${packageName}.${exportName} accessed for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.${exportName}) {
      const parsedValue = JSON.parse(storyMock.${exportName});
      const mockValue = deserializeFunctions(parsedValue);
      console.log('[SHERLO:mock] Returning ${exportName} mock:', mockValue);
      return mockValue;
    }
    
    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      console.log('[SHERLO:mock] Using real ${exportName} for story:', storyId);
      return realModule.${exportName};
    } catch (e) {
      console.warn('[SHERLO:mock] No ${exportName} mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    }
  };
  
  const mockCode = `/**
 * Auto-generated mock file for ${packageName}
 * This file checks __SHERLO_CURRENT_STORY_ID__ at runtime to return the correct mock
 */

// All mocks for this package across all stories
const storyMocks = ${JSON.stringify(storyMocksSerialized, null, 2)};

// Helper to get current story ID from global
const getCurrentStory = () => {
  const storyId = (typeof global !== 'undefined' && global.__SHERLO_CURRENT_STORY_ID__) || null;
  console.log('[SHERLO:mock] Current story ID:', storyId);
  return storyId;
};

// Helper to recursively convert serialized functions to actual functions
const deserializeFunctions = (value) => {
  if (value && typeof value === 'object') {
    // Check if this is a serialized function
    if (value.__isFunction && value.__code) {
      try {
        return eval('(' + value.__code + ')');
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to deserialize function:', e);
        return () => {};
      }
    }
    // If it's an array, process each element
    if (Array.isArray(value)) {
      return value.map(deserializeFunctions);
    }
    // If it's an object, process each property
    const result = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        result[key] = deserializeFunctions(value[key]);
      }
    }
    return result;
  }
  return value;
};

${namedExportNames.length === 0 && hasDefaultExport ? `
// Only default export - export it directly with a getter for dynamic resolution
const getDefaultExport = function() {
  const storyId = getCurrentStory();
  console.log('[SHERLO:mock] ${packageName} (default export) accessed for story:', storyId);
  const storyMock = storyMocks[storyId];
  
  if (storyMock && storyMock.default) {
    const parsedValue = JSON.parse(storyMock.default);
    const mockValue = deserializeFunctions(parsedValue);
    console.log('[SHERLO:mock] Returning default export mock:', mockValue);
    return mockValue;
  }
  
  // Fallback to real implementation
  try {
    const realModule = require('${packageName}:real');
    console.log('[SHERLO:mock] Using real default export for story:', storyId);
    return realModule.default || realModule;
  } catch (e) {
    console.warn('[SHERLO:mock] No default mock found for story "' + storyId + '" and real module not available');
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
` : `
// Smart mock that checks current story at runtime
const mock = {
${namedExportNames.map((exportName) => generateMockProperty(exportName)).join(',\n')}
};

${hasDefaultExport ? `
// Handle default export separately with getter/setter to allow Metro's ES module interop
Object.defineProperty(mock, 'default', {
  get: function() {
    const storyId = getCurrentStory();
    console.log('[SHERLO:mock] ${packageName}.default accessed for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.default) {
      const parsedValue = JSON.parse(storyMock.default);
      const mockValue = deserializeFunctions(parsedValue);
      console.log('[SHERLO:mock] Returning default export mock:', mockValue);
      return mockValue;
    }
    
    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      console.log('[SHERLO:mock] Using real default export for story:', storyId);
      return realModule.default || realModule;
    } catch (e) {
      console.warn('[SHERLO:mock] No default mock found for story "' + storyId + '" and real module not available');
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
`}
`;

  // Write to a temp location that Metro can resolve
  // Use node_modules/.sherlo-mocks/ to make it easy to resolve
  const mockDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }
  
  const safeFileName = fileName || packageName.replace(/\//g, '__');
  const mockFilePath = path.join(mockDir, `${safeFileName}.js`);
  fs.writeFileSync(mockFilePath, mockCode, 'utf-8');
  
  console.log(`[SHERLO:mockGen] Generated mock file: ${mockFilePath} (for package: ${packageName})`);
  return mockFilePath;
}

/**
 * Generates mock files for all packages that have mocks
 */
export function generateAllMockFiles(
  storyMocks: StoryMockMap,
  projectRoot: string
): Map<string, string> {
  const mockFiles = new Map<string, string>();
  
  // Collect all unique packages/modules that have mocks
  const packages = new Set<string>();
  for (const [, packageMocks] of storyMocks.entries()) {
    for (const pkgName of packageMocks.keys()) {
      packages.add(pkgName);
    }
  }
  
  // Generate mock file for each package/module
  for (const packageName of packages) {
    try {
      // Normalize relative paths to a consistent identifier
      let normalizedPackageName = packageName;
      if (packageName.startsWith('.') || packageName.startsWith('/')) {
        // Normalize separators and remove extension
        normalizedPackageName = packageName.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx)$/, '');
      }
      
      // Generate filename-safe version (replace / with __)
      const safeFileName = normalizedPackageName.replace(/\//g, '__');
      
      const mockFilePath = generateMockFile(packageName, storyMocks, projectRoot, safeFileName);
      mockFiles.set(packageName, mockFilePath);
    } catch (error: any) {
      console.warn(`[SHERLO:mockGen] Failed to generate mock for ${packageName}:`, error.message);
    }
  }
  
  return mockFiles;
}

