'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Detects the iOS app name by finding a .xcodeproj in the ios/ directory.
 * Returns null if ios/ doesn't exist or no .xcodeproj is found.
 *
 * @param {string} projectRoot
 * @returns {string|null}
 */
function detectIosAppName(projectRoot) {
  var iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) return null;
  var entries;
  try { entries = fs.readdirSync(iosDir); } catch (e) { return null; }
  var xcodeproj = entries.find(function (e) { return e.endsWith('.xcodeproj'); });
  if (!xcodeproj) return null;
  return xcodeproj.replace('.xcodeproj', '');
}

/**
 * Writes the sherlo-storybook-disabled marker files to Android assets and iOS source dirs.
 * These are detected at app startup by the native SherloInitProvider / SherloModuleCore
 * to emit ERROR_STORYBOOK_DISABLED when in testing mode.
 * Silently skips platforms whose directories do not exist.
 *
 * @param {string} projectRoot
 */
function writeMarkerFiles(projectRoot) {
  var androidAssetsDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets');
  try {
    if (!fs.existsSync(androidAssetsDir)) {
      fs.mkdirSync(androidAssetsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(androidAssetsDir, 'sherlo-storybook-disabled'), '', 'utf8');
  } catch (e) { /* android dir may not exist - skip */ }

  var iosAppName = detectIosAppName(projectRoot);
  if (iosAppName) {
    var iosAppDir = path.join(projectRoot, 'ios', iosAppName);
    try {
      if (!fs.existsSync(iosAppDir)) {
        fs.mkdirSync(iosAppDir, { recursive: true });
      }
      fs.writeFileSync(path.join(iosAppDir, 'sherlo-storybook-disabled'), '', 'utf8');
    } catch (e) { /* ios app dir not writable - skip */ }
  }
}

/**
 * Removes the sherlo-storybook-disabled marker files from both platforms.
 * Silently skips if files don't exist.
 *
 * @param {string} projectRoot
 */
function removeMarkerFiles(projectRoot) {
  var androidMarker = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'sherlo-storybook-disabled');
  try { if (fs.existsSync(androidMarker)) fs.unlinkSync(androidMarker); } catch (e) { /* ignore */ }

  var iosAppName = detectIosAppName(projectRoot);
  if (iosAppName) {
    var iosMarker = path.join(projectRoot, 'ios', iosAppName, 'sherlo-storybook-disabled');
    try { if (fs.existsSync(iosMarker)) fs.unlinkSync(iosMarker); } catch (e) { /* ignore */ }
  }
}

/**
 * Applies Sherlo Metro transforms to an already-configured Metro config object.
 *
 * Takes the result of withStorybook() + opts and returns the Sherlo-augmented config.
 * Installs the resolver redirect, polyfill injection, and storybook-wrapper.js generation.
 *
 * When opts.enabled === false, writes build-time marker files to native source directories
 * (android/app/src/main/assets/ and ios/<AppName>/) so the native SherloInitProvider /
 * SherloModuleCore can detect at startup that Storybook was disabled and emit
 * ERROR_STORYBOOK_DISABLED without depending on JS module load order.
 *
 * @param {object} result - The Metro config returned by withStorybook()
 * @param {object} [opts] - The same opts passed to withStorybook (e.g. { enabled, configPath })
 * @returns {object} Sherlo-augmented Metro config
 */
function applySherloTransforms(result, opts) {
  var projectRoot =
    (result && result.projectRoot) || process.cwd();

  var wrapperPath = path.join(
    projectRoot,
    'node_modules',
    '.cache',
    'sherlo',
    'storybook-wrapper.js'
  );

  generateWrapper(wrapperPath);

  // Write or remove native marker files for ERROR_STORYBOOK_DISABLED detection.
  // Native side (SherloInitProvider / SherloModuleCore) reads the marker at app startup
  // and emits NATIVE_ERROR if present and mode === 'testing'.
  if (opts && opts.enabled === false) {
    writeMarkerFiles(projectRoot);
  } else {
    removeMarkerFiles(projectRoot);
  }

  var existingResolveRequest =
    result && result.resolver && result.resolver.resolveRequest
      ? result.resolver.resolveRequest
      : null;

  function resolveRequest(context, moduleName, platform) {
    if (context.originModulePath === wrapperPath) {
      return existingResolveRequest
        ? existingResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
    }

    if (moduleName === '@storybook/react-native') {
      return { type: 'sourceFile', filePath: wrapperPath };
    }

    return existingResolveRequest
      ? existingResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  }

  // The polyfill is added to every bundle. It is INERT in production: production
  // safety lives entirely on the native side (SherloModuleCore.reportEarlyJsError
  // returns early if mode is not 'testing'). See metro/polyfill.js for details.
  var polyfillPath = path.join(__dirname, 'polyfill.js');
  var sherloPolyfills = [polyfillPath];

  var existingGetPolyfills =
    result && result.serializer && typeof result.serializer.getPolyfills === 'function'
      ? result.serializer.getPolyfills
      : null;

  function getPolyfills(ctx) {
    var base = existingGetPolyfills ? existingGetPolyfills(ctx) : [];
    return base.concat(sherloPolyfills);
  }

  var existingGetModulesRunBeforeMainModule =
    result && result.serializer && typeof result.serializer.getModulesRunBeforeMainModule === 'function'
      ? result.serializer.getModulesRunBeforeMainModule
      : null;

  function getModulesRunBeforeMainModule(entryFilePath) {
    return existingGetModulesRunBeforeMainModule
      ? existingGetModulesRunBeforeMainModule(entryFilePath)
      : [];
  }

  var baseResult = result || {};
  return Object.assign({}, baseResult, {
    // unstable_allowRequireContext: sb8/sb9 withStorybook(enabled:false) omits this flag, but
    // storybook.requires.ts still uses require.context(). Without this, Metro 0.81.x embeds a
    // throwing stub for r.context, crashing the app before any Sherlo error handling fires.
    transformer: Object.assign({}, baseResult.transformer, {
      unstable_allowRequireContext: true,
    }),
    resolver: Object.assign({}, baseResult.resolver, {
      resolveRequest: resolveRequest,
    }),
    serializer: Object.assign({}, baseResult.serializer, {
      getPolyfills: getPolyfills,
      getModulesRunBeforeMainModule: getModulesRunBeforeMainModule,
    }),
  });
}

