/**
 * Generates a mock file that uses serialization to store mocks
 * Mocks are extracted from story files during Metro bundling (AOT) and serialized
 * The generated mock file selects the correct mock at runtime based on the current story ID
 */

import * as path from 'path';
import * as fs from 'fs';
import { StoryMockMap } from './mockExtraction';
import {
  serializeMockValue,
  generateDeserializeFunctionsCode,
  generateFunctionCreationCode,
  isSerializedFunction,
  isSerializedClass,
  generateFunctionsObjectCode,
} from './mockSerialization';

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
    
    // console.log(`[SHERLO:mockGen] Resolving relative path: ${packageName}`);
    // console.log(`[SHERLO:mockGen] Project root: ${projectRoot}`);
    
    for (const baseDir of possibleBaseDirs) {
      const resolvedPath = path.resolve(baseDir, packageName);
      // console.log(`[SHERLO:mockGen] Trying to resolve from ${baseDir}: ${resolvedPath}`);
      const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
      for (const ext of extensions) {
        const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
        if (fs.existsSync(fullPath)) {
          // console.log(`[SHERLO:mockGen] Found file at: ${fullPath}`);
          realModuleAbsolutePath = fullPath;
          // Calculate relative path from mock file location to real module
          // Mock file is at: node_modules/.sherlo-mocks/..__utils__testHelper.js
          // Real module is at: testing-components/src/utils/testHelper.ts
          const mockFileDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
          const relativeFromMockFile = path.relative(mockFileDir, fullPath);
          // console.log(`[SHERLO:mockGen] Relative from mock file (${mockFileDir}) to real module (${fullPath}): ${relativeFromMockFile}`);
          // Remove extension for require()
          requirePathForMockFile = relativeFromMockFile.replace(/\.(ts|tsx|js|jsx)$/, '');
          // Normalize path separators for require()
          requirePathForMockFile = requirePathForMockFile.replace(/\\/g, '/');
          // Ensure it starts with ./ or ../ for relative requires
          if (!requirePathForMockFile.startsWith('.')) {
            requirePathForMockFile = './' + requirePathForMockFile;
          }
          realModulePath = path.relative(projectRoot, fullPath).replace(/\.(ts|tsx|js|jsx)$/, '');
          // console.log(`[SHERLO:mockGen] Resolved relative path ${packageName} to ${realModulePath}`);
          // console.log(`[SHERLO:mockGen] Using require path from mock file: ${requirePathForMockFile}`);
          break;
        }
      }
      if (realModulePath) break;
    }
    
    if (!realModulePath) {
      // console.warn(`[SHERLO:mockGen] Could not find file for relative path ${packageName} in any of the checked directories`);
    }
  } else {
    // For package names, use :real suffix to bypass our mock redirect
    realModulePath = packageName;
    requirePathForMockFile = `${packageName}:real`;
  }
  
  // Fallback: if we couldn't resolve the path, use :real suffix
  if (!requirePathForMockFile) {
    requirePathForMockFile = `${packageName}:real`;
    // console.warn(`[SHERLO:mockGen] Could not resolve path for ${packageName}, using :real suffix`);
  }
  
  // Collect all mocks for this package across all stories
  let packageMocksByStory: Record<string, any> = {};
  
  // Debug: log all story IDs in the Map
  // const allStoryIds = Array.from(storyMocks.keys());
  // if (packageName === 'expo-localization') {
  //   console.log(`[SHERLO:mockGen] Generating mock for ${packageName}, total story IDs in Map: ${allStoryIds.length}`);
  //   console.log(`[SHERLO:mockGen] Story IDs containing 'multiplenamedexports':`, allStoryIds.filter(id => id.includes('multiplenamedexports')));
  // }
  
  // Read existing mocks from JSON cache (to merge across Metro worker processes)
  const mockDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
  const safeFileName = fileName || packageName.replace(/\//g, '__');
  const cacheFilePath = path.join(mockDir, `${safeFileName}.json`);
  
  if (fs.existsSync(cacheFilePath)) {
    try {
      const existingCache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      packageMocksByStory = existingCache;
      // if (packageName === 'expo-localization') {
      //   console.log(`[SHERLO:mockGen] Loaded ${Object.keys(packageMocksByStory).length} existing mocks from cache`);
      // }
    } catch (error: any) {
      // console.warn(`[SHERLO:mockGen] Failed to read cache file ${cacheFilePath}:`, error.message);
    }
  }
  
  // Merge new mocks from the Map
  for (const [storyId, packageMocks] of storyMocks.entries()) {
    const pkgMock = packageMocks.get(packageName);
    if (pkgMock) {
      // TEST: Check if we're storing null for functions/classes
      for (const [exportName, exportValue] of Object.entries(pkgMock)) {
        if (exportValue === null || exportValue === undefined) {
          // Check if this looks like it should be a function/class based on naming
          const looksLikeFunction = exportName.toLowerCase().includes('fetch') || 
                                    exportName.toLowerCase().includes('get') || 
                                    exportName.toLowerCase().includes('process') ||
                                    exportName.toLowerCase().includes('calculate') ||
                                    exportName.toLowerCase().includes('add') ||
                                    exportName.toLowerCase().includes('subtract');
          const looksLikeClass = exportName[0] === exportName[0].toUpperCase() && 
                                (exportName.includes('Processor') || exportName.includes('Calculator') || exportName.includes('Utils'));
          if (looksLikeFunction || looksLikeClass) {
            console.error(`[SHERLO:mockGen] TEST FAILURE: ${exportName} in ${packageName} (story: ${storyId}) is null but should be ${looksLikeFunction ? 'function' : 'class'}`);
          }
        }
      }
      packageMocksByStory[storyId] = pkgMock;
    }
  }
  
  // if (packageName === 'expo-localization') {
  //   console.log(`[SHERLO:mockGen] Found ${Object.keys(packageMocksByStory).length} stories with mocks for ${packageName} (after merge)`);
  //   console.log(`[SHERLO:mockGen] Story IDs with mocks:`, Object.keys(packageMocksByStory).filter(id => id.includes('multiplenamedexports')));
  // }
  
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

  // Separate functions/classes from primitives/objects
  // Functions/classes will be embedded as actual code, avoiding runtime deserialization
  const storyMocksFunctions: Record<string, Record<string, string>> = {}; // Store function/class code strings
  const storyMocksValues: Record<string, Record<string, string>> = {}; // Store primitives/objects as JSON strings
  
  for (const [storyId, mock] of Object.entries(actualMocksByStory)) {
    storyMocksFunctions[storyId] = {};
    storyMocksValues[storyId] = {};
    
    for (const [exportName, exportValue] of Object.entries(mock)) {
      const serialized = serializeMockValue(exportValue);
      
      // Check if it's a function or class (code string)
      // Arrow functions can start with various patterns: "() =>", "(arg) =>", "async () =>", etc.
      const trimmed = typeof serialized === 'string' ? serialized.trim() : '';
      const isFunctionCode = typeof serialized === 'string' && (
        trimmed.startsWith('class ') ||
        trimmed.startsWith('function') ||
        trimmed.startsWith('async') ||
        serialized.includes('=>') ||
        trimmed.startsWith('(')
      );
      
      if (isFunctionCode) {
        // Store function/class code directly (will be embedded as actual code)
        storyMocksFunctions[storyId][exportName] = serialized;
      } else {
        // Store primitives/objects as JSON strings
        storyMocksValues[storyId][exportName] = JSON.stringify(serialized);
      }
    }
  }
  
  // Debug: Log if MockTestingStory variants are missing
  if (packageName === 'expo-localization') {
    const mockTestingStoryIds = Object.keys(storyMocksFunctions).filter(id => id.includes('mocktestingstory'));
    if (mockTestingStoryIds.length === 0) {
      console.warn(`[SHERLO:mockGen] No MockTestingStory variants found in storyMocks_functions for ${packageName}`);
      console.warn(`[SHERLO:mockGen] Available story IDs:`, Object.keys(storyMocksFunctions).slice(0, 10));
    } else {
      console.log(`[SHERLO:mockGen] Found MockTestingStory variants:`, mockTestingStoryIds);
      for (const storyId of mockTestingStoryIds) {
        console.log(`[SHERLO:mockGen]   ${storyId}:`, Object.keys(storyMocksFunctions[storyId]));
      }
    }
  }
  
  // For backward compatibility during transition, also create the old format
  const storyMocksSerialized: Record<string, Record<string, any>> = {};
  for (const [storyId, mock] of Object.entries(actualMocksByStory)) {
    storyMocksSerialized[storyId] = {};
    for (const [exportName, exportValue] of Object.entries(mock)) {
      const serialized = serializeMockValue(exportValue);
      if (typeof serialized === 'string' && (serialized.startsWith('class ') || serialized.startsWith('function') || serialized.startsWith('async') || serialized.includes('=>') || serialized.startsWith('('))) {
        storyMocksSerialized[storyId][exportName] = serialized;
      } else if (typeof serialized === 'object' && serialized !== null) {
        storyMocksSerialized[storyId][exportName] = JSON.stringify(serialized);
      } else {
        storyMocksSerialized[storyId][exportName] = JSON.stringify(serialized);
      }
    }
  }
  
  // Helper function to generate mock property (for named exports only)
  const generateMockProperty = (exportName: string) => {
    // Check the original object (before serialization) to detect class, function, and special value markers
    const firstStoryMock = actualMocksByStory[storyIds[0]];
    const firstExportValue = firstStoryMock?.[exportName];
    const isClassFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isClass;
    const isFunctionFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isFunction;
    const isNaNFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isNaN;
    const isInfinityFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isInfinity;
    const isNegativeInfinityFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isNegativeInfinity;
    const isDateFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isDate;
    const isRegExpFromObject = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__isRegExp;
    
    // For named exports, check if it's a function, class, or value (after serialization)
    const firstMock = storyMocksSerialized[storyIds[0]][exportName];
    const isClass = isClassFromObject || (firstMock && isSerializedClass(firstMock));
    const isFunction = !isClass && (isFunctionFromObject || (firstMock && isSerializedFunction(firstMock)));
    
    if (isClass) {
      // For classes, use storyMocks_functions (classes stored as actual code, no eval needed)
      return `  get ${exportName}() {
    const storyId = getCurrentStory();
    // console.log('[SHERLO:mock] ${packageName}.${exportName} accessed for story:', storyId);
    
    // Check storyMocks_functions first (classes stored as actual code, no deserialization needed)
    if (storyMocks_functions[storyId] && storyMocks_functions[storyId].${exportName}) {
      const mockClass = storyMocks_functions[storyId].${exportName};
      if (typeof mockClass === 'function' || (typeof mockClass === 'object' && mockClass !== null)) {
        // console.log('[SHERLO:mock] Returning ${exportName} class:', mockClass);
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
      // console.log('[SHERLO:mock] Using real ${exportName} class for story:', storyId);
      return realClass;
    } else {
      console.warn('[SHERLO:mock] No ${exportName} mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    } else if (isFunction) {
      return `  ${exportName}: function(...args) {
    const storyId = getCurrentStory();
    // console.log('[SHERLO:mock] ${packageName}.${exportName} called for story:', storyId);
    
    // Check storyMocks_functions first (functions stored as actual code, no deserialization needed)
    if (storyMocks_functions[storyId] && storyMocks_functions[storyId].${exportName}) {
      const mockFn = storyMocks_functions[storyId].${exportName};
      if (typeof mockFn === 'function') {
        const result = mockFn(...args);
        // console.log('[SHERLO:mock] Returning mock result:', result);
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
      // console.log('[SHERLO:mock] Using real implementation for story:', storyId);
      return realFn(...args);
    } else {
      console.warn('[SHERLO:mock] No mock found for story "' + storyId + '" and real module not available');
      return undefined;
    }
  }`;
    } else if (isNaNFromObject || isInfinityFromObject || isNegativeInfinityFromObject || isDateFromObject || isRegExpFromObject) {
      // Handle special values: NaN, Infinity, -Infinity, Date, RegExp
      let reconstructionCode = '';
      if (isNaNFromObject) {
        reconstructionCode = 'NaN';
      } else if (isInfinityFromObject) {
        reconstructionCode = 'Infinity';
      } else if (isNegativeInfinityFromObject) {
        reconstructionCode = '-Infinity';
      } else if (isDateFromObject) {
        // Extract date code from the first mock
        const dateCode = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__code;
        reconstructionCode = dateCode || "new Date()";
      } else if (isRegExpFromObject) {
        // Extract regex code from the first mock
        const regexCode = firstExportValue && typeof firstExportValue === 'object' && (firstExportValue as any).__code;
        reconstructionCode = regexCode || "/.*/";
      }
      
      return `  get ${exportName}() {
    const storyId = getCurrentStory();
    
    // Check storyMocks_values for special value markers
    if (storyMocks_values[storyId] && storyMocks_values[storyId].${exportName}) {
      try {
        const parsedValue = JSON.parse(storyMocks_values[storyId].${exportName});
        // Reconstruct special values recursively (handles nested objects)
        return reconstructSpecialValues(parsedValue);
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to parse ${exportName} from storyMocks_values:', e.message);
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
    } else {
      // For non-function exports (objects, constants, etc.)
      return `  get ${exportName}() {
    const storyId = getCurrentStory();
    // console.log('[SHERLO:mock] ${packageName}.${exportName} accessed for story:', storyId);
    
    // Check storyMocks_values first (primitives/objects stored as JSON strings)
    if (storyMocks_values[storyId] && storyMocks_values[storyId].${exportName} !== undefined) {
      try {
        const parsedValue = JSON.parse(storyMocks_values[storyId].${exportName});
        // Reconstruct special values recursively (handles nested objects with NaN, Infinity, Date, RegExp)
        const reconstructedValue = reconstructSpecialValues(parsedValue);
        // console.log('[SHERLO:mock] Returning ${exportName} mock:', reconstructedValue);
        return reconstructedValue;
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to parse ${exportName} from storyMocks_values:', e.message);
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
      // console.log('[SHERLO:mock] Using real ${exportName} for story:', storyId);
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
    // console.log('[SHERLO:mock] Attempting to load real module for ${modulePathForLog}');
    // console.log('[SHERLO:mock] Using require path: ${requirePathForLog}');
    realModule = ${requireStatement};
    // console.log('[SHERLO:mock] Successfully loaded real module for ${modulePathForLog}:', realModule);
    // console.log('[SHERLO:mock] Real module type:', typeof realModule);
    // console.log('[SHERLO:mock] Real module keys:', realModule ? Object.keys(realModule) : 'null');
  } catch (e) {
    // If :real doesn't work, try direct require (might work for some cases)
    // console.warn('[SHERLO:mock] Failed to load real module for ${modulePathForLog}');
    // console.warn('[SHERLO:mock] Require path used: ${requirePathForLog}');
    // console.warn('[SHERLO:mock] Error message:', e.message);
    // console.warn('[SHERLO:mock] Error name:', e.name);
    // console.warn('[SHERLO:mock] Error stack:', e.stack);
    try {
      // Try direct require with resolved path (for relative imports) or original name (for packages)
      // console.log('[SHERLO:mock] Trying fallback require for ${modulePathForLog}');
      // console.log('[SHERLO:mock] Fallback path: ${fallbackPathForLog}');
      realModule = ${fallbackRequireStatement};
      // console.log('[SHERLO:mock] Fallback require succeeded:', realModule);
    } catch (e2) {
      // console.warn('[SHERLO:mock] Fallback require also failed');
      // console.warn('[SHERLO:mock] Fallback error message:', e2.message);
      // console.warn('[SHERLO:mock] Fallback error stack:', e2.stack);
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
// TEST: Only log errors (null values where code is expected)
// console.log('[SHERLO:mockGen] TEST: Mock file loaded, checking embedded values...');
for (const [storyId, mocks] of Object.entries(storyMocks)) {
  for (const [exportName, value] of Object.entries(mocks)) {
    if ((exportName.includes('fetch') || exportName.includes('DataProcessor') || exportName.includes('Calculator')) && 
        (value === null || value === 'null')) {
      console.error('[SHERLO:mockGen] TEST FAILURE: Found null for', exportName, 'in story', storyId, '- this should be code!');
    }
    // Only log errors, not successes
    // else if (exportName.includes('fetch') && typeof value === 'string' && value.startsWith('async')) {
    //   console.log('[SHERLO:mockGen] TEST: Found CODE STRING for', exportName, 'in story', storyId, '- length:', value.length);
    // }
  }
}

// Helper to get current story ID from global
const getCurrentStory = () => {
  const storyId = (typeof global !== 'undefined' && global.__SHERLO_CURRENT_STORY_ID__) || null;
  // console.log('[SHERLO:mock] Current story ID:', storyId);
  return storyId;
};

${generateDeserializeFunctionsCode()}

// Helper to recursively reconstruct special values (NaN, Infinity, -Infinity, Date, RegExp, Getters) in nested objects
const reconstructSpecialValues = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  
  // Check if this is a marker object for special values
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.__isNaN) {
      return NaN;
    } else if (value.__isInfinity) {
      return Infinity;
    } else if (value.__isNegativeInfinity) {
      return -Infinity;
    } else if (value.__isDate && value.__code) {
      try {
        return eval(value.__code);
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to reconstruct Date:', e.message);
        return new Date();
      }
    } else if (value.__isRegExp && value.__code) {
      try {
        return eval(value.__code);
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to reconstruct RegExp:', e.message);
        return /.*/;
      }
    } else if (value.__isGetter && value.__code) {
      // For getters, we need to reconstruct the getter function
      // The code is like "get value() { return this._value; }"
      try {
        // Extract the getter function body and property name from the code
        // We'll create a getter descriptor and use Object.defineProperty
        const getterFn = new Function('return ' + value.__code)();
        return getterFn;
      } catch (e) {
        console.warn('[SHERLO:mock] Failed to reconstruct getter:', e.message);
        return undefined;
      }
    }
    
    // Check if this object has any getters that need special handling
    // If any property is a getter marker, we need to reconstruct the entire object with getters
    let hasGetters = false;
    for (const key in value) {
      if (value.hasOwnProperty(key) && value[key] && typeof value[key] === 'object' && value[key].__isGetter) {
        hasGetters = true;
        break;
      }
    }
    
    if (hasGetters) {
      // Reconstruct object with getters using Object.defineProperty
      // First, reconstruct all regular properties
      const reconstructed = {};
      const getterDescriptors = {};
      
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          if (value[key] && typeof value[key] === 'object' && value[key].__isGetter) {
            // This is a getter - store it for later definition
            getterDescriptors[key] = value[key];
          } else {
            // Regular property - reconstruct recursively
            reconstructed[key] = reconstructSpecialValues(value[key]);
          }
        }
      }
      
      // Now add getters - create functions that have access to 'reconstructed' via closure
      for (const key in getterDescriptors) {
        try {
          const getterMarker = getterDescriptors[key];
          const getterCode = getterMarker.__code;
          // Extract function body from getter code (e.g., "get value() { return this._value; }" -> "return this._value;")
          const bodyMatch = getterCode.match(/\\{([\\s\\S]*)\\}/);
          if (bodyMatch) {
            const body = bodyMatch[1].trim();
            // Create getter function that accesses 'reconstructed' via closure
            // Replace 'this' with direct reference to 'reconstructed' object
            const getterBody = body.replace(/\\bthis\\./g, 'reconstructed.');
            // Create getter function using IIFE to capture 'reconstructed' in closure
            Object.defineProperty(reconstructed, key, {
              get: (function(obj) {
                // Return a function that evaluates the getter body with 'obj' as 'reconstructed'
                // The body already contains 'return', so we just execute it directly
                return function() {
                  return new Function('reconstructed', getterBody)(obj);
                };
              })(reconstructed),
              enumerable: true,
              configurable: true
            });
          }
        } catch (e) {
          console.warn('[SHERLO:mock] Failed to reconstruct getter for', key, ':', e.message);
        }
      }
      
      return reconstructed;
    }
    
    // No getters - recursively process object properties normally
    const reconstructed = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        reconstructed[key] = reconstructSpecialValues(value[key]);
      }
    }
    return reconstructed;
  }
  
  // Recursively process arrays
  if (Array.isArray(value)) {
    return value.map(item => reconstructSpecialValues(item));
  }
  
  return value;
};

${namedExportNames.length === 0 && hasDefaultExport ? `
// Only default export - export it directly with a getter for dynamic resolution
const getDefaultExport = function() {
  const storyId = getCurrentStory();
  // console.log('[SHERLO:mock] ${packageName} (default export) accessed for story:', storyId);
  const storyMock = storyMocks[storyId];
  
  if (storyMock && storyMock.default) {
    const parsedValue = JSON.parse(storyMock.default);
    const mockValue = deserializeFunctions(parsedValue);
    // console.log('[SHERLO:mock] Returning default export mock:', mockValue);
    return mockValue;
  }
  
  // Fallback to real implementation
  if (realModule) {
    // console.log('[SHERLO:mock] Using real default export for story:', storyId);
    return realModule.default || realModule;
  } else {
    console.warn('[SHERLO:mock] No default mock found for story "' + storyId + '" and real module not available');
    // Try to require the real module one more time (in case it wasn't available at module load time)
    // This handles cases where the module becomes available later
    try {
      const lateRealModule = require('${packageName}:real');
      if (lateRealModule) {
        // console.log('[SHERLO:mock] Successfully loaded real module on second attempt');
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
    // console.log('[SHERLO:mock] ${packageName}.default accessed for story:', storyId);
    const storyMock = storyMocks[storyId];
    
    if (storyMock && storyMock.default) {
      const parsedValue = JSON.parse(storyMock.default);
      const mockValue = deserializeFunctions(parsedValue);
      // console.log('[SHERLO:mock] Returning default export mock:', mockValue);
      return mockValue;
    }
    
    // Fallback to real implementation
    try {
      const realModule = require('${packageName}:real');
      // console.log('[SHERLO:mock] Using real default export for story:', storyId);
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
  
  // console.log(`[SHERLO:mockGen] Generated mock file: ${mockFilePath} (for package: ${packageName})`);
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

