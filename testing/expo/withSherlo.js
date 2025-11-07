// metro/withSherlo.js
const path = require('path');

/**
 * withSherlo(config, { mocks, watchFolders?, debug? })
 * - mocks: { [packageName: string]: absolutePathToMockFile }
 * - watchFolders: string[] (optional) – extra folders to watch (e.g., the mocks dir)
 * - debug: boolean (optional) – enable noisy resolver logs
 */
function withSherlo(config, { mocks = {}, watchFolders = [], debug = false } = {}) {
  const DEBUG = !!debug;
  const log = (...a) => DEBUG && console.log('[SHERLO:resolver]', ...a);

  // Ensure watchFolders includes our extras
  config.watchFolders = [...(config.watchFolders || []), ...watchFolders];

  const prevResolve = config.resolver?.resolveRequest;

  // Make sure resolver object exists
  config.resolver = config.resolver || {};

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Debug interesting requests
    if (DEBUG && (moduleName in mocks || moduleName.endsWith(':real'))) {
      log('req:', { moduleName, platform });
    }

    // Handle "<pkg>:real" → resolve original package via base resolver
    if (moduleName.endsWith(':real')) {
      const realName = moduleName.slice(0, -':real'.length);
      const base = prevResolve ?? context.resolveRequest;
      const res = base(context, realName, platform);
      if (DEBUG) log('resolve :real ->', realName, '=>', res?.filePath || res?.type);
      return res;
    }

    // If in mocks map, return the mock file
    if (mocks[moduleName]) {
      if (DEBUG) log('mocking', moduleName, '->', mocks[moduleName]);
      return { type: 'sourceFile', filePath: mocks[moduleName] };
    }

    // Fallback
    const rr = prevResolve ?? context.resolveRequest;
    return rr(context, moduleName, platform);
  };

  return config;
}

module.exports = withSherlo;
