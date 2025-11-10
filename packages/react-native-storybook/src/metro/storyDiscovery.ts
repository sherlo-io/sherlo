// storyDiscovery.ts
import * as fs from 'fs';
import * as path from 'path';

// Use Storybook's internal utilities for story discovery
let storybookCommon: any = null;
try {
  storybookCommon = require('storybook/internal/common');
} catch {
  // Fallback if not available
}

let storybookMetroCommon: any = null;
try {
  // Try to get the common utilities from Storybook's metro package
  const storybookMetro = require('@storybook/react-native/dist/metro/withStorybook');
  // The common utilities are bundled in withStorybook
} catch {
  // Fallback
}

interface StorybookConfig {
  stories: string[] | Array<{ directory: string; files: string }>;
  [key: string]: any;
}

/**
 * Reads Storybook config using Storybook's own utilities
 * Uses the same logic as withStorybook to ensure consistency
 */
function readStorybookConfig(projectRoot: string): { config: StorybookConfig; configDir: string } | null {
  // Try to use Storybook's getMain utility if available
  let getMain: any = null;
  try {
    // Try to get from storybook/internal/common (bundled in withStorybook)
    const storybookMetro = require('@storybook/react-native/dist/metro/withStorybook');
    // The utilities are in the bundled code, we need to access them differently
  } catch {}

  // Fallback: manually find and read config
  const possiblePaths = [
    path.join(projectRoot, '.rnstorybook', 'main.ts'),
    path.join(projectRoot, '.storybook', 'main.ts'),
    path.join(projectRoot, '.rnstorybook', 'main.js'),
    path.join(projectRoot, '.storybook', 'main.js'),
  ];

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const configDir = path.dirname(configPath);
        console.log(`[SHERLO:storyDiscovery] Found config at: ${configPath}`);
        console.log(`[SHERLO:storyDiscovery] Config directory: ${configDir}`);

        // For .ts files, parse as text since we can't require them directly
        if (configPath.endsWith('.ts')) {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = parseTypeScriptConfig(content);
          if (config) {
            return { config, configDir };
          }
        } else {
          // For .js files, we can require them
          delete require.cache[require.resolve(configPath)];
          const config = require(configPath);
          const parsedConfig = config.default || config;
          return { config: parsedConfig, configDir };
        }
      } catch (error: any) {
        console.warn(`[SHERLO:storyDiscovery] Failed to load config from ${configPath}:`, error.message);
      }
    }
  }

  return null;
}

/**
 * Parses TypeScript config file content to extract stories array
 * Simple regex-based parser for common Storybook config patterns
 */
function parseTypeScriptConfig(content: string): StorybookConfig | null {
  // Look for stories array pattern: stories: ['...'] or stories: ["..."]
  // Handle both single string and array of strings
  // Use non-greedy match but ensure we capture the full array content
  const storiesPattern = /stories:\s*\[([^\]]+)\]/s;
  const match = content.match(storiesPattern);

  if (!match) {
    console.warn('[SHERLO:storyDiscovery] Could not find stories array in config file');
    return null;
  }

  const storiesContent = match[1];
  const stories: string[] = [];

  // Extract string literals from the array
  // Match both single and double quoted strings, handling escaped quotes
  // Improved pattern to handle complex glob patterns with special characters
  const stringPattern = /['"]([^'"]*(?:\\.[^'"]*)*)['"]/g;
  let stringMatch;

  while ((stringMatch = stringPattern.exec(storiesContent)) !== null) {
    // Unescape the string
    const unescaped = stringMatch[1]
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    stories.push(unescaped);
  }

  if (stories.length === 0) {
    console.warn('[SHERLO:storyDiscovery] Found stories array but could not extract any story patterns');
    return null;
  }

  console.log(`[SHERLO:storyDiscovery] Parsed ${stories.length} story pattern(s) from config`);
  return { stories };
}

/**
 * Converts a glob pattern to a regex pattern.
 * This is a simplified glob matcher for common story file patterns.
 */
function globToRegex(globPattern: string): RegExp {
  // Escape special regex characters except * and ?
  let regex = globPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*')
    .replace(/\?/g, '.');

  // Handle ?(ts|tsx) patterns - convert to (ts|tsx)?
  regex = regex.replace(/\(([^)]+)\)/g, '($1)?');

  return new RegExp(`^${regex}$`);
}

