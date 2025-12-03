/**
 * File finding utilities for story discovery
 * Handles finding story files from various sources
 */

import * as fs from 'fs';
import * as path from 'path';
import { STORYBOOK_REQUIRES_FILE, MAX_RECURSION_DEPTH, STORY_FILE_PATTERN, IGNORED_DIRECTORIES } from '../constants';

/**
 * Recursively finds files matching a pattern in a directory
 *
 * @param dir - The directory to search in
 * @param pattern - The regex pattern to match against file paths
 * @param baseDir - The base directory for relative path calculation
 * @param results - Accumulated results array
 * @returns Array of matching file paths
 */
export function findFilesInDirectory(
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
      // Skip ignored directories
      if (IGNORED_DIRECTORIES.includes(entry.name) || entry.name.startsWith('.')) {
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
 * Extracts story file paths from Storybook's generated requires file
 * This file contains require.context calls with the actual paths
 * Format: require.context('../src', true, /pattern/)
 *
 * @param requiresPath - Path to the storybook requires file
 * @param projectRoot - The project root directory
 * @returns Array of story file paths
 */
export function extractStoryFilesFromRequires(requiresPath: string, projectRoot: string): string[] {
  try {
    const content = fs.readFileSync(requiresPath, 'utf-8');

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

      if (fs.existsSync(resolvedDir)) {
        // Find all .stories files in this directory recursively
        function findStories(dir: string, depth: number = 0): void {
          if (depth > MAX_RECURSION_DEPTH) {
            return;
          }

          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              if (recursive && !IGNORED_DIRECTORIES.includes(entry.name) && !entry.name.startsWith('.')) {
                findStories(fullPath, depth + 1);
              }
            } else if (entry.isFile() && STORY_FILE_PATTERN.test(entry.name)) {
              storyFiles.push(fullPath);
            }
          }
        }

        findStories(resolvedDir);
      }
    }

    return storyFiles;
  } catch (error: any) {
    console.error('[SHERLO] Failed to extract story files from storybook.requires.ts:', error.message);
    return [];
  }
}

/**
 * Uses Storybook's normalizeStories to get story specifiers, then finds actual files
 * This leverages Storybook's own logic for consistency
 *
 * @param stories - The stories configuration from Storybook config
 * @param configDir - The Storybook config directory
 * @param projectRoot - The project root directory
 * @returns Array of story file paths
 */
export function findStoryFilesFromSpecifiers(
  stories: string[] | Array<{ directory: string; files: string }>,
  configDir: string,
  projectRoot: string
): string[] {
  // Try to use Storybook's normalizeStories if available
  try {
    // Read the generated storybook requires file if it exists
    const requiresPath = path.join(configDir, STORYBOOK_REQUIRES_FILE);
    if (fs.existsSync(requiresPath)) {
      return extractStoryFilesFromRequires(requiresPath, projectRoot);
    }
  } catch {
    // Silently fallback to parsing config
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

      if (!fs.existsSync(directory)) {
        continue;
      }

      // Convert files pattern to regex (simplified - matches .stories.ts, .stories.tsx, etc.)
      const fileRegex = STORY_FILE_PATTERN;

      // Recursively find matching files
      function findFiles(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.includes(entry.name) || entry.name.startsWith('.')) {
              continue;
            }
            findFiles(fullPath);
          } else if (entry.isFile() && fileRegex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      }

      findFiles(directory);
    }
  }

  return results;
}

