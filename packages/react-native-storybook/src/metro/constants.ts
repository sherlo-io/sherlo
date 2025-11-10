/**
 * Constants used throughout the Metro mock system
 */

/**
 * Directory name for generated mock files
 */
export const MOCK_DIR_NAME = '.sherlo-mocks';

/**
 * Directory name for Sherlo configuration files
 */
export const SHERLO_DIR_NAME = '.sherlo';

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

