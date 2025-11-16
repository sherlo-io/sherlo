/**
 * Generates mock files that match story file structure exactly
 * Mocks are extracted from story files and generated as TypeScript code
 * Metro handles TypeScript transformation automatically
 */

import * as path from 'path';
import * as fs from 'fs';
import type { StoryMockMap } from './types';
import { resolvePathForMockFile } from './mockGeneration/pathResolution';
import { MOCK_DIR_NAME, SHERLO_DIR_NAME } from './constants';


/**
 * Generates mock file content in memory (without writing to disk)
 * Used for hash comparison before writing
 * 
 * @param packageName - The package/module name to generate mock content for
 * @param storyMocks - Map of story IDs to their package mocks
 * @param projectRoot - The project root directory
 * @returns The generated JavaScript content (as string)
 */
export function generateMockFileContent(
  packageName: string,
  storyMocks: StoryMockMap,
  projectRoot: string
): string {
  // This is the same logic as generateMockFile, but returns content instead of writing
  // We duplicate the logic here to avoid refactoring generateMockFile
  const { realModulePath, requirePathForMockFile } = resolvePathForMockFile(packageName, projectRoot);

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

  const storyMocksCode: Record<string, string> = {};
  for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
    if (mock && typeof mock === 'object' && (mock as any).__code) {
      storyMocksCode[storyId] = (mock as any).__code;
    } else {
      storyMocksCode[storyId] = '{}';
    }
  }

  // Get export names and types (simplified version - reuse logic from generateMockFile if needed)
  // For now, use a simpler approach: extract from mock code
  let exportNames: string[] = [];
  let exportTypes: Record<string, 'function' | 'constant'> = {};
  let hasDefaultExport = false;

  for (const mockCode of Object.values(storyMocksCode)) {
    if (mockCode && typeof mockCode === 'string' && mockCode.includes('default:')) {
      hasDefaultExport = true;
      break;
    }
  }

  // Extract export names from mock code
  const allPropertyNames = new Set<string>();
  for (const mockCode of Object.values(storyMocksCode)) {
    if (mockCode && typeof mockCode === 'string') {
      const propMatches = mockCode.match(/(\w+)\s*:/g);
      if (propMatches) {
        propMatches.forEach(match => {
          const propName = match.replace(/\s*:$/, '');
          if (propName !== 'default') {
            allPropertyNames.add(propName);
          }
        });
      }
    }
  }
  exportNames = Array.from(allPropertyNames);
  for (const exportName of exportNames) {
    exportTypes[exportName] = 'function'; // Default to function
  }

  const requirePathEscaped = requirePathForMockFile!.replace(/'/g, "\\'");
  const requireStatement = `require('${requirePathEscaped}')`;
  const fallbackPath = packageName.startsWith('.') || packageName.startsWith('/')
    ? requirePathForMockFile!
    : packageName;
  const fallbackPathEscaped = fallbackPath.replace(/'/g, "\\'");
  const fallbackRequireStatement = `require('${fallbackPathEscaped}')`;

  const { generateSimpleMockFileTemplate } = require('./mockGeneration/simpleMockFileTemplate');
  const mockCodeTS = generateSimpleMockFileTemplate({
    packageName,
    requireStatement,
    fallbackRequireStatement,
    storyMocksCode,
    exportNames,
    exportTypes,
    hasDefaultExport,
  });

  // Transform TypeScript → JavaScript
  let mockCodeJS: string;
  try {
    let babel: any;
    try {
      babel = require('@babel/core');
    } catch {
      const babelPath = require.resolve('@babel/core', {
        paths: [projectRoot, path.join(projectRoot, 'node_modules')],
      });
      babel = require(babelPath);
    }
    
    const convertAsyncArrowsPlugin = require('./mockGeneration/babelPluginConvertAsyncArrows').default;
    const transformed = babel.transformSync(mockCodeTS, {
      presets: [['@babel/preset-typescript', { isTSX: false }]],
      plugins: [convertAsyncArrowsPlugin],
      configFile: false,
      babelrc: false,
      filename: `${packageName}.ts`,
    });
    
    mockCodeJS = transformed?.code || mockCodeTS;
  } catch {
    mockCodeJS = mockCodeTS;
  }

  return mockCodeJS;
}

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
  // With pre-generation, all mocks are extracted before Metro starts, so no need for JSON cache
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
  
  // With simplified extraction, each story mock is: { 'package-name': { __code: "{ fn1: ..., fn2: ... }" } }
  // We extract the whole object as a string, so we just need to get the __code value
  const storyMocksCode: Record<string, string> = {};
  
  for (const [storyId, mock] of Object.entries(packageMocksByStory)) {
    // mock is the value from packageMocks.get(packageName), which is { __code: "..." }
    // So mock itself is { __code: "..." }, not { 'package-name': { __code: "..." } }
    if (mock && typeof mock === 'object' && (mock as any).__code) {
      // Store the whole object code string directly
      storyMocksCode[storyId] = (mock as any).__code;
    } else {
      console.warn(`[SHERLO] Unexpected mock structure for story ${storyId}, expected { __code: "..." }`);
      console.warn(`[SHERLO] Mock type: ${typeof mock}, Mock keys: ${mock && typeof mock === 'object' ? Object.keys(mock).join(', ') : 'N/A'}`);
      storyMocksCode[storyId] = '{}';
    }
  }

  // Get export names and types from the real module (we need these for runtime functions/constants)
  // Try to require the real module to get its exports
  let exportNames: string[] = [];
  let exportTypes: Record<string, 'function' | 'constant'> = {};
  let hasDefaultExport = false;
  
  // Check if any mock objects have a 'default' property to determine hasDefaultExport
  // This is important for packages like testHelper that only have default exports
  for (const mockCode of Object.values(storyMocksCode)) {
    if (mockCode && typeof mockCode === 'string') {
      // Check if the mock code contains 'default:' property
      if (mockCode.includes('default:')) {
        hasDefaultExport = true;
        if (!exportNames.includes('default')) {
          exportNames.push('default');
        }
        break;
      }
    }
  }
  
  try {
    // Try to require the real module to inspect its exports
    // Use absolute path if available, otherwise try relative path
    const { realModuleAbsolutePath } = resolvePathForMockFile(packageName, projectRoot);
    const modulePathToRequire = realModuleAbsolutePath || realModulePath;
    
    if (modulePathToRequire) {
      // Try to require the real module
      // First try the path as-is, then try compiled version from dist/ if it's a .ts file
      let realModule = null;
      let triedPaths: string[] = [];
      
      // Try 1: Direct require (works for .js files or compiled modules)
      try {
        delete require.cache[require.resolve(modulePathToRequire)];
        realModule = require(modulePathToRequire);
        triedPaths.push(modulePathToRequire);
      } catch (e1: any) {
        // Try 2: If it's a .ts file, try the compiled version from dist/
        if (modulePathToRequire.endsWith('.ts') || modulePathToRequire.endsWith('.tsx')) {
          const distPath = modulePathToRequire
            .replace(/\/src\//, '/dist/')
            .replace(/\.tsx?$/, '.js');
          try {
            delete require.cache[require.resolve(distPath)];
            realModule = require(distPath);
            triedPaths.push(distPath);
          } catch (e2: any) {
            // Try 3: If packageName is a relative path, try resolving from testing-components/dist
            if (packageName.startsWith('../') || packageName.startsWith('./')) {
              const testingComponentsDist = path.join(projectRoot, '../testing-components/dist', packageName.replace(/^\.\.\//, ''));
              const distPath2 = testingComponentsDist.replace(/\.tsx?$/, '.js');
              try {
                delete require.cache[require.resolve(distPath2)];
                realModule = require(distPath2);
                triedPaths.push(distPath2);
              } catch (e3: any) {
                // All attempts failed
              }
            }
          }
        }
      }
      
      if (realModule && typeof realModule === 'object') {
        exportNames = Object.keys(realModule).filter(key => key !== '__esModule');
        hasDefaultExport = realModule.default !== undefined;
        if (hasDefaultExport && !exportNames.includes('default')) {
          exportNames.push('default');
        }
        
        // Determine type of each export (function vs constant)
        for (const exportName of exportNames) {
          const exportValue = realModule[exportName];
          // Check if it's a function (including arrow functions assigned to const)
          exportTypes[exportName] = typeof exportValue === 'function' ? 'function' : 'constant';
        }
        
        // If real module loaded but has no exports (common for ES modules or native modules),
        // fall back to extracting from mock code
        if (exportNames.length === 0) {
          console.log(`[SHERLO] Real module loaded for ${packageName} but has no enumerable exports (likely ES module or native module). Falling back to mock code extraction.`);
          // Throw to trigger fallback extraction from mock code
          throw new Error(`Real module has no enumerable exports`);
        }
      } else if (triedPaths.length > 0) {
        // We tried to load but failed - throw error to trigger fallback
        throw new Error(`Could not load module from any of: ${triedPaths.join(', ')}`);
      }
    }
  } catch (error: any) {
    // Real module not available - try to infer from mock object code
    console.warn(`[SHERLO] Could not load real module for ${packageName} to determine export types:`, error.message);
    // Parse ALL mock objects to get property names (union of all properties)
    try {
      const allPropertyNames = new Set<string>();
      for (const [storyId, mockCode] of Object.entries(storyMocksCode)) {
        if (mockCode && typeof mockCode === 'string') {
          // Debug: log first mock code sample for troubleshooting
          if (allPropertyNames.size === 0) {
            console.log(`[SHERLO] 🔍 Extracting exports from mock code for ${packageName}. First mock code sample (${storyId}): ${mockCode.substring(0, 200)}`);
          }
          
          // Simple regex to extract property names from object: { prop1: ..., prop2: ... }
          // Match: word characters followed by colon (property name)
          const propMatches = mockCode.match(/(\w+)\s*:/g);
          if (propMatches) {
            propMatches.forEach(match => {
              const propName = match.replace(/\s*:$/, '');
              // Skip 'default' as it's handled separately
              // Skip nested property names (like 'languageCode', 'regionCode' inside arrays/objects)
              // We only want top-level property names
              if (propName !== 'default') {
                allPropertyNames.add(propName);
              }
            });
            console.log(`[SHERLO] 🔍 Found ${propMatches.length} property matches in mock code for ${storyId}: ${Array.from(propMatches).join(', ')}`);
          } else {
            console.warn(`[SHERLO] ⚠️  No property matches found in mock code for ${storyId}. Mock code: ${mockCode.substring(0, 150)}`);
          }
        }
      }
      
      if (allPropertyNames.size > 0) {
        exportNames = Array.from(allPropertyNames);
        // Default all to function if we can't determine from real module
        // This is a fallback - ideally we should be able to require the real module
        console.log(`[SHERLO] ✅ Falling back to inferring export types from mock code for ${packageName}. Found exports: ${exportNames.join(', ')}. All exports default to 'function'.`);
        for (const exportName of exportNames) {
          exportTypes[exportName] = 'function';
        }
      } else {
        console.warn(`[SHERLO] ⚠️  Could not extract any export names from mock code for ${packageName}. Mock code samples:`, Object.values(storyMocksCode).slice(0, 2).map((code: any) => typeof code === 'string' ? code.substring(0, 100) : String(code).substring(0, 100)));
        exportNames = [];
      }
    } catch (parseError: any) {
      console.warn(`[SHERLO] Could not determine export names for ${packageName}, using empty list:`, parseError.message);
      exportNames = [];
    }
  }
  
  const namedExportNames = exportNames.filter(name => name !== 'default');
  
  // Log final export configuration for debugging
  console.log(`[SHERLO] 📦 Generating mock file for ${packageName}:`);
  console.log(`[SHERLO]    - Export names: ${exportNames.length > 0 ? exportNames.join(', ') : '(none)'}`);
  console.log(`[SHERLO]    - Named exports: ${namedExportNames.length > 0 ? namedExportNames.join(', ') : '(none)'}`);
  console.log(`[SHERLO]    - Has default export: ${hasDefaultExport}`);
  console.log(`[SHERLO]    - Export types: ${Object.keys(exportTypes).length > 0 ? Object.entries(exportTypes).map(([k, v]) => `${k}:${v}`).join(', ') : '(none)'}`);

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

  // Generate mock file using simplified template (matches story file structure)
  // This generates TypeScript code (may contain type annotations)
  const { generateSimpleMockFileTemplate } = require('./mockGeneration/simpleMockFileTemplate');
  const mockCodeTS = generateSimpleMockFileTemplate({
    packageName,
    requireStatement,
    fallbackRequireStatement,
    storyMocksCode,
    exportNames,
    exportTypes,
    hasDefaultExport,
  });

  // Transform TypeScript → JavaScript using Babel's preset-typescript
  // This automatically strips all TypeScript syntax (types, type annotations, etc.)
  let mockCodeJS: string;
  try {
    // Try to resolve @babel/core from project root (for EAS builds)
    let babel: any;
    try {
      babel = require('@babel/core');
    } catch {
      const projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
      const babelPath = require.resolve('@babel/core', {
        paths: [
          projectRoot,
          path.join(projectRoot, 'node_modules'),
          path.join(projectRoot, '../../node_modules'),
        ],
      });
      babel = require(babelPath);
    }
    
    // Try to resolve @babel/preset-typescript
    try {
      require.resolve('@babel/preset-typescript');
    } catch {
      const projectRoot = (global as any).__SHERLO_PROJECT_ROOT__ || process.cwd();
      require.resolve('@babel/preset-typescript', {
        paths: [
          projectRoot,
          path.join(projectRoot, 'node_modules'),
          path.join(projectRoot, '../../node_modules'),
        ],
      });
    }
    
                // Import the plugin to convert async arrow functions
                const convertAsyncArrowsPlugin = require('./mockGeneration/babelPluginConvertAsyncArrows').default;
                
                const transformed = babel.transformSync(mockCodeTS, {
                  presets: [
                    ['@babel/preset-typescript', { isTSX: false }],
                  ],
                  plugins: [
                    convertAsyncArrowsPlugin,
                  ],
                  configFile: false,
                  babelrc: false,
                  filename: `${packageName}.ts`, // Helpful for error messages
                });
    
    if (!transformed || !transformed.code) {
      throw new Error('Babel transformation returned no code');
    }
    
    mockCodeJS = transformed.code;
    
    // Verify transformation worked - check for TypeScript syntax
    if (mockCodeJS.match(/:\s*(number|string|boolean|any|void|object)\s*[=,)]/)) {
      console.warn(`[SHERLO] ⚠️  Warning: TypeScript types may still be present in transformed code for ${packageName}`);
      console.warn(`[SHERLO] First 200 chars of transformed code: ${mockCodeJS.substring(0, 200)}`);
    }
  } catch (error: any) {
    console.error(`[SHERLO] ❌ Failed to transform TypeScript → JavaScript for ${packageName}:`, error.message);
    console.error(`[SHERLO] Error stack:`, error.stack);
    console.error(`[SHERLO] First 500 chars of TS code: ${mockCodeTS.substring(0, 500)}`);
    // Fallback: use TS code as-is (will likely fail, but better than crashing)
    console.error(`[SHERLO] ⚠️  Using TypeScript code as fallback (this will likely cause build errors)`);
    mockCodeJS = mockCodeTS;
  }

  const { getMockDirectory } = require('./constants');
  const mockDir = getMockDirectory(projectRoot);
  
  if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
  }

  // Generate filename-safe version (replace / with __)
  const safeFileName = fileName || packageName.replace(/\//g, '__');
  
  // Write JavaScript file (TypeScript types already stripped by Babel)
  const mockFilePath = path.join(mockDir, `${safeFileName}.js`);
  
  // CRITICAL: Always write fresh file to ensure Metro sees it as new
  // This prevents Metro from using stale cached transforms
  // Delete file first if it exists to ensure fresh timestamp
  if (fs.existsSync(mockFilePath)) {
    try {
      fs.unlinkSync(mockFilePath);
    } catch (error: any) {
      // Ignore errors (file might be locked)
    }
  }
  
  fs.writeFileSync(mockFilePath, mockCodeJS, 'utf-8');
  
  // Touch the file to ensure it has a fresh modification time
  // This helps Metro detect the file as changed even if content is similar
  const now = Date.now();
  try {
    fs.utimesSync(mockFilePath, now / 1000, now / 1000);
  } catch (error: any) {
    // Ignore errors (utimes might not be available on all platforms)
  }

  return mockFilePath;
}

/**
 * Generates mock files for all packages that have mocks
 * 
 * @param storyMocks - Map of story IDs to their package mocks
 * @param projectRoot - The project root directory
 * @param clearCache - If true, clears existing cache files before generation (used during pre-generation)
 */
export function generateAllMockFiles(
  storyMocks: StoryMockMap,
  projectRoot: string,
  clearCache: boolean = false
): Map<string, string> {
  const mockFiles = new Map<string, string>();

  // Collect all unique packages/modules that have mocks
  const packages = new Set<string>();
  for (const [, packageMocks] of storyMocks.entries()) {
    for (const pkgName of packageMocks.keys()) {
      packages.add(pkgName);
    }
  }

  const { getMockDirectory } = require('./constants');
  const mockDir = getMockDirectory(projectRoot);

  // Clear old mock files if requested (during pre-generation, we want fresh generation)
  if (clearCache) {
    if (fs.existsSync(mockDir)) {
      // Clear old JSON cache files (legacy, no longer needed)
      const cacheFiles = fs.readdirSync(mockDir).filter(file => file.endsWith('.json'));
      for (const cacheFile of cacheFiles) {
        const cacheFilePath = path.join(mockDir, cacheFile);
        try {
          fs.unlinkSync(cacheFilePath);
        } catch (error: any) {
          // Ignore errors (file might not exist or be locked)
        }
      }
      if (cacheFiles.length > 0) {
        console.log(`[SHERLO] Cleared ${cacheFiles.length} legacy JSON cache file(s)`);
      }
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
