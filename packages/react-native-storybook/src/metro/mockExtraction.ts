// mockExtraction.ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * Story mock map: storyId -> packageName -> mockObject
 * Example: { "TestInfo--Basic": { "expo-localization": { getLocales: ... } } }
 */
export type StoryMockMap = Map<string, Map<string, any>>;

// Track if we've already registered TypeScript support
let tsSupportRegistered = false;

// Stub modules for React Native imports that don't exist in Node.js
const stubModules: Record<string, any> = {
  'react-native': {},
  'expo-localization': {},
  'expo-updates': {},
  '@sherlo/testing-components': {},
  '@storybook/react': {},
  '@storybook/react-native': {},
  'react': {},
  'react-dom': {},
};

// Track if module stubs are set up
let moduleStubsSetup = false;

// Hook into require to stub React Native modules
function setupModuleStubs(): void {
  if (moduleStubsSetup) {
    return;
  }
  moduleStubsSetup = true;

  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function (id: string) {
    // Check if this is a stub module
    if (stubModules[id]) {
      return stubModules[id];
    }

    // Check if it's a React Native module pattern
    if (
      id.startsWith('react-native') ||
      id.startsWith('expo-') ||
      id.startsWith('@react-native') ||
      id.startsWith('@sherlo/') ||
      id.startsWith('@storybook/')
    ) {
      // Return empty object for unknown RN modules
      return {};
    }

    // Fall back to original require
    try {
      return originalRequire.apply(this, arguments);
    } catch (error: any) {
      // If module not found and it looks like a RN module, return stub
      if (error.code === 'MODULE_NOT_FOUND') {
        // Check if it's a React Native/Expo module
        if (
          id.includes('react-native') ||
          id.includes('expo') ||
          id.includes('@react-native') ||
          id.includes('@sherlo') ||
          id.includes('@storybook')
        ) {
          return {};
        }
      }
      throw error;
    }
  };
}

/**
 * Registers TypeScript support for requiring .ts/.tsx files
 * Tries ts-node first (with transpileOnly to skip type checking), then tsx, then @babel/register
 */
function registerTypeScriptSupport(): boolean {
  if (tsSupportRegistered) {
    return true;
  }

  // Set up module stubs BEFORE registering TypeScript support
  // This allows ts-node to compile files that import React Native modules
  setupModuleStubs();

  // Try @swc/register first (fastest, best JSX/TS support, handles RN modules better)
  try {
    require('@swc/register')({
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
          decorators: false,
        },
        target: 'es2020',
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
      module: {
        type: 'commonjs',
      },
    });
    tsSupportRegistered = true;
    console.log('[SHERLO:mockExtraction] Registered @swc/register for TypeScript support');
    return true;
  } catch {
    // @swc/register not available
  }

  // Try tsx (faster alternative, handles JSX better)
  try {
    require('tsx/cjs/register');
    tsSupportRegistered = true;
    console.log('[SHERLO:mockExtraction] Registered tsx for TypeScript support');
    return true;
  } catch {
    // tsx not available
  }

  // Try ts-node with transpileOnly (skip type checking - faster and avoids Babel helper issues)
  // Use TS_NODE_TRANSPILE_ONLY environment variable to force transpile-only mode
  try {
    const tsNode = require('ts-node');
    // Set environment variable to force transpile-only
    process.env.TS_NODE_TRANSPILE_ONLY = 'true';
    process.env.TS_NODE_SKIP_PROJECT = 'true';
    
    tsNode.register({
      transpileOnly: true, // Skip type checking - just transpile
      compilerOptions: {
        module: 'commonjs',
        esModuleInterop: true,
        jsx: 'react',
        skipLibCheck: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        noEmit: true,
        moduleResolution: 'node',
        // Disable all strict checks
        strict: false,
        noImplicitAny: false,
      },
      // Ignore node_modules to avoid processing dependencies
      ignore: ['(?:^|/)node_modules/'],
    });
    tsSupportRegistered = true;
    console.log('[SHERLO:mockExtraction] Registered ts-node (transpileOnly) for TypeScript support');
    return true;
  } catch (error: any) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      console.warn('[SHERLO:mockExtraction] ts-node registration failed:', error.message);
    }
  }

  // Try @babel/register with React Native-like config
  try {
    require('@babel/register')({
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      presets: [
        ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
      ignore: [/node_modules/],
    });
    tsSupportRegistered = true;
    console.log('[SHERLO:mockExtraction] Registered @babel/register for TypeScript support');
    return true;
  } catch {
    // @babel/register not available
  }

  console.warn('[SHERLO:mockExtraction] No TypeScript loader found. Install @swc/register, tsx, ts-node, or @babel/register to extract mocks from TypeScript story files.');
  return false;
}

/**
 * Tries to require a TypeScript/JavaScript file
 * Handles both .ts/.tsx and .js/.jsx files
 */
