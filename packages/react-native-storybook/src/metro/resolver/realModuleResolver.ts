/**
 * Resolver for :real suffix imports
 * Handles resolving original modules when :real suffix is used
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Common source directories to check when resolving relative paths
 */
const COMMON_SOURCE_DIRS = [
  'src',
  'testing/testing-components/src',
  '',
];

/**
 * File extensions to try when resolving module paths
 */
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', ''];

/**
 * Resolves a real module path for relative imports
 * Checks common source directories to find the actual file
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

  // Try to resolve relative to common source directories
  for (const sourceDir of COMMON_SOURCE_DIRS) {
    const fullSourceDir = sourceDir ? path.join(projectRoot, sourceDir) : projectRoot;
    const resolvedPath = path.resolve(fullSourceDir, realName);

    // Try with different extensions
    for (const ext of FILE_EXTENSIONS) {
      const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
      if (fs.existsSync(fullPath)) {
        return fullPath;
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

    // For relative paths, try resolving relative to common source directories
    const resolvedPath = resolveRealModulePath(realName, projectRoot);
    if (resolvedPath) {
      return {
        type: 'sourceFile',
        filePath: resolvedPath,
      };
    }

    // Fallback to base resolver for package names
    try {
      return baseResolver(context, realName, platform);
    } catch (e: any) {
      console.error(`[SHERLO] Failed to resolve real module "${moduleName}":`, e.message);
      throw e;
    }
  };
}

