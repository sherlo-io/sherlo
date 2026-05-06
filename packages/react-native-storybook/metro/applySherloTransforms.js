'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Applies Sherlo Metro transforms to an already-configured Metro config object.
 *
 * Takes the result of withStorybook() + opts and returns the Sherlo-augmented config.
 * Installs the resolver redirect, polyfill injection, and storybook-wrapper.js generation.
 *
 * Sherlo plumbing is ALWAYS installed regardless of opts.enabled. The wrapper's
 * patchedStart handles the disabled-storybook case (real.start not a function) by
 * emitting ERROR_STORYBOOK_DISABLED via SherloModule. opts.enabled only controls
 * withStorybook above.
 *
 * @param {object} result - The Metro config returned by withStorybook()
 * @param {object} [opts] - The same opts passed to withStorybook (e.g. { enabled, configPath })
 * @returns {object} Sherlo-augmented Metro config
 */
function applySherloTransforms(result, opts) {
  var projectRoot =
    (result && result.projectRoot) || process.cwd();

  var resolvedConfigPath =
    opts && opts.configPath ? path.resolve(projectRoot, opts.configPath) : null;

  var wrapperPath = path.join(
    projectRoot,
    'node_modules',
    '.cache',
    'sherlo',
    'storybook-wrapper.js'
  );

  generateWrapper(wrapperPath, resolvedConfigPath);

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

  var existingGetPolyfills =
    result && result.serializer && typeof result.serializer.getPolyfills === 'function'
      ? result.serializer.getPolyfills
      : null;

  function getPolyfills(ctx) {
    var base = existingGetPolyfills ? existingGetPolyfills(ctx) : [];
    return base.concat([polyfillPath]);
  }

  var baseResult = result || {};
  return Object.assign({}, baseResult, {
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
 * @param {string} wrapperPath
 * @param {string|null} configPath - Resolved absolute config path (or null if not provided)
 */
function generateWrapper(wrapperPath, configPath) {
  var cacheDir = path.dirname(wrapperPath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Build the lazy entry loader (only when configPath is known).
  // Wrapping in a function defers EXECUTION to the sherloAtRoot branch so
  // user's .rnstorybook side-effects do not fire at module load time.
  var entryLoaderLine = configPath !== null
    ? 'exports.__sherloStorybookEntry = function () { return require(' + JSON.stringify(configPath + '/index') + '); };\n'
    : 'exports.__sherloStorybookEntry = null;\n';

  var content =
    "'use strict';\n" +
    '\n' +
    'var SHERLO_STORYBOOK_CONFIG_PATH = ' + JSON.stringify(configPath) + ';\n' +
    'exports.__sherloStorybookConfigPath = SHERLO_STORYBOOK_CONFIG_PATH;\n' +
    entryLoaderLine +
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
    '  // in that case real.start is not a function.\n' +
    "  if (typeof real.start !== 'function') {\n" +
    '    try {\n' +
    "      var sherloInternal = require('@sherlo/react-native-storybook/dist/SherloModule');\n" +
    "      var SherloModule = sherloInternal && sherloInternal.default ? sherloInternal.default : sherloInternal;\n" +
    "      if (SherloModule && typeof SherloModule.getMode === 'function' && SherloModule.getMode() === 'testing') {\n" +
    "        SherloModule.sendNativeError(\n" +
    "          'ERROR_STORYBOOK_DISABLED',\n" +
    "          'Storybook is disabled in metro.config.js. withStorybook has enabled set to false. Set enabled: true for Sherlo testing builds.',\n" +
    "          ''\n" +
    '        );\n' +
    '      }\n' +
    '    } catch (e) {}\n' +
    '    return {};\n' +
    '  }\n' +
    '\n' +
    '  // Lazy-require sherlo AFTER the re-exports above are already set up.\n' +
    '  // This breaks the circular dependency that would otherwise cause\n' +
    '  // isStorybook7 to be detected incorrectly (see comment above).\n' +
    "  var sherlo = require('@sherlo/react-native-storybook');\n" +
    "  var getStorybookMod = require('@sherlo/react-native-storybook/dist/getStorybook');\n" +
    "  var getStorybook = getStorybookMod && getStorybookMod.default ? getStorybookMod.default : getStorybookMod;\n" +
    '\n' +
    '  var view = real.start(config);\n' +
    '\n' +
    '  try {\n' +
    '    sherlo.addStorybookToDevMenu();\n' +
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
