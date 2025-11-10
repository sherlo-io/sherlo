/**
 * Generates a smart mock file that calls getCurrentStory() at runtime
 * This is a scrappy implementation for testing
 */

import * as path from 'path';
import * as fs from 'fs';
import { StoryMockMap } from './mockExtraction';

/**
 * Resolves a relative path to an absolute path by checking common source locations
 * This is used for :real requires in mock files
 */
function resolveRelativePathForReal(relativePath: string, projectRoot: string): string {
  // If it's already absolute or a package name, return as-is
  if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    return relativePath;
  }
  
  // Try to resolve relative to common source directories
  const commonSourceDirs = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'testing', 'testing-components', 'src'),
    projectRoot,
  ];
  
  for (const sourceDir of commonSourceDirs) {
    const resolvedPath = path.resolve(sourceDir, relativePath);
    // Try with different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
    for (const ext of extensions) {
      const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  
  // If we can't resolve it, return the original (Metro might be able to resolve it)
  return relativePath;
}

/**
 * Generates a mock file for a package that checks getCurrentStory() at runtime
 */
export function generateMockFile(
  packageName: string,
  storyMocks: StoryMockMap,
  projectRoot: string,
  fileName?: string
): string {
  // Resolve the real module path upfront (for use in generated code)
  // This ensures we have the correct path even for relative imports
  let realModulePath: string | null = null;
  let realModuleAbsolutePath: string | null = null;
  let requirePathForMockFile: string | null = null;
  
  if (packageName.startsWith('.') || packageName.startsWith('/')) {
    // For relative paths like "../utils/testHelper", we need to resolve them
    // The path is relative to where it's imported from, so we check common locations
    // Try resolving from various possible source directories
    // Note: projectRoot might be the expo project root, but files might be in sibling directories
    const possibleBaseDirs = [
      // Check relative to projectRoot first (for files in the same project)
      path.join(projectRoot, 'src', 'components'),
      path.join(projectRoot, 'src'),
      projectRoot,
      // Check sibling directories (for monorepo setups where testing-components is separate)
      path.join(projectRoot, '..', 'testing-components', 'src', 'components'),
      path.join(projectRoot, '..', 'testing-components', 'src'),
      path.join(projectRoot, '..', 'src', 'components'),
      path.join(projectRoot, '..', 'src'),
      // Check parent directories (for deeply nested structures)
      path.join(projectRoot, '..', '..', 'testing-components', 'src', 'components'),
      path.join(projectRoot, '..', '..', 'testing-components', 'src'),
    ];
    
    console.log(`[SHERLO:mockGen] Resolving relative path: ${packageName}`);
    console.log(`[SHERLO:mockGen] Project root: ${projectRoot}`);
    
    for (const baseDir of possibleBaseDirs) {
      const resolvedPath = path.resolve(baseDir, packageName);
      console.log(`[SHERLO:mockGen] Trying to resolve from ${baseDir}: ${resolvedPath}`);
      const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
      for (const ext of extensions) {
        const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
        if (fs.existsSync(fullPath)) {
          console.log(`[SHERLO:mockGen] Found file at: ${fullPath}`);
          realModuleAbsolutePath = fullPath;
          // Calculate relative path from mock file location to real module
          // Mock file is at: node_modules/.sherlo-mocks/..__utils__testHelper.js
          // Real module is at: testing-components/src/utils/testHelper.ts
          const mockFileDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
          const relativeFromMockFile = path.relative(mockFileDir, fullPath);
          console.log(`[SHERLO:mockGen] Relative from mock file (${mockFileDir}) to real module (${fullPath}): ${relativeFromMockFile}`);
          // Remove extension for require()
          requirePathForMockFile = relativeFromMockFile.replace(/\.(ts|tsx|js|jsx)$/, '');
          // Normalize path separators for require()
          requirePathForMockFile = requirePathForMockFile.replace(/\\/g, '/');
          // Ensure it starts with ./ or ../ for relative requires
          if (!requirePathForMockFile.startsWith('.')) {
            requirePathForMockFile = './' + requirePathForMockFile;
          }
          realModulePath = path.relative(projectRoot, fullPath).replace(/\.(ts|tsx|js|jsx)$/, '');
          console.log(`[SHERLO:mockGen] Resolved relative path ${packageName} to ${realModulePath}`);
          console.log(`[SHERLO:mockGen] Using require path from mock file: ${requirePathForMockFile}`);
          break;
        }
      }
      if (realModulePath) break;
    }
    
    if (!realModulePath) {
      console.warn(`[SHERLO:mockGen] Could not find file for relative path ${packageName} in any of the checked directories`);
    }
  } else {
    // For package names, use :real suffix to bypass our mock redirect
    realModulePath = packageName;
    requirePathForMockFile = `${packageName}:real`;
  }
  
  // Fallback: if we couldn't resolve the path, use :real suffix
  if (!requirePathForMockFile) {
    requirePathForMockFile = `${packageName}:real`;
    console.warn(`[SHERLO:mockGen] Could not resolve path for ${packageName}, using :real suffix`);
  }
  
  // Collect all mocks for this package across all stories
  let packageMocksByStory: Record<string, any> = {};
  
  // Debug: log all story IDs in the Map
  const allStoryIds = Array.from(storyMocks.keys());
  if (packageName === 'expo-localization') {
    console.log(`[SHERLO:mockGen] Generating mock for ${packageName}, total story IDs in Map: ${allStoryIds.length}`);
    console.log(`[SHERLO:mockGen] Story IDs containing 'multiplenamedexports':`, allStoryIds.filter(id => id.includes('multiplenamedexports')));
  }
  
  // Read existing mocks from JSON cache (to merge across Metro worker processes)
  const mockDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
  const safeFileName = fileName || packageName.replace(/\//g, '__');
  const cacheFilePath = path.join(mockDir, `${safeFileName}.json`);
  
  if (fs.existsSync(cacheFilePath)) {
    try {
      const existingCache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      packageMocksByStory = existingCache;
      if (packageName === 'expo-localization') {
        console.log(`[SHERLO:mockGen] Loaded ${Object.keys(packageMocksByStory).length} existing mocks from cache`);
      }
    } catch (error: any) {
      console.warn(`[SHERLO:mockGen] Failed to read cache file ${cacheFilePath}:`, error.message);
    }
  }
  
  // Merge new mocks from the Map
  for (const [storyId, packageMocks] of storyMocks.entries()) {
    const pkgMock = packageMocks.get(packageName);
    if (pkgMock) {
      packageMocksByStory[storyId] = pkgMock;
    }
  }
  
  if (packageName === 'expo-localization') {
    console.log(`[SHERLO:mockGen] Found ${Object.keys(packageMocksByStory).length} stories with mocks for ${packageName} (after merge)`);
    console.log(`[SHERLO:mockGen] Story IDs with mocks:`, Object.keys(packageMocksByStory).filter(id => id.includes('multiplenamedexports')));
  }
  
  if (Object.keys(packageMocksByStory).length === 0) {
    throw new Error(`No mocks found for package ${packageName}`);
  }
  
  // Generate mock file code
  const storyIds = Object.keys(packageMocksByStory);
  const firstStoryMock = packageMocksByStory[storyIds[0]];
  
  // Check if the first mock value is an object with nested exports (like { DataProcessor: ..., Calculator: ... })
  // This happens when we have a package mock with multiple exports
  const firstMockValue = Object.values(firstStoryMock)[0];
  const hasNestedExports = firstMockValue && typeof firstMockValue === 'object' && 
    !(firstMockValue as any).__isFunction && !(firstMockValue as any).__isClass &&
    Object.keys(firstMockValue).some(key => 
      (firstMockValue as any)[key] && typeof (firstMockValue as any)[key] === 'object' && 
      ((firstMockValue as any)[key].__isFunction || (firstMockValue as any)[key].__isClass)
    );
  
  let exportNames: string[];
  let actualMocksByStory: Record<string, any>;
  
  if (hasNestedExports) {
    // Flatten the structure: use the nested object's keys as export names
    exportNames = Object.keys(firstMockValue);
    actualMocksByStory = {};
    for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
      // mock is { '../utils/classUtils': { DataProcessor: ..., Calculator: ... } }
      // We want { DataProcessor: ..., Calculator: ... }
      const nestedMock = Object.values(mock)[0];
      actualMocksByStory[storyId] = nestedMock;
    }
  } else {
    // Normal structure: export names are the keys of firstStoryMock
    exportNames = Object.keys(firstStoryMock);
    actualMocksByStory = packageMocksByStory;
  }
  
  const hasDefaultExport = exportNames.includes('default');
  // Exclude 'default' from named exports since we'll handle it separately
  const namedExportNames = exportNames.filter(name => name !== 'default');
  
  // Recursive helper to serialize mock values (handles nested objects with __isFunction/__isClass markers)
  const serializeMockValue = (value: any): any => {
    // Handle function objects with __isFunction marker from AST extraction
    if (value && typeof value === 'object' && (value as any).__isFunction) {
      const code = (value as any).__code || '() => {}';
      console.log(`[SHERLO:serialize] Serializing function, code length: ${code.length}`);
      return code;
    }
    // Handle class objects with __isClass marker from AST extraction
    if (value && typeof value === 'object' && (value as any).__isClass) {
      const code = (value as any).__code || 'class {}';
      console.log(`[SHERLO:serialize] Serializing class, code length: ${code.length}`);
      return code;
    }
    // Handle plain functions
    if (typeof value === 'function') {
      return value.toString();
    }
    // Handle objects - recursively serialize nested properties
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const serialized: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        serialized[key] = serializeMockValue(val);
      }
      return serialized;
    }
    // For primitives and arrays, return as-is (will be JSON.stringify'd later if needed)
    return value;
  };

  // Serialize functions and classes to strings (scrappy approach)
  const storyMocksSerialized: Record<string, Record<string, any>> = {};
  for (const [storyId, mock] of Object.entries(actualMocksByStory)) {
    storyMocksSerialized[storyId] = {};
    console.log(`[SHERLO:serialize] Serializing mocks for story ${storyId}, export names:`, Object.keys(mock));
    for (const [exportName, exportValue] of Object.entries(mock)) {
      console.log(`[SHERLO:serialize] Serializing ${exportName}, type:`, typeof exportValue, 'isObject:', typeof exportValue === 'object', 'has __isClass:', exportValue && typeof exportValue === 'object' && (exportValue as any).__isClass, 'has __isFunction:', exportValue && typeof exportValue === 'object' && (exportValue as any).__isFunction, 'value:', exportValue === null ? 'null' : exportValue === undefined ? 'undefined' : typeof exportValue === 'object' ? JSON.stringify(Object.keys(exportValue)) : String(exportValue).substring(0, 50));
      const serialized = serializeMockValue(exportValue);
      // If it's a string (function/class code), use it directly
      // If it's an object, stringify it
      // If it's a primitive (string constant, number, boolean), JSON.stringify it so it can be parsed later
      if (typeof serialized === 'string' && (serialized.startsWith('class ') || serialized.startsWith('function') || serialized.startsWith('async') || serialized.includes('=>') || serialized.startsWith('('))) {
        // It's function/class code, use directly
        storyMocksSerialized[storyId][exportName] = serialized;
      } else if (typeof serialized === 'object' && serialized !== null) {
        // Object, stringify it
        storyMocksSerialized[storyId][exportName] = JSON.stringify(serialized);
      } else {
        // Primitive (string constant, number, boolean, null), JSON.stringify so it can be parsed
        storyMocksSerialized[storyId][exportName] = JSON.stringify(serialized);
      }
      console.log(`[SHERLO:serialize] Serialized ${exportName} to:`, typeof storyMocksSerialized[storyId][exportName], storyMocksSerialized[storyId][exportName]?.substring?.(0, 50));
    }
  }
  
  // Helper function to generate mock property (for named exports only)
  const generateMockProperty = (exportName: string) => {
    // Check the original object (before serialization) to detect class and function markers
    const firstStoryMock = actualMocksByStory[storyIds[0]];
    const firstExportValue = firstStoryMock?.[exportName];
    const isClassFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isClass;
    const isFunctionFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isFunction;
    
    // For named exports, check if it's a function, class, or value (after serialization)
    const firstMock = storyMocksSerialized[storyIds[0]][exportName];
    const isClassFromString = firstMock && typeof firstMock === 'string' && (
      firstMock.trim().startsWith('class ') ||
      firstMock.trim().startsWith('class{') ||
      firstMock.trim().startsWith('export class')
    );
    const isClass = isClassFromObject || isClassFromString;
    
    const isFunctionFromString = firstMock && typeof firstMock === 'string' && (
      firstMock.startsWith('(') || 
      firstMock.startsWith('function') || 
      firstMock.startsWith('async') ||
      (firstMock.includes('=>') && !firstMock.startsWith('class'))
    );
    const isFunction = !isClass && (isFunctionFromObject || isFunctionFromString);
    
    if (isClass) {
      // For classes, eval and return directly (not wrapped in a function)
      return `  get ${exportName}() {
    const storyId = getCurrentStory();
    console.log('[SHERLO:mock] ${packageName}.${exportName} accessed for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.${exportName} && typeof storyMock.${exportName} === 'string' && storyMock.${exportName} !== 'null' && storyMock.${exportName}.trim().startsWith('class')) {
      try {
        const mockClass = eval('(' + storyMock.${exportName} + ')');
        console.log('[SHERLO:mock] Returning ${exportName} class:', mockClass);
        return mockClass;
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to eval class ${exportName}:', e.message);
        // Fall through to real implementation
      }
    }
    
    // Fallback to real implementation
    // Check both direct export and default export (for modules that export default with named properties)
    const realClass = realModule && (
      (realModule.${exportName} !== undefined ? realModule.${exportName} : null) ||
      (realModule.default && realModule.default.${exportName} !== undefined ? realModule.default.${exportName} : null)
    );
    if (realClass) {
      console.log('[SHERLO:mock] Using real ${exportName} class for story:', storyId);
      return realClass;
    } else {
      console.warn('[SHERLO:mock] No ${exportName} mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    } else if (isFunction) {
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
    // Check both direct export and default export (for modules that export default with named properties)
    const realFn = realModule && (
      (typeof realModule.${exportName} === 'function' ? realModule.${exportName} : null) ||
      (realModule.default && typeof realModule.default.${exportName} === 'function' ? realModule.default.${exportName} : null)
    );
    if (realFn) {
      console.log('[SHERLO:mock] Using real implementation for story:', storyId);
      return realFn(...args);
    } else {
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
    
    if (storyMock && storyMock.${exportName} !== null && storyMock.${exportName} !== undefined) {
      let parsedValue;
      // All values are stored as JSON strings (except function/class code which are stored as plain strings)
      // Try to parse, but handle cases where it might already be a parsed value
      if (typeof storyMock.${exportName} === 'string') {
        try {
          parsedValue = JSON.parse(storyMock.${exportName});
          // If parsed value is null, treat it as "no mock" and fall back to real implementation
          if (parsedValue === null) {
            parsedValue = undefined;
          }
        } catch (e) {
          // If parsing fails, it might be function/class code (stored as plain string), use directly
          parsedValue = storyMock.${exportName};
        }
      } else {
        // Already parsed (shouldn't happen, but handle gracefully)
        parsedValue = storyMock.${exportName};
      }
      // If parsedValue is null or undefined, fall through to real implementation
      if (parsedValue === null || parsedValue === undefined) {
        // Fall through to real implementation check below
      } else {
        const mockValue = deserializeFunctions(parsedValue);
        console.log('[SHERLO:mock] Returning ${exportName} mock:', mockValue);
        return mockValue;
      }
    }
    
    // Fallback to real implementation
    // Check both direct export and default export (for modules that export default with named properties)
    const realValue = realModule && (
      (realModule.${exportName} !== undefined ? realModule.${exportName} : null) ||
      (realModule.default && realModule.default.${exportName} !== undefined ? realModule.default.${exportName} : null)
    );
    if (realValue !== null && realValue !== undefined) {
      console.log('[SHERLO:mock] Using real ${exportName} for story:', storyId);
      return realValue;
    } else {
      console.warn('[SHERLO:mock] No ${exportName} mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    }
  };
  
  // Build the require statement and module path strings for code generation
  // Escape quotes properly for use in template strings
  // For relative paths, use the path calculated from mock file location (without :real)
  // For package names, use :real suffix to bypass our mock redirect
  // requirePathForMockFile is guaranteed to be set (fallback added above)
  const requirePathEscaped = requirePathForMockFile.replace(/'/g, "\\'");
  const requireStatement = `require('${requirePathEscaped}')`;
  
  // Fallback: for relative paths, try direct require; for packages, try without :real
  const fallbackPath = packageName.startsWith('.') || packageName.startsWith('/')
    ? requirePathForMockFile // Already calculated relative path (no :real)
    : packageName; // Try direct package name (without :real)
  const fallbackPathEscaped = fallbackPath.replace(/'/g, "\\'");
  const fallbackRequireStatement = `require('${fallbackPathEscaped}')`;
  
  const modulePathForLog = JSON.stringify(realModulePath || packageName);
  
  const requirePathForLog = JSON.stringify(requirePathForMockFile);
  const fallbackPathForLog = JSON.stringify(fallbackPath);
  
  const mockCode = `/**
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
    // Log the exact require path we're using
    console.log('[SHERLO:mock] Attempting to load real module for ${modulePathForLog}');
    console.log('[SHERLO:mock] Using require path: ${requirePathForLog}');
    realModule = ${requireStatement};
    console.log('[SHERLO:mock] Successfully loaded real module for ${modulePathForLog}:', realModule);
    console.log('[SHERLO:mock] Real module type:', typeof realModule);
    console.log('[SHERLO:mock] Real module keys:', realModule ? Object.keys(realModule) : 'null');
  } catch (e) {
    // If :real doesn't work, try direct require (might work for some cases)
    console.warn('[SHERLO:mock] Failed to load real module for ${modulePathForLog}');
    console.warn('[SHERLO:mock] Require path used: ${requirePathForLog}');
    console.warn('[SHERLO:mock] Error message:', e.message);
    console.warn('[SHERLO:mock] Error name:', e.name);
    console.warn('[SHERLO:mock] Error stack:', e.stack);
    try {
      // Try direct require with resolved path (for relative imports) or original name (for packages)
      console.log('[SHERLO:mock] Trying fallback require for ${modulePathForLog}');
      console.log('[SHERLO:mock] Fallback path: ${fallbackPathForLog}');
      realModule = ${fallbackRequireStatement};
      console.log('[SHERLO:mock] Fallback require succeeded:', realModule);
    } catch (e2) {
      console.warn('[SHERLO:mock] Fallback require also failed');
      console.warn('[SHERLO:mock] Fallback error message:', e2.message);
      console.warn('[SHERLO:mock] Fallback error stack:', e2.stack);
      realModule = null;
    }
  }
  return realModule;
};
// Try to load immediately (Metro will process this during bundling)
loadRealModule();

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
  if (realModule) {
    console.log('[SHERLO:mock] Using real default export for story:', storyId);
    return realModule.default || realModule;
  } else {
    console.warn('[SHERLO:mock] No default mock found for story "' + storyId + '" and real module not available');
    // Try to require the real module one more time (in case it wasn't available at module load time)
    // This handles cases where the module becomes available later
    try {
      const lateRealModule = require('${packageName}:real');
      if (lateRealModule) {
        console.log('[SHERLO:mock] Successfully loaded real module on second attempt');
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
  // mockDir and cacheFilePath were already defined earlier
  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }
  
  // safeFileName was already defined earlier, reuse it
  const mockFilePath = path.join(mockDir, `${safeFileName}.js`);
  fs.writeFileSync(mockFilePath, mockCode, 'utf-8');
  
  // Also write JSON cache file for merging across Metro worker processes
  // Serialize the mocks (preserve __isFunction markers for functions)
  const cacheData: Record<string, Record<string, any>> = {};
  for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
    cacheData[storyId] = {};
    for (const [exportName, exportValue] of Object.entries(mock)) {
      // Preserve __isFunction and __isClass markers when writing to cache
      if (exportValue && typeof exportValue === 'object') {
        if ((exportValue as any).__isFunction || (exportValue as any).__isClass) {
          cacheData[storyId][exportName] = exportValue;
        } else {
          // For nested objects, recursively preserve markers
          cacheData[storyId][exportName] = exportValue;
        }
      } else if (typeof exportValue === 'function') {
        // Convert functions to __isFunction objects for JSON serialization
        cacheData[storyId][exportName] = {
          __isFunction: true,
          __code: exportValue.toString(),
        };
      } else {
        cacheData[storyId][exportName] = exportValue;
      }
    }
  }
  // cacheFilePath was already defined earlier
  fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  
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