/**
 * Generates the storybook-wrapper.js file.
 *
 * The wrapper redirects @storybook/react-native imports through Sherlo's patched start().
 * ERROR_STORYBOOK_DISABLED is now detected natively (SherloInitProvider / SherloModuleCore
 * reads the marker file written by writeMarkerFiles()) rather than in the wrapper, so there
 * is no SHERLO_BUILD_DISABLED constant here.
 *
 * @param {string} wrapperPath
 */
function generateWrapper(wrapperPath) {
  var cacheDir = path.dirname(wrapperPath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  var content =
    "'use strict';\n" +
    '\n' +
    "var real = require('@storybook/react-native');\n" +
    '\n' +
    '// Re-export everything from the real module.\n' +
    '// IMPORTANT: sherlo must NOT be required here at the top level.\n' +
    '// @sherlo/react-native-storybook transitively loads isStorybook7.ts which\n' +
    '// re-requires @storybook/react-native (this wrapper).  If sherlo were\n' +
    '// required before the re-exports below have run, isStorybook7.ts would\n' +
    '// see an empty exports object (circular-dep partial init), decide\n' +
    '// isStorybook7=true, and crash on uiSettings.theme.preview.backgroundColor\n' +
    '// (Storybook 8+ themes have no top-level .preview property).\n' +
    '// Requiring sherlo lazily inside patchedStart ensures the re-exports are\n' +
    '// already in place when isStorybook7.ts runs.\n' +
    'Object.keys(real).forEach(function (key) {\n' +
    "  if (key === 'start') return; // overridden below\n" +
    '  Object.defineProperty(exports, key, {\n' +
    '    enumerable: true,\n' +
    '    get: function () { return real[key]; },\n' +
    '  });\n' +
    '});\n' +
    '\n' +
    '// Patched start(): wraps view.getStorybookUI to route through sherlo getStorybook\n' +
    'exports.start = function patchedStart(config) {\n' +
    '  // Storybook is disabled when withStorybook({ enabled: false }) is set -\n' +
    '  // in that case real.start is not a function (sb8/sb9 make @storybook/react-native\n' +
    '  // an empty module; sb10 replaces .rnstorybook/index with a stub instead).\n' +
    '  // Return a stub view with getStorybookUI so .rnstorybook/index.tsx does not crash\n' +
    '  // when it calls view.getStorybookUI({...}) at module-evaluation time.\n' +
    "  if (typeof real.start !== 'function') {\n" +
    "    return { getStorybookUI: function () { return function SherloDisabledUI() { return null; }; } };\n" +
    '  }\n' +
    '\n' +
    '  // Lazy-require sherlo AFTER the re-exports above are already set up.\n' +
    '  // This breaks the circular dependency that would otherwise cause\n' +
    '  // isStorybook7 to be detected incorrectly (see comment above).\n' +
    "  var getStorybook = require('@sherlo/react-native-storybook/dist/getStorybook/index.js').default;\n" +
    "  var addStorybookToDevMenu = require('@sherlo/react-native-storybook/dist/addStorybookToDevMenu.js').default;\n" +
    '\n' +
    '  var view = real.start(config);\n' +
    '\n' +
    '  try {\n' +
    '    addStorybookToDevMenu();\n' +
    '  } catch (e) {\n' +
    "    console.error('[sherlo withStorybook] addStorybookToDevMenu failed:', e);\n" +
    '  }\n' +
    '\n' +
    '  view.__sherloOriginalGetStorybookUI = view.getStorybookUI.bind(view);\n' +
    '  view.getStorybookUI = function (params) {\n' +
    '    // Pass {} when params is undefined so Storybook always receives an object\n' +
    '    // and applies its own defaults (theme, etc.) rather than propagating\n' +
    '    // undefined into getStorybookUI which can strip those defaults.\n' +
    '    return getStorybook(view, params != null ? params : {});\n' +
    '  };\n' +
    '\n' +
    '  // STORYBOOK_LOADED is intentionally NOT emitted here.\n' +
    '  // Emitting it synchronously inside patchedStart() fires before any React\n' +
    '  // render has committed, so the runner would see STORYBOOK_LOADED and then\n' +
    '  // a crash mid-render, mis-classifying the failure scenario.\n' +
    '  // The signal is now emitted from a useEffect inside getStorybook.tsx after\n' +
    '  // the first render commits.\n' +
    '\n' +
    '  return view;\n' +
    '};\n';

  fs.writeFileSync(wrapperPath, content, 'utf8');
}

module.exports = applySherloTransforms;
module.exports.applySherloTransforms = applySherloTransforms;
module.exports.generateWrapper = generateWrapper;
module.exports.writeMarkerFiles = writeMarkerFiles;
module.exports.removeMarkerFiles = removeMarkerFiles;
