/**
 * Path resolution utilities for mock file generation
 * Handles resolving relative paths to absolute paths for :real requires
 */

import * as path from 'path';
import * as fs from 'fs';
import { MOCK_DIR_NAME, SHERLO_DIR_NAME } from '../constants';
import { discoverSourceDirectories } from './sourceDirectoryDiscovery';

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
 * Possible base directories for resolving relative paths in monorepo setups
 * Checks various locations where source files might be located
 * This handles common monorepo structures without hardcoding specific package names
 *
 * @param projectRoot - The project root directory
 * @returns Array of possible base directories to search
 */
export function getPossibleBaseDirs(projectRoot: string): string[] {
  const dirs = new Set<string>();
  
  // Add discovered source directories first (most accurate)
  const discoveredDirs = discoverSourceDirectories(projectRoot);
  for (const dir of discoveredDirs) {
    dirs.add(dir);
    // Also add common subdirectories
    dirs.add(path.join(dir, 'components'));
    dirs.add(path.join(dir, 'utils'));
    dirs.add(path.join(dir, 'helpers'));
  }
  
  // Add standard locations relative to projectRoot
  const standardDirs = [
    path.join(projectRoot, 'src', 'components'),
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'lib'),
    path.join(projectRoot, 'app'),
    projectRoot,
  ];
  for (const dir of standardDirs) {
    dirs.add(dir);
  }
  
  // Add sibling directories (for monorepo setups)
  const siblingDirs = [
    path.join(projectRoot, '..', 'src', 'components'),
    path.join(projectRoot, '..', 'src'),
    path.join(projectRoot, '..', 'lib'),
    path.join(projectRoot, '..', 'app'),
  ];
  for (const dir of siblingDirs) {
    if (fs.existsSync(dir)) {
      dirs.add(dir);
    }
  }
  
  // Add parent directories (for deeply nested structures)
  const parentDirs = [
    path.join(projectRoot, '..', '..', 'src', 'components'),
    path.join(projectRoot, '..', '..', 'src'),
    path.join(projectRoot, '..', '..', 'lib'),
  ];
  for (const dir of parentDirs) {
    if (fs.existsSync(dir)) {
      dirs.add(dir);
    }
  }
  
  return Array.from(dirs);
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
      if (!fs.existsSync(baseDir)) {
        continue;
      }
      
      // Try multiple interpretations of the relative path
      const interpretations = [
        // 1. Direct resolution from baseDir
        path.resolve(baseDir, packageName),
        // 2. If it starts with ../, try from parent of baseDir
        ...(packageName.startsWith('../') ? [path.resolve(path.dirname(baseDir), packageName)] : []),
        // 3. Remove ../ prefix and try from baseDir
        ...(packageName.startsWith('../') ? [path.resolve(baseDir, packageName.replace(/^\.\.\//, ''))] : []),
      ];
      
      for (const resolvedPath of interpretations) {
        for (const ext of FILE_EXTENSIONS) {
          const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
          if (fs.existsSync(fullPath)) {
            realModuleAbsolutePath = fullPath;
            
            // Calculate relative path from mock file location to real module
            // Mock files are now in .sherlo/mocks/ (source directory)
            const { getMockDirectory } = require('../constants');
            const mockFileDir = getMockDirectory(projectRoot);
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

