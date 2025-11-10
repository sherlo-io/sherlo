/**
 * Generates a mock file that uses serialization to store mocks
 * Mocks are extracted from story files during Metro bundling (AOT) and serialized
 * The generated mock file selects the correct mock at runtime based on the current story ID
 */

import * as path from 'path';
import * as fs from 'fs';
import type { StoryMockMap } from './types';
import { serializeMockValue, isSerializedFunction, isSerializedClass } from './mockSerialization';
import { resolvePathForMockFile } from './mockGeneration/pathResolution';
import { generateMockProperty } from './mockGeneration/mockPropertyGenerators';
import { generateMockFileTemplate } from './mockGeneration/mockFileTemplate';
import { MOCK_DIR_NAME } from './constants';


/**
 * Generates a mock file for a package that checks getCurrentStory() at runtime
 *
 * @param packageName - The package/module name to generate a mock for
 * @param storyMocks - Map of story IDs to their package mocks
 * @param projectRoot - The project root directory
 * @param fileName - Optional custom file name (defaults to normalized package name)
 * @returns The path to the generated mock file
 */
export function generateMockFile(
  packageName: string,
  storyMocks: StoryMockMap,
  projectRoot: string,
  fileName?: string
): string {
  // Resolve the real module path upfront (for use in generated code)
  const { realModulePath, requirePathForMockFile } = resolvePathForMockFile(packageName, projectRoot);

  // Collect all mocks for this package across all stories
  let packageMocksByStory: Record<string, any> = {};

  // Read existing mocks from JSON cache (to merge across Metro worker processes)
  const mockDir = path.join(projectRoot, 'node_modules', MOCK_DIR_NAME);
  const safeFileName = fileName || packageName.replace(/\//g, '__');
  const cacheFilePath = path.join(mockDir, `${safeFileName}.json`);

  if (fs.existsSync(cacheFilePath)) {
    try {
      const existingCache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      packageMocksByStory = existingCache;
    } catch {
      // Failed to read cache, will use only new mocks
    }
  }

  // Merge new mocks from the Map
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
  const generateMockPropertyForExport = (exportName: string) => {
    const firstStoryMock = actualMocksByStory[storyIds[0]];
    const firstExportValue = firstStoryMock?.[exportName];
    const firstMock = storyMocksSerialized[storyIds[0]][exportName];

    return generateMockProperty({
      packageName,
      exportName,
      firstStoryMock,
      firstExportValue,
      firstMock,
    });
  };

  // Build the require statement and module path strings for code generation
  // Escape quotes properly for use in template strings
  const requirePathEscaped = requirePathForMockFile!.replace(/'/g, "\\'");
  const requireStatement = `require('${requirePathEscaped}')`;

  // Fallback: for relative paths, try direct require; for packages, try without :real
  const fallbackPath = packageName.startsWith('.') || packageName.startsWith('/')
    ? requirePathForMockFile! // Already calculated relative path (no :real)
    : packageName; // Try direct package name (without :real)
  const fallbackPathEscaped = fallbackPath.replace(/'/g, "\\'");
  const fallbackRequireStatement = `require('${fallbackPathEscaped}')`;

  const modulePathForLog = JSON.stringify(realModulePath || packageName);
  const requirePathForLog = JSON.stringify(requirePathForMockFile);
  const fallbackPathForLog = JSON.stringify(fallbackPath);

  // Generate the mock file code using the template
  const mockCode = generateMockFileTemplate({
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
    generateMockProperty: generateMockPropertyForExport,
  });

  // Write to a temp location that Metro can resolve
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
      console.error(`[SHERLO] Failed to generate mock file for "${packageName}":`, error.message);
    }
  }

  return mockFiles;
}
