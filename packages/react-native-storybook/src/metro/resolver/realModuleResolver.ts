/**
 * Resolver for :real suffix imports
 * Handles resolving original modules when :real suffix is used
 */

import * as path from 'path';
import * as fs from 'fs';
import { discoverSourceDirectories } from '../mockGeneration/sourceDirectoryDiscovery';

/**
 * Common source directories to check when resolving relative paths
 * These are standard locations where source files are typically located
 */
const COMMON_SOURCE_DIRS = [
  'src',
  'lib',
  'app',
  'components',
  '',
];

/**
 * File extensions to try when resolving module paths
 */
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', ''];

/**
 * Resolves a real module path for relative imports
 * Checks common source directories to find the actual file
 * Uses dynamically discovered source directories from story files
 *
 * @param realName - The module name without :real suffix
 * @param projectRoot - The project root directory
 * @returns The resolved file path, or null if not found
 */
export function resolveRealModulePath(realName: string, projectRoot: string): string | null {
  if (!realName.startsWith('.') && !realName.startsWith('/')) {
    // Not a relative path, return null (will use base resolver)
    return null;
  }

  // Get dynamically discovered source directories
  const discoveredDirs = discoverSourceDirectories(projectRoot);
  
  // Combine with standard source directories
  const allSourceDirs = [
    ...discoveredDirs,
    ...COMMON_SOURCE_DIRS.map(dir => dir ? path.join(projectRoot, dir) : projectRoot),
  ];

  // Try to resolve relative to all source directories
  // For relative paths like ../utils/testHelper, we need to try multiple interpretations:
  // 1. Resolve relative to the source directory itself
  // 2. Resolve relative to parent of source directory (for ../ paths)
  // 3. Try as if the path starts from source directory root (remove ../)
  for (const sourceDir of allSourceDirs) {
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    
    // Try 1: Resolve relative to source directory
    let resolvedPath = path.resolve(sourceDir, realName);
    for (const ext of FILE_EXTENSIONS) {
      const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    
    // Try 2: If path starts with ../, also try resolving from parent of source directory
    if (realName.startsWith('../')) {
      const parentDir = path.dirname(sourceDir);
      if (fs.existsSync(parentDir)) {
        resolvedPath = path.resolve(parentDir, realName);
        for (const ext of FILE_EXTENSIONS) {
          const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }
      }
    }
    
    // Try 3: Remove ../ prefix and try as absolute path from source directory
    if (realName.startsWith('../')) {
      const withoutParent = realName.replace(/^\.\.\//, '');
      resolvedPath = path.resolve(sourceDir, withoutParent);
      for (const ext of FILE_EXTENSIONS) {
        const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
  }

  return null;
}

/**
 * Creates a resolver function for :real suffix imports
 *
 * @param projectRoot - The project root directory
 * @param baseResolver - The base resolver function from Metro
 * @returns A resolver function that handles :real suffix imports
 */
export function createRealModuleResolver(
  projectRoot: string,
  baseResolver: (context: any, moduleName: string, platform: string | null) => any
) {
  return (context: any, moduleName: string, platform: string | null) => {
    if (!moduleName.endsWith(':real')) {
      return null; // Not a :real import, let other resolvers handle it
    }

    const realName = moduleName.slice(0, -':real'.length);

    // For relative paths, we need to resolve them correctly
    // Metro's resolver uses context.originModulePath, which will be the mock file path
    // So we need to use our custom resolution that knows about all source directories
    if (realName.startsWith('.') || realName.startsWith('/')) {
      // First try our custom resolution (uses discovered source directories)
      const resolvedPath = resolveRealModulePath(realName, projectRoot);
      if (resolvedPath) {
        return {
          type: 'sourceFile',
          filePath: resolvedPath,
        };
      }
      
      // If custom resolution fails, try Metro's resolver as fallback
      // Metro might have additional resolution logic (e.g., for node_modules)
      try {
        return baseResolver(context, realName, platform);
      } catch (e: any) {
        // Both failed - Metro's error message is usually more helpful
        console.error(`[SHERLO] Failed to resolve real module "${moduleName}":`, e.message);
        throw e;
      }
    }

    // For package names (not relative paths), use Metro's resolver directly
    try {
      return baseResolver(context, realName, platform);
    } catch (e: any) {
      console.error(`[SHERLO] Failed to resolve real module "${moduleName}":`, e.message);
      throw e;
    }
  };
}

