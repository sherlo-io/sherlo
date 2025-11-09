// withSherlo.ts
import * as path from 'path';
import { extractAllMocksFromStory, generateMockFiles } from './storyMocksParser';

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
   * Path to story file (relative to project root or absolute).
   * When provided, extracts mocks from ALL variants and generates dynamic mocks
   * that check getCurrentVariant() at runtime.
   */
  mockFile?: string;
  /**
   * Legacy API: map of package names to absolute paths of mock files.
   * Use mockFile instead.
   */
  mocks?: Record<string, string>;
  /**
   * Extra folders to watch (e.g., the mocks dir).
   */
  watchFolders?: string[];
  /**
   * Enable noisy resolver logs.
   */
  debug?: boolean;
}

/**
 * Configures Metro bundler to work with Sherlo mocks in React Native.
 * This function wraps a Metro configuration to enable dynamic mock resolution.
 *
 * @param config - The Metro bundler configuration to be modified.
 * @param options - Options to customize the Sherlo mock configuration.
 * @returns The modified Metro configuration.
 *
 * @example
 * const { getDefaultConfig } = require('expo/metro-config');
 * const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');
 * const path = require('path');
 *
 * const projectRoot = __dirname;
 * const config = getDefaultConfig(projectRoot);
 *
 * module.exports = withSherlo(config, {
 *   mockFile: path.resolve(projectRoot, './src/stories/MyComponent.stories.tsx'),
 *   debug: true,
 * });
 */
function withSherlo(
  config: MetroConfig,
  { mockFile, mocks: legacyMocks = {}, watchFolders = [], debug = false }: WithSherloOptions = {}
): MetroConfig {
  const DEBUG = !!debug;
  const log = (...a: any[]) => DEBUG && console.log('[SHERLO:resolver]', ...a);

  let mocks: Record<string, string> = {};

  // New API: extract mocks from all variants in story file
  if (mockFile) {
    try {
      // Resolve mockFile path - if absolute, use as-is; otherwise resolve relative to project root
      // Use config.projectRoot if available, otherwise fall back to process.cwd()
      const projectRoot = config.projectRoot || process.cwd();
      const storyFilePath = path.isAbsolute(mockFile)
        ? mockFile
        : path.resolve(projectRoot, mockFile);

      console.log(`[SHERLO:resolver] Extracting mocks from story file: ${storyFilePath}`);

      // Extract mocks from ALL variants in the story file
      const allVariantsMocks = extractAllMocksFromStory(storyFilePath);

      if (Object.keys(allVariantsMocks).length > 0) {
        // Generate mock files dynamically that check getCurrentVariant() at runtime
        // Use a cache directory at project root level
        const cacheDir = path.join(projectRoot, '.story-mocks-cache');
        const generatedMocks = generateMockFiles(allVariantsMocks, cacheDir);

        mocks = generatedMocks;
        console.log(
          `[SHERLO:resolver] Generated ${
            Object.keys(mocks).length
          } mock file(s) for packages: ${Object.keys(mocks).join(', ')}`
        );

        // Add cache directory to watchFolders
        watchFolders = [...watchFolders, cacheDir];
      } else {
        console.warn('[SHERLO:resolver] No mocks found in any variant in story file');
      }
    } catch (error: any) {
      console.error('[SHERLO:resolver] Error extracting mocks from story:', error.message);
      // Fall back to empty mocks or legacy mocks
      mocks = legacyMocks;
    }
  } else {
    // Legacy API: use provided mocks map
    mocks = legacyMocks;
  }

  // Ensure watchFolders includes our extras
  config.watchFolders = [...(config.watchFolders || []), ...watchFolders];

  const prevResolve = config.resolver?.resolveRequest;

  // Make sure resolver object exists
  config.resolver = config.resolver || {};

  config.resolver.resolveRequest = (context: any, moduleName: string, platform: string | null) => {
    // Debug interesting requests
    if (DEBUG && (moduleName in mocks || moduleName.endsWith(':real'))) {
      console.log(
        '[SHERLO:resolver] Resolving:',
        moduleName,
        moduleName in mocks ? '→ MOCKED' : '→ real'
      );
    }

    // Handle "<pkg>:real" → resolve original package via base resolver
    if (moduleName.endsWith(':real')) {
      const realName = moduleName.slice(0, -':real'.length);
      const base = prevResolve ?? context.resolveRequest;
      const res = base(context, realName, platform);
      return res;
    }

    // If in mocks map, return the mock file
    if (mocks[moduleName]) {
      return { type: 'sourceFile', filePath: mocks[moduleName] };
    }

    // Fallback
    const rr = prevResolve ?? context.resolveRequest;
    return rr(context, moduleName, platform);
  };

  return config;
}

export default withSherlo;
module.exports = withSherlo;

