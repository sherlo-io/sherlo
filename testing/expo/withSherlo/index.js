// withSherlo/index.js
const path = require('path');
const { extractAllMocksFromStory, generateMockFiles } = require('./storyMocksParser');

/**
 * withSherlo(config, { mockFile?, mocks?, watchFolders?, debug? })
 * - mockFile: string (optional) – path to story file (relative to project root or absolute)
 *   When provided, extracts mocks from ALL variants and generates dynamic mocks that check getCurrentVariant() at runtime
 * - mocks: { [packageName: string]: absolutePathToMockFile } (optional) – legacy API, use mockFile instead
 * - watchFolders: string[] (optional) – extra folders to watch (e.g., the mocks dir)
 * - debug: boolean (optional) – enable noisy resolver logs
 */
function withSherlo(
  config,
  { mockFile, mocks: legacyMocks = {}, watchFolders = [], debug = false } = {}
) {
  const DEBUG = !!debug;
  const log = (...a) => DEBUG && console.log('[SHERLO:resolver]', ...a);

  let mocks = {};

  // New API: extract mocks from all variants in story file
  if (mockFile) {
    try {
      // Resolve mockFile path - if absolute, use as-is; otherwise resolve relative to project root (one level up from withSherlo)
      const projectRoot = path.resolve(__dirname, '..');
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
    } catch (error) {
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

  config.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = withSherlo;
