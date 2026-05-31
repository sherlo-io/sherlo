'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Writes a tiny polyfill that sets global.__sherloStorybookDisabledFlag = true.
 * This file is prepended to the bundle's polyfill list when opts.enabled === false,
 * so src/index.ts can read the flag and emit the WITHSTORYBOOK_DISABLED protocol marker.
 *
 * @param {string} cacheDir - directory to write the file into (e.g. node_modules/.cache/sherlo/)
 * @returns {string} absolute path to the generated file
 */
function writeDisabledFlagPolyfill(cacheDir) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  var flagPath = path.join(cacheDir, 'storybook-disabled-flag.js');
  fs.writeFileSync(flagPath, "'use strict';\nglobal.__sherloStorybookDisabledFlag = true;\n", 'utf8');
  return flagPath;
}

/**
 * Applies Sherlo Metro transforms to an already-configured Metro config object.
 *
 * Takes the result of withStorybook() + opts and returns the Sherlo-augmented config.
 * Installs the resolver redirect, polyfill injection, and storybook-wrapper.js generation.
 *
 * When opts.enabled === false, prepends a JS polyfill that sets global.__sherloStorybookDisabledFlag.
 * src/index.ts reads this flag at SDK-import time and emits the WITHSTORYBOOK_DISABLED protocol marker.
 * ERROR_STORYBOOK_DISABLED is detected via runner-side inference from the protocol log.
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

  // cacheDir is the same directory that wrapperPath lives in; already created by generateWrapper().
  var cacheDir = path.dirname(wrapperPath);

  // Write build-meta sidecar that the runner reads to know whether withStorybook was applied
  // and whether it was called with enabled:false. Runner uses absence of this file to detect
  // ERROR_WITHSTORYBOOK_NOT_USED.
  try {
    var buildMetaPath = path.join(cacheDir, 'build-meta.json');
    var buildMeta = {
      withStorybookApplied: true,
      enabled: !(opts && opts.enabled === false),
      sdkVersion: require('../package.json').version,
      writtenAt: new Date().toISOString(),
    };
    fs.writeFileSync(buildMetaPath, JSON.stringify(buildMeta, null, 2), 'utf8');
  } catch (_) {}

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
  // When enabled:false, prepend a tiny polyfill that sets the global disabled flag.
  // src/index.ts reads this flag and emits the WITHSTORYBOOK_DISABLED protocol marker.
  var sherloPolyfills = (opts && opts.enabled === false)
    ? [writeDisabledFlagPolyfill(cacheDir), polyfillPath]
    : [polyfillPath];

  var existingGetPolyfills =
    result && result.serializer && typeof result.serializer.getPolyfills === 'function'
      ? result.serializer.getPolyfills
      : null;

  function getPolyfills(ctx) {
    var base = existingGetPolyfills ? existingGetPolyfills(ctx) : [];
    return base.concat(sherloPolyfills);
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
    }),
  });
}

/**
 * Generates the storybook-wrapper.js file.
 *
 * The wrapper redirects @storybook/react-native imports through Sherlo's patched start().
 * ERROR_STORYBOOK_DISABLED is detected via runner-side inference: when opts.enabled === false,
 * applySherloTransforms prepends storybook-disabled-flag.js (sets global.__sherloStorybookDisabledFlag)
 * to the polyfill list; src/index.ts reads the flag and emits the WITHSTORYBOOK_DISABLED marker.
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
    '// @sherlo/react-native-storybook transitively re-requires @storybook/react-native\n' +
    '// (this wrapper); requiring sherlo lazily inside patchedStart breaks the\n' +
    '// circular-dep partial-init scenario that would otherwise expose empty exports.\n' +
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
    '  // This breaks the circular dependency (see comment above).\n' +
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
module.exports.writeDisabledFlagPolyfill = writeDisabledFlagPolyfill;
