/**
 * Generates a mock-files.requires.ts file that uses require.context() to import all mock files
 * This ensures Metro preserves all exports from mock files (same pattern as Storybook)
 */

import * as fs from 'fs';
import * as path from 'path';
import { SHERLO_DIR_NAME, MOCK_DIR_NAME } from '../constants';

const MOCK_REQUIRES_FILE = 'mock-files.requires.ts';

/**
 * Finds the Storybook entry point file (where storybook.requires.ts is imported)
 * Common locations: .rnstorybook/index.tsx, .storybook/index.tsx, etc.
 */
function findStorybookEntryPoint(projectRoot: string): string | null {
  const possiblePaths = [
    path.join(projectRoot, '.rnstorybook', 'index.tsx'),
    path.join(projectRoot, '.rnstorybook', 'index.ts'),
    path.join(projectRoot, '.rnstorybook', 'index.jsx'),
    path.join(projectRoot, '.rnstorybook', 'index.js'),
    path.join(projectRoot, '.storybook', 'index.tsx'),
    path.join(projectRoot, '.storybook', 'index.ts'),
    path.join(projectRoot, '.storybook', 'index.jsx'),
    path.join(projectRoot, '.storybook', 'index.js'),
  ];

  for (const entryPath of possiblePaths) {
    if (fs.existsSync(entryPath)) {
      return entryPath;
    }
  }

  return null;
}

/**
 * Adds import for mock-files.requires.ts to the Storybook entry point
 */
function addMockRequiresImport(projectRoot: string): void {
  const entryPoint = findStorybookEntryPoint(projectRoot);
  if (!entryPoint) {
    console.log(`[SHERLO] Could not find Storybook entry point to add mock-files.requires import`);
    console.log(`[SHERLO] Please manually add: import '../.sherlo/mock-files.requires'; to your Storybook entry point`);
    return;
  }

  // Calculate relative path from entry point to .sherlo/mock-files.requires.ts
  // Entry point is typically at .rnstorybook/index.tsx or .storybook/index.tsx
  // Mock requires is at .sherlo/mock-files.requires.ts (project root)
  const entryDir = path.dirname(entryPoint);
  const { getSherloDirectory } = require('../constants');
  const mockRequiresPath = path.join(getSherloDirectory(projectRoot), MOCK_REQUIRES_FILE);
  const relativePath = path.relative(entryDir, mockRequiresPath);
  // Normalize path separators for require() (use forward slashes)
  const normalizedPath = relativePath.replace(/\\/g, '/');
  // Ensure it starts with ./ or ../ for relative imports
  const importPath = normalizedPath.startsWith('.') ? normalizedPath : './' + normalizedPath;
  // Remove .ts extension for import
  const importPathWithoutExt = importPath.replace(/\.ts$/, '');

  const content = fs.readFileSync(entryPoint, 'utf-8');
  const mockRequiresImport = `import '${importPathWithoutExt}';`;

  // Check if import already exists
  if (content.includes(mockRequiresImport) || content.includes('mock-files.requires')) {
    return; // Already imported
  }

  // Find where to add the import (after other imports, before the rest of the code)
  // Look for the last import statement
  const importRegex = /^import\s+.*?from\s+['"].*?['"];?$/gm;
  const imports = content.match(importRegex);
  
  if (imports && imports.length > 0) {
    // Find the last import and add after it
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertIndex = lastImportIndex + lastImport.length;
    
    const newContent = 
      content.substring(0, insertIndex) + 
      '\n' + mockRequiresImport + '\n' + 
      content.substring(insertIndex);
    
    fs.writeFileSync(entryPoint, newContent, 'utf-8');
    console.log(`[SHERLO] Added mock-files.requires import to ${path.relative(projectRoot, entryPoint)}`);
  } else {
    // No imports found, add at the top
    const newContent = mockRequiresImport + '\n\n' + content;
    fs.writeFileSync(entryPoint, newContent, 'utf-8');
    console.log(`[SHERLO] Added mock-files.requires import to ${path.relative(projectRoot, entryPoint)}`);
  }
}

/**
 * Generates mock-files.requires.ts that imports all mock files via require.context()
 * This file should be imported in getStorybook.tsx to ensure Metro preserves mock exports
 *
 * @param projectRoot - The project root directory
 * @param mockFiles - Map of package names to mock file paths
 * @returns Path to the generated requires file
 */
export function generateMockRequires(
  projectRoot: string,
  mockFiles: Map<string, string>
): string | null {
  if (mockFiles.size === 0) {
    return null;
  }

  const { getMockDirectory, getSherloDirectory } = require('../constants');
  const mockDir = getMockDirectory(projectRoot);
  const requiresPath = path.join(getSherloDirectory(projectRoot), MOCK_REQUIRES_FILE);

  // Generate require.context() call that imports all mock files
  // The key insight: simply requiring the modules executes them, which triggers
  // registerStoryMocks() calls at module load time. This side effect prevents Metro
  // from optimizing away function bodies.
  const mockDirPath = `'./${MOCK_DIR_NAME}'`;
  
  const requiresContent = `/* do not change this file, it is auto generated by @sherlo/react-native-storybook. */
/**
 * Auto-generated file that imports all mock files via require.context()
 * This ensures Metro preserves all exports from mock files (same pattern as Storybook)
 * 
 * This file should be imported in your Storybook entry point (same place you import storybook.requires.ts)
 * Example: import '../.sherlo/mock-files.requires';
 * 
 * The important part is simply requiring every mock module:
 * - Each module calls registerStoryMocks() at load time
 * - This side effect prevents Metro from optimizing away function bodies
 * - This is structurally identical to how CSF stories are wired
 */

// Import all mock files using require.context() - this forces Metro to preserve their exports
// Metro sees require.context() as a special case and preserves all matching files
// @ts-ignore - require.context is a Metro-specific feature
const mockFilesContext = require.context(
  ${mockDirPath},
  false, // Don't recurse into subdirectories
  /\\.js$/ // Match all .js files (mock files are generated as .js)
);

// Execute each module - this triggers registerStoryMocks() calls at module load time
// As soon as Storybook imports this file, all mock modules are required, each calls
// registerStoryMocks(), and the registry is populated.
// This is the same pattern Storybook uses: req.keys().forEach((filename) => req(filename))
mockFilesContext.keys().forEach((key: string) => {
  // Execute the module - this triggers registerStoryMocks() side effects
  mockFilesContext(key);
});

export {};
`;

  // Write the requires file
  fs.writeFileSync(requiresPath, requiresContent, 'utf-8');
  console.log(`[SHERLO] Generated mock-files.requires.ts at ${requiresPath}`);

  // Automatically add import to Storybook entry point
  addMockRequiresImport(projectRoot);

  return requiresPath;
}

