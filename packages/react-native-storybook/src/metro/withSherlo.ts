// withSherlo.ts
import * as path from 'path';
import * as fs from 'fs';
import type { MetroConfig } from 'metro-config';
import { discoverStoryFiles } from './storyDiscovery';
import { createRealModuleResolver, createMockResolver } from './resolver';
import type { StoryMockMap, WithSherloOptions } from './types';
import { SHERLO_DIR_NAME, STORY_FILES_CACHE_FILE, MOCK_DIR_NAME } from './constants';
import { preGenerateMockFiles } from './mockGeneration/preGenerateMocks';
import { verifyBabelDependencies } from './mockGeneration/verifyBabelDependencies';

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
function withSherlo(config: MetroConfig, { debug = false, enabled = true }: WithSherloOptions = {}): MetroConfig {
  // If disabled, return config unchanged (no mock system setup)
  if (!enabled) {
    console.log('[SHERLO] Mock system is disabled (enabled: false)');
    return config;
  }

  // Discover all story files
  const projectRoot = config.projectRoot || process.cwd();
  console.log(`[SHERLO] withSherlo: Starting mock system setup (projectRoot: ${projectRoot})`);
  const storyFiles = discoverStoryFiles(projectRoot);
  console.log(`[SHERLO] withSherlo: Discovered ${storyFiles.length} story file(s)`);
  if (storyFiles.length > 0) {
    console.log(`[SHERLO] withSherlo: Story files: ${storyFiles.slice(0, 5).join(', ')}${storyFiles.length > 5 ? '...' : ''}`);
  }

  // Store project root in global for getCurrentStory to access
  (global as any).__SHERLO_PROJECT_ROOT__ = projectRoot;

  // Note: If no story files are found, mocks will not be available

  // Initialize empty mock cache (will be populated/updated by transformer during bundling)
  const storyMocks: StoryMockMap = new Map();
  (global as any).__SHERLO_STORY_MOCKS__ = storyMocks;
  (global as any).__SHERLO_STORY_FILES__ = storyFiles;

  // Store story files in a JSON file so transformer can access them
  // Metro workers run in separate processes, so globals/config don't persist
  // Write to a file that the transformer can read
  const { getSherloDirectory } = require('./constants');
  const sherloDir = getSherloDirectory(projectRoot);
  if (!fs.existsSync(sherloDir)) {
    fs.mkdirSync(sherloDir, { recursive: true });
  }
  const storyFilesPath = path.join(sherloDir, STORY_FILES_CACHE_FILE);
  fs.writeFileSync(storyFilesPath, JSON.stringify({ storyFiles, projectRoot }), 'utf-8');

  // Verify Babel dependencies are available before attempting pre-generation
  // This catches issues early without requiring expensive builds
  if (storyFiles.length > 0) {
    const babelVerification = verifyBabelDependencies(projectRoot);
    if (!babelVerification.available) {
      console.error(`[SHERLO] ⚠️  Babel dependencies are missing! Mock pre-generation will fail.`);
      console.error(`[SHERLO] Missing packages: ${babelVerification.missing.join(', ')}`);
      console.error(`[SHERLO] Please ensure these packages are installed in ${projectRoot}/node_modules`);
      console.error(`[SHERLO] Add to package.json dependencies: ${babelVerification.missing.map(pkg => `"${pkg}": "^7.23.0"`).join(', ')}`);
      if (babelVerification.warnings.length > 0) {
        console.error(`[SHERLO] Resolution warnings:`);
        babelVerification.warnings.forEach(warning => console.error(`[SHERLO]   - ${warning}`));
      }
      console.warn(`[SHERLO] Pre-generation skipped. Mocks will be generated during bundling (may not work in preview builds)`);
    } else {
      if (babelVerification.warnings.length > 0) {
        console.warn(`[SHERLO] Babel dependencies found but with warnings:`);
        babelVerification.warnings.forEach(warning => console.warn(`[SHERLO]   - ${warning}`));
      }
      
      // Pre-generate mock files before Metro initializes
      // This ensures mock files exist when Metro resolves modules (similar to Storybook's approach)
      // Storybook generates storybook.requires.ts during setup; we generate mock files
      try {
        const mockFiles = preGenerateMockFiles(storyFiles, projectRoot);
        if (mockFiles.size > 0) {
          console.log(`[SHERLO] Pre-generation complete: ${mockFiles.size} mock file(s) ready for Metro`);
          
          // Set up file watchers to auto-regenerate mocks when story files change
          try {
            const { watchAllStoryFiles } = require('./mockGeneration/watchStoryFiles');
            watchAllStoryFiles(storyFiles, projectRoot);
            console.log(`[SHERLO] File watchers set up for ${storyFiles.length} story file(s)`);
          } catch (error: any) {
            console.warn(`[SHERLO] Failed to set up file watchers: ${error.message}`);
            // Don't fail setup if watchers fail - mocks still work, just no auto-regeneration
          }
        }
      } catch (error: any) {
        console.warn(`[SHERLO] Pre-generation failed, mocks will be generated during bundling: ${error.message}`);
      }
    }
  }

  // Configure Metro transformer to extract mocks from story files
  // Metro uses babelTransformerPath to load the transformer, not a function
  // We need to create a custom transformer file that wraps Metro's default transformer
  // Create a mutable copy to avoid readonly property errors
  const mutableConfig: any = {
    ...config,
    transformer: config.transformer ? { ...config.transformer } : {},
    resolver: config.resolver ? { ...config.resolver } : {},
    serializer: config.serializer ? { ...config.serializer } : {},
    watchFolders: config.watchFolders ? [...config.watchFolders] : [],
  };

  // Enable require.context() support (same as Storybook does)
  // This ensures Metro properly handles require.context() calls and preserves all exports
  // This is critical for mock-files.requires.ts which uses require.context() to import all mock files
  if (!mutableConfig.transformer.unstable_allowRequireContext) {
    mutableConfig.transformer.unstable_allowRequireContext = true;
    console.log(`[SHERLO] Enabled unstable_allowRequireContext for require.context() support`);
  }
  
  // Note: We don't add .sherlo/mocks to blockList because:
  // 1. Mock files are pre-generated before Metro starts, so they exist when Metro needs them
  // 2. Metro needs to compute SHA-1 for files returned by the resolver
  // 3. blockList prevents Metro from accessing files, which causes SHA-1 computation failures
  // 4. Mock files are now in .sherlo/mocks/ (source directory) so Metro transforms them normally
  // The resolver already checks fs.existsSync() before returning paths, so we're safe
  if (storyFiles.length > 0) {
    console.log(`[SHERLO] withSherlo: Setting up transformer for mock extraction`);
    // Ensure transformer object exists
    if (!mutableConfig.transformer) {
      mutableConfig.transformer = {};
    }

    // Get the existing babelTransformerPath (set by Metro config or Expo)
    const existingTransformerPath = mutableConfig.transformer.babelTransformerPath;
    console.log(`[SHERLO] withSherlo: Base transformer path: ${existingTransformerPath || 'default'}`);

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
      console.log(`[SHERLO] withSherlo: Using custom transformer at ${customTransformerPath}`);
      mutableConfig.transformer.babelTransformerPath = customTransformerPath;
    }

    // Configure getTransformOptions to disable optimization for mock files
    // This prevents Metro from stripping arrow function bodies during transformation
    const existingGetTransformOptions = mutableConfig.transformer.getTransformOptions;
    mutableConfig.transformer.getTransformOptions = async (
      entryPoints: string[],
      options: any,
      getDependenciesOf: (filePath: string) => Promise<string[]>
    ) => {
      // Check if any entry point is a mock file
      const { getMockDirectory } = require('./constants');
      const mockDir = getMockDirectory(projectRoot);
      const isMockFile = entryPoints.some((entryPoint: string) =>
        entryPoint.includes(mockDir) || entryPoint.includes(path.join(SHERLO_DIR_NAME, MOCK_DIR_NAME))
      );

      // Call existing getTransformOptions if it exists
      const baseOptions = existingGetTransformOptions
        ? await existingGetTransformOptions(entryPoints, options, getDependenciesOf)
        : {};

      if (isMockFile) {
        console.log(`[SHERLO] getTransformOptions: Detected mock file, FORCING dev mode to prevent Babel optimization`);
        // CRITICAL: Force dev mode at the getTransformOptions level
        // This ensures Metro passes dev=true to the transformer, which disables Babel's minification plugins
        // This is the key fix - getTransformOptions runs BEFORE the transformer and sets the options
        return {
          ...baseOptions,
          // Force development mode - this is what disables Babel's minification plugins
          dev: true,
          minify: false,
          transform: {
            ...baseOptions.transform,
            // Disable inline requires which can cause optimization issues
            inlineRequires: false,
            // Disable experimental import support which can optimize away unused code
            experimentalImportSupport: false,
            // Disable non-inlineable requires
            nonInlinedRequires: [],
            // Configure minifier to preserve function bodies for mock files
            minifierConfig: {
              ...baseOptions.transform?.minifierConfig,
              compress: {
                ...baseOptions.transform?.minifierConfig?.compress,
                // Disable dead code elimination for mock files
                dead_code: false,
                // Preserve function names
                keep_fnames: true,
                // Don't remove unused code
                unused: false,
              },
              mangle: {
                ...baseOptions.transform?.minifierConfig?.mangle,
                // Preserve function names during mangling
                keep_fnames: true,
              },
            },
          },
        };
      }

      return baseOptions;
    };
  } else {
    console.log(`[SHERLO] withSherlo: No story files found, skipping transformer setup`);
  }

  // Resolver-based mocking for runtime mock resolution
  // Redirect mocked packages to generated mock files
  const prevResolve = mutableConfig.resolver?.resolveRequest;
  if (prevResolve) {
    console.log(`[SHERLO] withSherlo: Setting up custom resolver (hasStoryFiles: ${storyFiles.length > 0})`);
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
      // Pass hasStoryFiles to optimize resolver (skip file system checks if no story files)
      const mockResolver = createMockResolver(projectRoot, prevResolve, storyFiles.length > 0);
      return mockResolver(context, moduleName, platform);
    };
  } else {
    console.log(`[SHERLO] withSherlo: No resolver.resolveRequest found, skipping custom resolver setup`);
  }

  // Create mock files directory
  // Default: node_modules/.sherlo/mocks/ (already gitignored, no user setup needed)
  const { getMockDirectory } = require('./constants');
  const mockFilesDir = getMockDirectory(projectRoot);
    
  if (!fs.existsSync(mockFilesDir)) {
    fs.mkdirSync(mockFilesDir, { recursive: true });
    console.log(`[SHERLO] Created mock files directory: ${mockFilesDir}`);
  }
  
  // Add mock files directory to watchFolders so Metro watches it for changes
  // This is important because mock files are generated source files that Metro needs to transform
  const mockFilesDirAbsolute = path.resolve(mockFilesDir);
  if (!mutableConfig.watchFolders.includes(mockFilesDirAbsolute)) {
    mutableConfig.watchFolders.push(mockFilesDirAbsolute);
    console.log(`[SHERLO] Added mock files directory to watchFolders: ${mockFilesDirAbsolute}`);
  }

  console.log(`[SHERLO] withSherlo: Mock system setup complete`);
  return mutableConfig as MetroConfig;
}

export default withSherlo;
module.exports = withSherlo;
