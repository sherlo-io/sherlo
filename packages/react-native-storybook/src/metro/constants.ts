/**
 * Constants used throughout the Metro mock system
 */

/**
 * Directory name for generated mock files (relative to node_modules/.sherlo/)
 * Full path: node_modules/.sherlo/mocks/
 * This location is already gitignored (node_modules/) and requires no user setup
 */
export const MOCK_DIR_NAME = 'mocks';

/**
 * Directory name for Sherlo generated files (inside node_modules)
 * Full path: node_modules/.sherlo/
 * This location is already gitignored and requires no user setup
 */
export const SHERLO_DIR_NAME = '.sherlo';

/**
 * Gets the mock directory path for a given project root
 * Returns: node_modules/.sherlo/mocks/ (already gitignored, no user setup needed)
 * 
 * @param projectRoot - The project root directory
 * @returns The path to the mock directory
 */
export function getMockDirectory(projectRoot: string): string {
  const path = require('path');
  return path.join(projectRoot, 'node_modules', SHERLO_DIR_NAME, MOCK_DIR_NAME);
}

/**
 * Gets the Sherlo directory path for a given project root
 * Returns: node_modules/.sherlo/ (already gitignored, no user setup needed)
 * 
 * @param projectRoot - The project root directory
 * @returns The path to the Sherlo directory
 */
export function getSherloDirectory(projectRoot: string): string {
  const path = require('path');
  return path.join(projectRoot, 'node_modules', SHERLO_DIR_NAME);
}

/**
 * Storybook requires file name
 */
export const STORYBOOK_REQUIRES_FILE = 'storybook.requires.ts';

/**
 * Story files cache file name
 */
export const STORY_FILES_CACHE_FILE = 'story-files.json';

/**
 * Common ignored directory names
 */
export const IGNORED_DIRECTORIES = ['node_modules'];

/**
 * Story file extensions
 */
export const STORY_FILE_EXTENSIONS = ['.stories.ts', '.stories.tsx', '.stories.js', '.stories.jsx'];

/**
 * Story file extension regex pattern
 */
export const STORY_FILE_PATTERN = /\.stories\.(ts|tsx|js|jsx)$/;

/**
 * Possible Storybook config file paths (relative to project root)
 */
export const STORYBOOK_CONFIG_PATHS = [
  '.rnstorybook/main.ts',
  '.storybook/main.ts',
  '.rnstorybook/main.js',
  '.storybook/main.js',
] as const;

/**
 * Maximum recursion depth for file discovery
 */
export const MAX_RECURSION_DEPTH = 20;