/**
 * Recursively finds files matching a pattern in a directory
 */
function findFilesInDirectory(
  dir: string,
  pattern: RegExp,
  baseDir: string,
  results: string[] = []
): string[] {
  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      // Skip node_modules and other common ignored directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findFilesInDirectory(fullPath, pattern, baseDir, results);
    } else if (entry.isFile()) {
      if (pattern.test(relativePath)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Uses Storybook's normalizeStories to get story specifiers, then finds actual files
 * This leverages Storybook's own logic for consistency
 */
function findStoryFilesFromSpecifiers(
  stories: string[] | Array<{ directory: string; files: string }>,
  configDir: string,
  projectRoot: string
): string[] {
  console.log(`[SHERLO:storyDiscovery] Finding files from specifiers, configDir: ${configDir}`);

  // Try to use Storybook's normalizeStories if available
  let normalizeStories: any = null;
  let toRequireContext: any = null;

  try {
    // Storybook bundles these utilities in withStorybook
    // We can't easily access them, so we'll use a simpler approach
    // Read the generated storybook.requires.ts file if it exists
    const requiresPath = path.join(configDir, 'storybook.requires.ts');
    if (fs.existsSync(requiresPath)) {
      console.log(`[SHERLO:storyDiscovery] Found generated storybook.requires.ts, reading it`);
      return extractStoryFilesFromRequires(requiresPath, projectRoot);
    }
  } catch (error: any) {
    console.warn(`[SHERLO:storyDiscovery] Could not read storybook.requires.ts:`, error.message);
  }

  // Fallback: Use Storybook's normalizeStories logic manually
  // Parse the stories config similar to how Storybook does it
  const results: string[] = [];

  if (Array.isArray(stories)) {
    for (const storyEntry of stories) {
      let directory: string;
      let filesPattern: string;

      if (typeof storyEntry === 'string') {
        // Pattern like '../src/**/*.stories.?(ts|tsx|js|jsx)'
        // Extract directory and files pattern
        const match = storyEntry.match(/^(.*?)\/\*\*\/(.+)$/);
        if (match) {
          directory = path.resolve(configDir, match[1]);
          filesPattern = match[2];
        } else {
          // Fallback: treat entire pattern as relative to configDir
          directory = path.resolve(configDir, path.dirname(storyEntry));
          filesPattern = path.basename(storyEntry);
        }
      } else if (typeof storyEntry === 'object' && storyEntry.directory && storyEntry.files) {
        directory = path.resolve(configDir, storyEntry.directory);
        filesPattern = storyEntry.files;
      } else {
        continue;
      }

      console.log(`[SHERLO:storyDiscovery] Processing specifier: directory=${directory}, files=${filesPattern}`);

      if (!fs.existsSync(directory)) {
        console.warn(`[SHERLO:storyDiscovery] Directory does not exist: ${directory}`);
        continue;
      }

      // Convert files pattern to regex (simplified - matches .stories.ts, .stories.tsx, etc.)
      const fileRegex = /\.stories\.(ts|tsx|js|jsx)$/;

      // Recursively find matching files
      function findFiles(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
              continue;
            }
            findFiles(fullPath);
          } else if (entry.isFile() && fileRegex.test(entry.name)) {
            console.log(`[SHERLO:storyDiscovery] Found story file: ${fullPath}`);
            results.push(fullPath);
          }
        }
      }

      findFiles(directory);
    }
  }

  return results;
}

/**
 * Extracts story file paths from Storybook's generated storybook.requires.ts
 * This file contains require.context calls with the actual paths
 * Format: require.context('../src', true, /pattern/)
 */
