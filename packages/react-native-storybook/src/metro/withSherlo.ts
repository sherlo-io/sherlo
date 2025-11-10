// withSherlo.ts
import * as path from 'path';
import * as fs from 'fs';
import { discoverStoryFiles } from './storyDiscovery';
import { StoryMockMap } from './mockExtraction';

// Metro config types - using a compatible interface
interface MetroConfig {
  projectRoot?: string;
  watchFolders?: string[];
  transformer?: {
    getTransformOptions?: () => any;
    [key: string]: any;
  };
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
  
  // Store project root in global for getCurrentStory to access
  (global as any).__SHERLO_PROJECT_ROOT__ = projectRoot;

  if (storyFiles.length === 0) {
    console.warn('[SHERLO:resolver] No story files found. Mocks will not be available.');
  }

  // Step 3: Initialize empty mock cache (will be populated by transformer)
  const storyMocks: StoryMockMap = new Map();
  (global as any).__SHERLO_STORY_MOCKS__ = storyMocks;
  (global as any).__SHERLO_STORY_FILES__ = storyFiles;
  
  // Store story files in a JSON file so transformer can access them
  // Metro workers run in separate processes, so globals/config don't persist
  // Write to a file that the transformer can read
  const sherloDir = path.join(projectRoot, '.sherlo');
  if (!fs.existsSync(sherloDir)) {
    fs.mkdirSync(sherloDir, { recursive: true });
  }
  const storyFilesPath = path.join(sherloDir, 'story-files.json');
  fs.writeFileSync(storyFilesPath, JSON.stringify({ storyFiles, projectRoot }), 'utf-8');
  console.log(`[SHERLO:resolver] Wrote ${storyFiles.length} story files to ${storyFilesPath}`);

  // Step 4: Configure Metro transformer to extract mocks from story files
  // Metro uses babelTransformerPath to load the transformer, not a function
  // We need to create a custom transformer file that wraps Metro's default transformer
  if (storyFiles.length > 0) {
    // Ensure transformer object exists
    config.transformer = config.transformer || {};

    // Get the existing babelTransformerPath (Expo/Metro sets this)
    const existingTransformerPath = config.transformer.babelTransformerPath;

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
      console.warn(
        `[SHERLO:resolver] Custom transformer not found at ${customTransformerPath}. ` +
          `Mock extraction may not work. Please ensure the package is built. ` +
          `Current __dirname: ${thisFileDir}`
      );
    } else {
      config.transformer.babelTransformerPath = customTransformerPath;
      if (DEBUG) {
        log(`[SHERLO:resolver] Using custom transformer at: ${customTransformerPath}`);
      }
    }
  }

  // Resolver-based mocking for runtime mock resolution
  // Redirect mocked packages to generated mock files
  const prevResolve = config.resolver?.resolveRequest;
  if (prevResolve) {
    config.resolver = config.resolver || {};
    config.resolver.resolveRequest = (
      context: any,
      moduleName: string,
      platform: string | null
    ) => {
      // Log all resolver calls for relative paths (to debug mock file requires)
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        console.log(`[SHERLO:resolver] Resolving relative path: ${moduleName} (from: ${context.originModulePath || 'unknown'})`);
      }
      
      // Handle "<pkg>:real" → resolve original package via base resolver
      if (moduleName.endsWith(':real')) {
        const realName = moduleName.slice(0, -':real'.length);
        // Always log :real resolution attempts (important for debugging fallback to real modules)
        console.log(`[SHERLO:resolver] Resolving :real import: ${moduleName} -> ${realName}`);
        const base = prevResolve ?? context.resolveRequest;
        
        // For relative paths, try resolving relative to common source directories
        // This handles cases where the mock file is in node_modules/.sherlo-mocks/
        // and can't resolve relative paths correctly
        if (realName.startsWith('.') || realName.startsWith('/')) {
          const commonSourceDirs = [
            path.join(projectRoot, 'src'),
            path.join(projectRoot, 'testing', 'testing-components', 'src'),
            projectRoot,
          ];
          
          for (const sourceDir of commonSourceDirs) {
            const resolvedPath = path.resolve(sourceDir, realName);
            // Try with different extensions
            const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
            for (const ext of extensions) {
              const fullPath = ext ? `${resolvedPath}${ext}` : resolvedPath;
              if (fs.existsSync(fullPath)) {
                console.log(`[SHERLO:resolver] Found real module at: ${fullPath}`);
                return {
                  type: 'sourceFile',
                  filePath: fullPath,
                };
              }
            }
          }
          console.warn(`[SHERLO:resolver] Could not resolve relative path ${realName} in common source directories`);
        }
        
        try {
          const result = base(context, realName, platform);
          console.log(`[SHERLO:resolver] :real resolution result:`, result);
          return result;
        } catch (e: any) {
          console.error(`[SHERLO:resolver] :real resolution failed for ${moduleName}:`, e.message);
          throw e;
        }
      }
      
      // Check if this package/module has mocks and redirect to mock file
      // Mock files are generated after transformer extracts mocks
      // Normalize relative paths to match how mock files are generated
      let normalizedModuleName = moduleName;
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        // For relative paths, use the same normalization as generateAllMockFiles:
        // Normalize separators and remove extension, then replace / with __
        normalizedModuleName = moduleName.replace(/\\/g, '/').replace(/\.(ts|tsx|js|jsx)$/, '');
      }
      
      const safeFileName = normalizedModuleName.replace(/\//g, '__');
      const mockFilePath = path.join(projectRoot, 'node_modules', '.sherlo-mocks', `${safeFileName}.js`);
      if (fs.existsSync(mockFilePath)) {
        log(`[SHERLO:resolver] Redirecting ${moduleName} (safeFileName: ${safeFileName}) to mock file: ${mockFilePath}`);
        return {
          type: 'sourceFile',
          filePath: mockFilePath,
        };
      } else {
        // Debug: log when we're NOT redirecting
        if (moduleName.includes('testHelper') || moduleName === 'expo-localization') {
          log(`[SHERLO:resolver] Mock file NOT found for ${moduleName} (safeFileName: ${safeFileName}) at: ${mockFilePath}`);
        }
      }
      
      // Fallback to default resolver
      return prevResolve(context, moduleName, platform);
    };
  }

  return config;
}

export default withSherlo;
module.exports = withSherlo;
