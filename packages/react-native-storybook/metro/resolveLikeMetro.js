'use strict';

// ---------------------------------------------------------------------------
// Resolving a module name the way the app's bundler does, while the config loads
// ---------------------------------------------------------------------------
//
// The mock scan has to register the file Metro will hand the resolver for each mocked name, or the
// redirect misses. Node's require.resolve is not that: it knows nothing of resolver.extraNodeModules
// (`components -> src/components`), of the project's resolverMainFields, sourceExts or package
// exports conditions. So the scan asks Metro's own resolver (the `metro-resolver` package the
// project's Metro already depends on) with a context built from the same config.
//
// A config is read before Metro exists, so there is no Metro-built context to borrow; the one made
// here reads the file system directly. It answers only the questions a resolve asks. When anything
// about it is unavailable (no metro-resolver in the project, a resolver that throws), the answer is
// null and the caller falls back to what it did before.

var fs = require('fs');
var path = require('path');
var Module = require('module');

var DEFAULT_SOURCE_EXTS = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];
var DEFAULT_MAIN_FIELDS = ['react-native', 'browser', 'main'];
var PLATFORM = 'ios';

/**
 * @param {object} metroConfig - the Metro config being loaded (read for its `resolver` only)
 * @param {string} projectRoot
 * @returns {function(string, string=): (string|null)} (moduleName, fromFile) -> the absolute file
 *   Metro resolves it to for `fromFile` (default: a file in the project root), or null.
 */
function createResolveLikeMetro(metroConfig, projectRoot) {
  var metroResolver;
  try {
    metroResolver = Module.createRequire(path.join(projectRoot, 'package.json'))('metro-resolver');
  } catch (_) {
    return function resolveNothing() {
      return null;
    };
  }

  var resolverConfig = (metroConfig && metroConfig.resolver) || {};
  var packages = new Map();

  function getPackage(packageJsonPath) {
    if (!packages.has(packageJsonPath)) {
      var parsed = null;
      try {
        parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      } catch (_) {
        /* no package.json there */
      }
      packages.set(packageJsonPath, parsed);
    }
    return packages.get(packageJsonPath);
  }

  function fileSystemLookup(candidate) {
    try {
      var stat = fs.statSync(candidate);
      return {
        exists: true,
        type: stat.isDirectory() ? 'd' : 'f',
        realPath: fs.realpathSync(candidate),
      };
    } catch (_) {
      return { exists: false };
    }
  }

  // The closest package.json at or above the module, never past a node_modules folder.
  function getPackageForModule(absoluteModulePath) {
    var dir = path.dirname(absoluteModulePath);
    var segments = [path.basename(absoluteModulePath)];
    while (true) {
      var packageJson = getPackage(path.join(dir, 'package.json'));
      if (packageJson) {
        return {
          packageJson: packageJson,
          rootPath: dir,
          packageRelativePath: segments.join(path.sep),
        };
      }
      var parent = path.dirname(dir);
      if (parent === dir || path.basename(dir) === 'node_modules') return null;
      segments.unshift(path.basename(dir));
      dir = parent;
    }
  }

  var sourceExts = resolverConfig.sourceExts || DEFAULT_SOURCE_EXTS;

  return function resolveLikeMetro(moduleName, fromFile) {
    var context = {
      allowHaste: false,
      assetExts: new Set(resolverConfig.assetExts || []),
      customResolverOptions: {},
      disableHierarchicalLookup: !!resolverConfig.disableHierarchicalLookup,
      doesFileExist: function (candidate) {
        return fileSystemLookup(candidate).exists;
      },
      extraNodeModules: resolverConfig.extraNodeModules || null,
      dev: true,
      getPackage: getPackage,
      getPackageForModule: getPackageForModule,
      fileSystemLookup: fileSystemLookup,
      mainFields: resolverConfig.resolverMainFields || DEFAULT_MAIN_FIELDS,
      originModulePath: fromFile || path.join(projectRoot, 'index.js'),
      nodeModulesPaths: resolverConfig.nodeModulesPaths || [],
      preferNativePlatform: true,
      resolveAsset: function () {
        return null;
      },
      redirectModulePath: function (modulePath) {
        return modulePath;
      },
      resolveHasteModule: function () {
        return undefined;
      },
      resolveHastePackage: function () {
        return undefined;
      },
      resolveRequest: null,
      sourceExts: sourceExts,
      unstable_conditionNames: resolverConfig.unstable_conditionNames || ['require', 'import'],
      unstable_conditionsByPlatform: resolverConfig.unstable_conditionsByPlatform || {
        ios: ['react-native'],
        android: ['react-native'],
        web: ['browser'],
      },
      unstable_enablePackageExports: !!resolverConfig.unstable_enablePackageExports,
      unstable_logWarning: function () {},
    };
    try {
      var resolution = metroResolver.resolve(context, moduleName, PLATFORM);
      return resolution && resolution.type === 'sourceFile' ? resolution.filePath : null;
    } catch (_) {
      return null;
    }
  };
}

module.exports = { createResolveLikeMetro: createResolveLikeMetro };
