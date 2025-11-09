// withSherlo.ts
import * as path from 'path';
import { discoverStoryFiles } from './storyDiscovery';
import { extractMocksFromAllStories, StoryMockMap } from './mockExtraction';

// Metro config types - using a compatible interface
interface MetroConfig {
  projectRoot?: string;
  watchFolders?: string[];
  resolver?: {
    resolveRequest?: (
      context: any,
      moduleName: string,
      platform: string | null
    ) => { type: string; filePath: string } | null;
  };
  [key: string]: any;
}

interface WithSherloOptions {
  /**
   * Enable noisy resolver logs.
   */
  debug?: boolean;
}

/**
 * Configures Metro bundler to work with Sherlo mocks in React Native.
 * This function wraps a Metro configuration to enable dynamic mock resolution.
 * It automatically discovers all story files and extracts mocks from all variants.
 *
 * @param config - The Metro bundler configuration to be modified.
 * @param options - Options to customize the Sherlo mock configuration.
 * @returns The modified Metro configuration.
 *
 * @example
 * const { getDefaultConfig } = require('expo/metro-config');
 * const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');
 *
 * const projectRoot = __dirname;
 * const config = getDefaultConfig(projectRoot);
 *
 * module.exports = withSherlo(config, {
 *   debug: true,
 * });
 */
function withSherlo(config: MetroConfig, { debug = false }: WithSherloOptions = {}): MetroConfig {
  const DEBUG = !!debug;
  const log = (...a: any[]) => DEBUG && console.log('[SHERLO:resolver]', ...a);

  // Step 2: Discover all story files
  const projectRoot = config.projectRoot || process.cwd();
  const storyFiles = discoverStoryFiles(projectRoot);

  if (storyFiles.length === 0) {
    console.warn('[SHERLO:resolver] No story files found. Mocks will not be available.');
  }

  // Step 3: Extract mocks from all stories
  const storyMocks: StoryMockMap =
    storyFiles.length > 0 ? extractMocksFromAllStories(storyFiles, projectRoot) : new Map();

  // Store mocks in a way that's accessible to the resolver
  // We'll use a global cache or attach to config
  (global as any).__SHERLO_STORY_MOCKS__ = storyMocks;

  // TODO: Step 4 - Implement getCurrentStory() function
  // TODO: Step 5 - Implement mock resolution based on current story

  const prevResolve = config.resolver?.resolveRequest;

  // Make sure resolver object exists
  config.resolver = config.resolver || {};

  config.resolver.resolveRequest = (context: any, moduleName: string, platform: string | null) => {
    // Handle "<pkg>:real" → resolve original package via base resolver
    if (moduleName.endsWith(':real')) {
      const realName = moduleName.slice(0, -':real'.length);
      const base = prevResolve ?? context.resolveRequest;
      const res = base(context, realName, platform);
      return res;
    }

    // TODO: Step 5 - Implement mock resolution based on current story

    // Fallback to default resolver
    const rr = prevResolve ?? context.resolveRequest;
    return rr(context, moduleName, platform);
  };

  return config;
}

export default withSherlo;
module.exports = withSherlo;