function extractStoryFilesFromRequires(requiresPath: string, projectRoot: string): string[] {
  try {
    const content = fs.readFileSync(requiresPath, 'utf-8');
    console.log(`[SHERLO:storyDiscovery] Reading storybook.requires.ts (${content.length} chars)`);

    // Extract require.context calls: require.context('../src', true, /pattern/)
    // Match: require.context('path', true/false, /regex/)
    const requireContextPattern = /require\.context\(\s*['"]([^'"]+)['"]\s*,\s*(true|false)\s*,\s*\/[^\/]+\//g;
    const storyFiles: string[] = [];
    let match;

    while ((match = requireContextPattern.exec(content)) !== null) {
      const contextPath = match[1]; // e.g., '../src'
      const recursive = match[2] === 'true';
      const configDir = path.dirname(requiresPath);
      const resolvedDir = path.resolve(configDir, contextPath);

      console.log(`[SHERLO:storyDiscovery] Found require.context: ${contextPath} -> ${resolvedDir} (recursive: ${recursive})`);
      console.log(`[SHERLO:storyDiscovery] Resolved directory exists: ${fs.existsSync(resolvedDir)}`);

      if (fs.existsSync(resolvedDir)) {
        // Find all .stories files in this directory recursively
        function findStories(dir: string, depth: number = 0): void {
          if (depth > 20) {
            console.warn(`[SHERLO:storyDiscovery] Max depth reached at ${dir}`);
            return;
          }

          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              if (recursive && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                findStories(fullPath, depth + 1);
              }
            } else if (entry.isFile() && /\.stories\.(ts|tsx|js|jsx)$/.test(entry.name)) {
              console.log(`[SHERLO:storyDiscovery] Found story file: ${fullPath}`);
              storyFiles.push(fullPath);
            }
          }
        }

        findStories(resolvedDir);
      } else {
        console.warn(`[SHERLO:storyDiscovery] Resolved directory does not exist: ${resolvedDir}`);
      }
    }

    console.log(`[SHERLO:storyDiscovery] Extracted ${storyFiles.length} story file(s) from requires`);
    return storyFiles;
  } catch (error: any) {
    console.warn(`[SHERLO:storyDiscovery] Error extracting files from requires:`, error.message);
    console.warn(`[SHERLO:storyDiscovery] Error stack:`, error.stack);
    return [];
  }
}

/**
 * Discovers all story files based on Storybook config
 * Leverages Storybook's own discovery logic by reading the generated storybook.requires.ts file
 * or falling back to parsing the config directly
 */
export function discoverStoryFiles(projectRoot: string): string[] {
  console.log(`[SHERLO:storyDiscovery] Starting discovery, project root: ${projectRoot}`);

  const configResult = readStorybookConfig(projectRoot);

  if (!configResult || !configResult.config.stories) {
    console.warn('[SHERLO:storyDiscovery] No Storybook config found or no stories configured');
    return [];
  }

  const { config, configDir } = configResult;
  console.log(`[SHERLO:storyDiscovery] Config directory: ${configDir}`);
  console.log(`[SHERLO:storyDiscovery] Stories config:`, config.stories);

  // First, try to read the generated storybook.requires.ts file
  // This is generated by withStorybook and contains the actual resolved paths
  const requiresPath = path.join(configDir, 'storybook.requires.ts');
  if (fs.existsSync(requiresPath)) {
    console.log(`[SHERLO:storyDiscovery] Using Storybook's generated storybook.requires.ts`);
    const files = extractStoryFilesFromRequires(requiresPath, projectRoot);
    if (files.length > 0) {
      const uniqueFiles = Array.from(new Set(files)).sort();
      console.log(`[SHERLO:storyDiscovery] Found ${uniqueFiles.length} story file(s) from Storybook's requires:`);
      uniqueFiles.forEach((file) => {
        console.log(`[SHERLO:storyDiscovery]   - ${path.relative(projectRoot, file)}`);
      });
      return uniqueFiles;
    }
  }

  // Fallback: parse config directly
  console.log(`[SHERLO:storyDiscovery] storybook.requires.ts not found, parsing config directly`);
  const storyFiles = findStoryFilesFromSpecifiers(config.stories, configDir, projectRoot);

  // Remove duplicates and sort
  const uniqueFiles = Array.from(new Set(storyFiles)).sort();

  console.log(`[SHERLO:storyDiscovery] Found ${uniqueFiles.length} story file(s):`);
  uniqueFiles.forEach((file) => {
    console.log(`[SHERLO:storyDiscovery]   - ${path.relative(projectRoot, file)}`);
  });

  return uniqueFiles;
}
