// withSherlo.ts
import * as path from 'path';
import * as fs from 'fs';
import type { MetroConfig } from 'metro-config';
import { discoverStoryFiles } from './storyDiscovery';
import { createRealModuleResolver, createMockResolver } from './resolver';
import type { StoryMockMap, WithSherloOptions } from './types';
import { SHERLO_DIR_NAME, STORY_FILES_CACHE_FILE } from './constants';

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
 * ```javascript
 * // For Expo projects
 * const { getDefaultConfig } = require('expo/metro-config');
 * const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');
 * const config = getDefaultConfig(__dirname);
 * module.exports = withSherlo(config);
 *
 * // For standard React Native projects
 * const { getDefaultConfig } = require('metro-config');
 * const withSherlo = require('@sherlo/react-native-storybook/metro/withSherlo');
 * const config = getDefaultConfig(__dirname);
 * module.exports = withSherlo(config);
 * ```
 */
function withSherlo(config: MetroConfig, { debug = false }: WithSherloOptions = {}): MetroConfig {
  const DEBUG = !!debug;

  // Step 2: Discover all story files
  const projectRoot = config.projectRoot || process.cwd();
  const storyFiles = discoverStoryFiles(projectRoot);

  // Store project root in global for getCurrentStory to access
  (global as any).__SHERLO_PROJECT_ROOT__ = projectRoot;

  // Note: If no story files are found, mocks will not be available

  // Step 3: Initialize empty mock cache (will be populated by transformer)
  const storyMocks: StoryMockMap = new Map();
  (global as any).__SHERLO_STORY_MOCKS__ = storyMocks;
  (global as any).__SHERLO_STORY_FILES__ = storyFiles;

  // Store story files in a JSON file so transformer can access them
  // Metro workers run in separate processes, so globals/config don't persist
  // Write to a file that the transformer can read
  const sherloDir = path.join(projectRoot, SHERLO_DIR_NAME);
  if (!fs.existsSync(sherloDir)) {
    fs.mkdirSync(sherloDir, { recursive: true });
  }
  const storyFilesPath = path.join(sherloDir, STORY_FILES_CACHE_FILE);
  fs.writeFileSync(storyFilesPath, JSON.stringify({ storyFiles, projectRoot }), 'utf-8');

  // Step 4: Configure Metro transformer to extract mocks from story files
  // Metro uses babelTransformerPath to load the transformer, not a function
  // We need to create a custom transformer file that wraps Metro's default transformer
  // Create a mutable copy to avoid readonly property errors
  const mutableConfig: any = {
    ...config,
    transformer: config.transformer ? { ...config.transformer } : {},
    resolver: config.resolver ? { ...config.resolver } : {},
  };
  if (storyFiles.length > 0) {
    // Ensure transformer object exists
    if (!mutableConfig.transformer) {
      mutableConfig.transformer = {};
    }

    // Get the existing babelTransformerPath (set by Metro config or Expo)
    const existingTransformerPath = mutableConfig.transformer.babelTransformerPath;

    // Store transformer path in global so our custom transformer can use it
    if (existingTransformerPath) {
      (global as any).__SHERLO_BASE_TRANSFORMER_PATH__ = existingTransformerPath;
    }

    // Point Metro to our custom transformer file
    // The transformer file is in the dist/metro directory (compiled from src/metro/sherloTransformer.ts)
    // __dirname in compiled code points to dist/metro, so we go up to package root
    // But when running from source, __dirname might be different, so we resolve relative to this file
    const thisFileDir = __dirname;
    // If we're in dist/metro, go up to package root, then to dist/metro
    // If we're in src/metro, go up to package root, then to dist/metro
    const packageRoot = path.resolve(thisFileDir, '..', '..');
    const customTransformerPath = path.join(packageRoot, 'dist', 'metro', 'sherloTransformer.js');

    // Verify the transformer file exists
    if (!fs.existsSync(customTransformerPath)) {
      console.error(
        `[SHERLO] Custom transformer not found at ${customTransformerPath}. Mock extraction may not work. Please ensure the package is built.`
      );
    } else {
      mutableConfig.transformer.babelTransformerPath = customTransformerPath;
    }
  }

  // Resolver-based mocking for runtime mock resolution
  // Redirect mocked packages to generated mock files
  const prevResolve = mutableConfig.resolver?.resolveRequest;
  if (prevResolve) {
    mutableConfig.resolver = mutableConfig.resolver || {};
    mutableConfig.resolver.resolveRequest = (
      context: any,
      moduleName: string,
      platform: string | null
    ) => {
      // Handle "<pkg>:real" → resolve original package via base resolver
      if (moduleName.endsWith(':real')) {
        const realResolver = createRealModuleResolver(projectRoot, prevResolve);
        const result = realResolver(context, moduleName, platform);
        if (result) return result;
        // If realResolver returns null, fall through to base resolver
        return prevResolve(context, moduleName.slice(0, -':real'.length), platform);
      }

      // Check if this package/module has mocks and redirect to mock file
      const mockResolver = createMockResolver(projectRoot, prevResolve);
      return mockResolver(context, moduleName, platform);
    };
  }

  return mutableConfig as MetroConfig;
}

export default withSherlo;
module.exports = withSherlo;
