/**
 * Storybook config reading utilities
 * Handles reading and parsing Storybook configuration files
 */

import * as fs from 'fs';
import * as path from 'path';
import { STORYBOOK_CONFIG_PATHS } from '../constants';

export interface StorybookConfig {
  stories: string[] | Array<{ directory: string; files: string }>;
  [key: string]: any;
}

/**
 * Reads Storybook config using Storybook's own utilities
 * Uses the same logic as withStorybook to ensure consistency
 *
 * @param projectRoot - The project root directory
 * @returns The config and config directory, or null if not found
 */
export function readStorybookConfig(projectRoot: string): { config: StorybookConfig; configDir: string } | null {
  // Fallback: manually find and read config
  const possiblePaths = STORYBOOK_CONFIG_PATHS.map((configPath) =>
    path.join(projectRoot, configPath)
  );

  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const configDir = path.dirname(configPath);

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
      } catch {
        // Silently try next config path
      }
    }
  }

  return null;
}

/**
 * Parses TypeScript config file content to extract stories array
 * Simple regex-based parser for common Storybook config patterns
 *
 * @param content - The TypeScript config file content
 * @returns The parsed config with stories array, or null if parsing fails
 */
export function parseTypeScriptConfig(content: string): StorybookConfig | null {
  // Look for stories array pattern: stories: ['...'] or stories: ["..."]
  // Handle both single string and array of strings
  // Use non-greedy match but ensure we capture the full array content
  const storiesPattern = /stories:\s*\[([^\]]+)\]/s;
  const match = content.match(storiesPattern);

  if (!match) {
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
    return null;
  }

  return { stories };
}