function requireStoryFile(filePath: string): any {
  try {
    // Try to require directly (works for .js files)
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      delete require.cache[require.resolve(filePath)];
      return require(filePath);
    }

    // For TypeScript files, register support and then require
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      // Register TypeScript support if not already done
      if (!registerTypeScriptSupport()) {
        console.warn(`[SHERLO:mockExtraction] Cannot require TypeScript file ${filePath} - no TypeScript loader available`);
        return null;
      }

      // Now try to require the TypeScript file
      try {
        // Clear cache to ensure fresh load
        const resolvedPath = require.resolve(filePath);
        delete require.cache[resolvedPath];
        const module = require(resolvedPath);
        return module;
      } catch (error: any) {
        // Log the error but don't fail completely - we might still be able to extract mocks
        const errorMsg = error.message?.split('\n')[0] || error.toString();
        
        // Check if it's a TypeScript compilation error (expected with transpileOnly)
        if (errorMsg.includes('Unable to compile TypeScript') || errorMsg.includes('error TS')) {
          console.warn(`[SHERLO:mockExtraction] TypeScript compilation error for ${path.basename(filePath)} (this is expected - trying to extract mocks anyway)`);
          // Try to see if the module was partially loaded despite errors
          try {
            const resolvedPath = require.resolve(filePath);
            const cached = require.cache[resolvedPath];
            if (cached && cached.exports && Object.keys(cached.exports).length > 0) {
              console.log(`[SHERLO:mockExtraction] Module partially loaded, using cached exports`);
              return cached.exports;
            }
          } catch {
            // Ignore
          }
        } else if (error.code === 'MODULE_NOT_FOUND' || errorMsg.includes('Cannot find module')) {
          console.warn(`[SHERLO:mockExtraction] Module resolution error for ${path.basename(filePath)}:`, errorMsg);
        } else {
          console.warn(`[SHERLO:mockExtraction] Failed to require ${path.basename(filePath)}:`, errorMsg);
        }
        return null;
      }
    }

    // Default: try to require as-is
    delete require.cache[require.resolve(filePath)];
    return require(filePath);
  } catch (error: any) {
    console.warn(`[SHERLO:mockExtraction] Failed to require ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Extracts component name from story file path
 * Example: "TestInfo" from "/path/to/TestInfo.stories.tsx"
 */
function getComponentNameFromPath(filePath: string): string {
  const fileName = path.basename(filePath, path.extname(filePath));
  return fileName.replace(/\.stories$/, '');
}

/**
 * Extracts mocks from a single story file by requiring it
 * Returns a map of storyId -> packageName -> mockObject
 */
function extractMocksFromStoryFile(storyFilePath: string, projectRoot: string): StoryMockMap {
  const mocks = new Map<string, Map<string, any>>();
  
  try {
    console.log(`[SHERLO:mockExtraction] Loading story file: ${path.relative(projectRoot, storyFilePath)}`);
    
    // Require the story file
    const storyModule = requireStoryFile(storyFilePath);
    
    if (!storyModule) {
      console.warn(`[SHERLO:mockExtraction] Could not load ${storyFilePath}`);
      return mocks;
    }

    // Get component name from file path
    const componentName = getComponentNameFromPath(storyFilePath);
    
    // Extract all non-default exports (these are the story variants)
    const exports = Object.keys(storyModule).filter(key => key !== 'default');
    
    console.log(`[SHERLO:mockExtraction] Found ${exports.length} story export(s) in ${componentName}`);
    
    for (const exportName of exports) {
      const storyExport = storyModule[exportName];
      
      // Check if this export has a mocks property
      if (storyExport && typeof storyExport === 'object' && 'mocks' in storyExport) {
        const storyMocks = storyExport.mocks;
        
        if (storyMocks && typeof storyMocks === 'object') {
          // Storybook uses format: "ComponentName--StoryName"
          const storyId = `${componentName}--${exportName}`;
          const packageMocks = new Map<string, any>();
          
          // Extract mocks for each package
          for (const [pkgName, pkgMock] of Object.entries(storyMocks)) {
            packageMocks.set(pkgName, pkgMock);
          }
          
          mocks.set(storyId, packageMocks);
          console.log(`[SHERLO:mockExtraction] Found mocks for ${storyId}:`, Array.from(packageMocks.keys()));
        }
      }
    }
    
  } catch (error: any) {
    console.warn(`[SHERLO:mockExtraction] Error extracting mocks from ${storyFilePath}:`, error.message);
    console.warn(`[SHERLO:mockExtraction] Stack:`, error.stack);
  }
  
  return mocks;
}

/**
 * Extracts mocks from all story files
 * Returns a combined map of all story mocks
 */
export function extractMocksFromAllStories(storyFiles: string[], projectRoot: string): StoryMockMap {
  const allMocks = new Map<string, Map<string, any>>();
  
  console.log(`[SHERLO:mockExtraction] Extracting mocks from ${storyFiles.length} story file(s)`);
  
  for (const storyFile of storyFiles) {
    const fileMocks = extractMocksFromStoryFile(storyFile, projectRoot);
    
    // Merge into allMocks
    for (const [storyId, packageMocks] of fileMocks.entries()) {
      allMocks.set(storyId, packageMocks);
    }
  }
  
  console.log(`[SHERLO:mockExtraction] Extracted mocks for ${allMocks.size} story variant(s)`);
  
  // Log summary
  const mockCounts = new Map<string, number>();
  for (const [storyId, packageMocks] of allMocks.entries()) {
    mockCounts.set(storyId, packageMocks.size);
  }
  
  console.log(`[SHERLO:mockExtraction] Mock summary:`);
  for (const [storyId, count] of mockCounts.entries()) {
    console.log(`[SHERLO:mockExtraction]   ${storyId}: ${count} package(s) mocked`);
  }
  
  return allMocks;
}
