/**
 * Resolver for redirecting imports to mock files
 * Checks if a module has mocks and redirects to the generated mock file
 */

import * as fs from 'fs';
import * as path from 'path';
import { getMockFilePath } from './pathNormalization';

// Cache the registry to avoid reading file on every request
let registryCache: Record<string, string> | null = null;
let lastRegistryReadTime = 0;

/**
 * Loads the mock registry from disk
 */
function loadMockRegistry(projectRoot: string): Record<string, string> | null {
  // Reload every 2 seconds in case mocks are regenerated
  const now = Date.now();
  if (registryCache && (now - lastRegistryReadTime < 2000)) {
    return registryCache;
  }

  try {
    const { getMockDirectory } = require('../constants');
    const mockDir = getMockDirectory(projectRoot);
    const registryPath = path.join(mockDir, 'mock-registry.json');
    
    if (fs.existsSync(registryPath)) {
      const content = fs.readFileSync(registryPath, 'utf-8');
      registryCache = JSON.parse(content);
      lastRegistryReadTime = now;
      return registryCache;
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

/**
 * Creates a resolver function that redirects mocked modules to mock files
 *
 * @param projectRoot - The project root directory
 * @param baseResolver - The base resolver function from Metro
 * @param hasStoryFiles - Whether story files exist (optimization: skip check if false)
 * @returns A resolver function that redirects to mock files when available
 */
export function createMockResolver(
  projectRoot: string,
  baseResolver: (context: any, moduleName: string, platform: string | null) => any,
  hasStoryFiles: boolean = true
) {
  return (context: any, moduleName: string, platform: string | null) => {
    // Early exit if no story files exist - no mocks possible
    if (!hasStoryFiles) {
      return baseResolver(context, moduleName, platform);
    }

    // CRITICAL: Skip mock resolution if we're importing from within a mock file
    // This prevents infinite recursion where mock file requires the real module,
    // but Metro resolves it back to the mock file
    if (context.originModulePath && context.originModulePath.includes('.sherlo/mocks')) {
      // console.log(`[SHERLO] Resolver: Skipping mock resolution for \"${moduleName}\" (importing from mock file: ${context.originModulePath})`);
      return baseResolver(context, moduleName, platform);
    }

    const registry = loadMockRegistry(projectRoot);
    
    // Strategy 1: Check registry by module name directly (fastest)
    // This handles exact matches like 'react-native' or specific relative paths used as keys
    if (registry && registry[moduleName] && fs.existsSync(registry[moduleName])) {
      console.log(`[SHERLO] Resolver: Redirecting "${moduleName}" to mock file (direct match)`);
      return {
        type: 'sourceFile',
        filePath: registry[moduleName],
      };
    }

    // Strategy 2: Resolve the module to a file path, then check registry
    // This handles aliases, absolute paths, and different relative paths pointing to same file
    try {
      // Resolve using base resolver
      const result = baseResolver(context, moduleName, platform);
      
      if (result && (result.type === 'sourceFile' || result.type === 'asset') && result.filePath) {
        // Check if the resolved file path is in the registry
        if (registry && registry[result.filePath] && fs.existsSync(registry[result.filePath])) {
          console.log(`[SHERLO] Resolver: Redirecting "${moduleName}" -> "${result.filePath}" to mock file`);
          return {
            type: 'sourceFile',
            filePath: registry[result.filePath],
          };
        }
        
        // Also check without extension (registry might store path without extension)
        const noExt = result.filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
        if (registry && registry[noExt] && fs.existsSync(registry[noExt])) {
          console.log(`[SHERLO] Resolver: Redirecting "${moduleName}" -> "${noExt}" to mock file`);
          return {
            type: 'sourceFile',
            filePath: registry[noExt],
          };
        }
      }
      
      return result;
    } catch (error: any) {
      // If base resolution fails, fall back to legacy check
      // (e.g. if module doesn't exist but we have a mock for it)
    }

    // Legacy Strategy: Check if mock file exists by name convention
    // This is a fallback for cases where registry might be out of sync or missing
    const mockFilePath = getMockFilePath(moduleName, projectRoot);
    if (fs.existsSync(mockFilePath)) {
      console.log(`[SHERLO] Resolver: Redirecting "${moduleName}" to mock file (legacy fallback)`);
      return {
        type: 'sourceFile',
        filePath: mockFilePath,
      };
    }

    // No mock found, let Metro handle the error (or return the failed resolution)
    return baseResolver(context, moduleName, platform);
  };
}

