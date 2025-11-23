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
 * @param storyFilePath - Optional path to the story file where the mock is defined (for resolving relative imports)
 * @returns Object containing resolved paths and require path for mock file
 */
export function resolvePathForMockFile(
  packageName: string,
  projectRoot: string,
  storyFilePath?: string
): {
  realModulePath: string | null;
  realModuleAbsolutePath: string | null;
  requirePathForMockFile: string | null;
} {
  let realModulePath: string | null = null;
  let realModuleAbsolutePath: string | null = null;
  let requirePathForMockFile: string | null = null;

  // Load resolver config if available
  let extraNodeModules: Record<string, string> = {};
  try {
    const { getSherloDirectory } = require('../constants');
    const sherloDir = getSherloDirectory(projectRoot);
    const resolverConfigPath = path.join(sherloDir, 'resolver-config.json');
    if (fs.existsSync(resolverConfigPath)) {
      const config = JSON.parse(fs.readFileSync(resolverConfigPath, 'utf-8'));
      extraNodeModules = config.extraNodeModules || {};
    }
  } catch (e) {
    // Ignore errors loading config
  }

  // Helper to check if a path exists with extensions
  const resolveWithExtensions = (basePath: string): string | null => {
    // If it's a directory, look for index files
    if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
      for (const ext of FILE_EXTENSIONS) {
        const indexFile = path.join(basePath, `index${ext}`);
        if (fs.existsSync(indexFile)) return indexFile;
      }
    }

    // Check for file with extensions
    for (const ext of FILE_EXTENSIONS) {
      const fullPath = ext ? `${basePath}${ext}` : basePath;
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }
    return null;
  };

  // Strategy 1: Resolve relative paths from story file
  if ((packageName.startsWith('.') || packageName.startsWith('/')) && storyFilePath) {
    const storyDir = path.dirname(storyFilePath);
    const resolved = path.resolve(storyDir, packageName);
    const found = resolveWithExtensions(resolved);
    if (found) {
      realModuleAbsolutePath = found;
    }
  }

  // Strategy 2: Resolve paths relative to project root (NEW)
  // This supports defining mocks like 'src/utils/localUtils'
  if (!realModuleAbsolutePath) {
    const resolved = path.resolve(projectRoot, packageName);
    const found = resolveWithExtensions(resolved);
    if (found) {
      realModuleAbsolutePath = found;
    }
  }

  // Strategy 3: Resolve aliases via extraNodeModules
  if (!realModuleAbsolutePath) {
    // Check if package name starts with an alias key
    for (const [alias, aliasPath] of Object.entries(extraNodeModules)) {
      if (packageName === alias || packageName.startsWith(`${alias}/`)) {
        const relativePart = packageName.slice(alias.length);
        const resolved = path.join(aliasPath, relativePart);
        const found = resolveWithExtensions(resolved);
        if (found) {
          realModuleAbsolutePath = found;
          break;
        }
      }
    }
  }

  // Strategy 4: Legacy relative path resolution (guessing base dirs)
  if (!realModuleAbsolutePath && (packageName.startsWith('.') || packageName.startsWith('/'))) {
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
        const found = resolveWithExtensions(resolvedPath);
        if (found) {
          realModuleAbsolutePath = found;
          break;
        }
      }
      if (realModuleAbsolutePath) break;
    }
  }

  // Calculate derived paths if we found the absolute path
  if (realModuleAbsolutePath) {
    // Calculate relative path from mock file location to real module
    // Mock files are now in .sherlo/mocks/ (source directory)
    const { getMockDirectory } = require('../constants');
    const mockFileDir = getMockDirectory(projectRoot);
    const relativeFromMockFile = path.relative(mockFileDir, realModuleAbsolutePath);
    
    // Remove extension for require()
    requirePathForMockFile = relativeFromMockFile.replace(/\.(ts|tsx|js|jsx)$/, '');
    // Normalize path separators for require()
    requirePathForMockFile = requirePathForMockFile.replace(/\\/g, '/');
    // Ensure it starts with ./ or ../ for relative requires
    if (!requirePathForMockFile.startsWith('.')) {
      requirePathForMockFile = './' + requirePathForMockFile;
    }
    
    realModulePath = path.relative(projectRoot, realModuleAbsolutePath).replace(/\.(ts|tsx|js|jsx)$/, '');
  } else {
    // Fallback: use :real suffix
    realModulePath = packageName;
    requirePathForMockFile = `${packageName}:real`;
  }

  return {
    realModulePath,
    realModuleAbsolutePath,
    requirePathForMockFile,
  };
}

