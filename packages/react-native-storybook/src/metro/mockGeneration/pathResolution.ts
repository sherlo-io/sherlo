/**
 * Path resolution utilities for mock file generation
 * Handles resolving relative paths to absolute paths for :real requires
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
 * Resolves a relative path to an absolute path by checking common source locations
 * This is used for :real requires in mock files
 *
 * @param relativePath - The relative path to resolve (e.g., "../utils/testHelper")
 * @param projectRoot - The project root directory
 * @returns The resolved absolute path, or the original path if resolution fails
 */
export function resolveRelativePathForReal(relativePath: string, projectRoot: string): string {
  // If it's already absolute or a package name, return as-is
  if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    return relativePath;
  }

  // Try to resolve relative to common source directories
  for (const sourceDir of COMMON_SOURCE_DIRS) {
    const fullSourceDir = sourceDir ? path.join(projectRoot, sourceDir) : projectRoot;
    const resolvedPath = path.resolve(fullSourceDir, relativePath);
    
    // Try with different extensions
    for (const ext of FILE_EXTENSIONS) {
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
 * Possible base directories for resolving relative paths in monorepo setups
 * Checks various locations where source files might be located
 */
export function getPossibleBaseDirs(projectRoot: string): string[] {
  return [
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
}

/**
 * Resolves a relative path for use in mock file require statements
 * Calculates the relative path from the mock file location to the real module
 *
 * @param packageName - The package/module name (can be relative path)
 * @param projectRoot - The project root directory
 * @returns Object containing resolved paths and require path for mock file
 */
export function resolvePathForMockFile(
  packageName: string,
  projectRoot: string
): {
  realModulePath: string | null;
  realModuleAbsolutePath: string | null;
  requirePathForMockFile: string | null;
} {
  let realModulePath: string | null = null;
  let realModuleAbsolutePath: string | null = null;
  let requirePathForMockFile: string | null = null;

  if (packageName.startsWith('.') || packageName.startsWith('/')) {
    // For relative paths, try resolving from various possible source directories
    const possibleBaseDirs = getPossibleBaseDirs(projectRoot);

    for (const baseDir of possibleBaseDirs) {
      const resolvedPath = path.resolve(baseDir, packageName);
      
      for (const ext of FILE_EXTENSIONS) {
        const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
        if (fs.existsSync(fullPath)) {
          realModuleAbsolutePath = fullPath;
          
          // Calculate relative path from mock file location to real module
          const mockFileDir = path.join(projectRoot, 'node_modules', '.sherlo-mocks');
          const relativeFromMockFile = path.relative(mockFileDir, fullPath);
          
          // Remove extension for require()
          requirePathForMockFile = relativeFromMockFile.replace(/\.(ts|tsx|js|jsx)$/, '');
          // Normalize path separators for require()
          requirePathForMockFile = requirePathForMockFile.replace(/\\/g, '/');
          // Ensure it starts with ./ or ../ for relative requires
          if (!requirePathForMockFile.startsWith('.')) {
            requirePathForMockFile = './' + requirePathForMockFile;
          }
          
          realModulePath = path.relative(projectRoot, fullPath).replace(/\.(ts|tsx|js|jsx)$/, '');
          break;
        }
      }
      if (realModulePath) break;
    }
  } else {
    // For package names, use :real suffix to bypass our mock redirect
    realModulePath = packageName;
    requirePathForMockFile = `${packageName}:real`;
  }

  // Fallback: if we couldn't resolve the path, use :real suffix
  if (!requirePathForMockFile) {
    requirePathForMockFile = `${packageName}:real`;
  }

  return {
    realModulePath,
    realModuleAbsolutePath,
    requirePathForMockFile,
  };
}

