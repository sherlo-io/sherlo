/**
 * Path normalization utilities for resolver
 * Handles normalizing module paths for mock file resolution
 */

import * as path from 'path';

/**
 * Normalizes a module name for use in mock file paths
 * Converts relative paths to a consistent format and removes extensions
 *
 * @param moduleName - The module name to normalize
 * @returns The normalized module name
 */
export function normalizeModuleName(moduleName: string): string {
  if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
    // For relative paths, use the same normalization as generateAllMockFiles:
    // Normalize separators and remove extension, then replace / with __
    return moduleName.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx)$/, '');
  }
  return moduleName;
}

/**
 * Converts a normalized module name to a safe file name
 * Replaces path separators with underscores
 *
 * @param normalizedModuleName - The normalized module name
 * @returns A safe file name for the mock file
 */
export function getSafeFileName(normalizedModuleName: string): string {
  return normalizedModuleName.replace(/\//g, '__');
}

/**
 * Gets the mock file path for a given module name
 *
 * @param moduleName - The module name
 * @param projectRoot - The project root directory
 * @returns The path to the mock file
 */
export function getMockFilePath(moduleName: string, projectRoot: string): string {
  const normalizedModuleName = normalizeModuleName(moduleName);
  const safeFileName = getSafeFileName(normalizedModuleName);
  return path.join(projectRoot, 'node_modules', '.sherlo-mocks', `${safeFileName}.js`);
}

