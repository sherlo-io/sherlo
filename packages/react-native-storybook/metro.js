'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Factory that creates a Sherlo-enhanced Metro config wrapper with the same signature
 * as the provided withStorybook function.
 *
 * Intercepts imports of `@storybook/react-native` at the Metro resolver level and
 * redirects them to a generated wrapper. The wrapper re-exports everything from the
 * real package, bakes in SHERLO_STORYBOOK_CONFIG_PATH for the sherloAtRoot diagnostic,
 * and patches `start()` to:
 *  - Call `addStorybookToDevMenu()` once
 *  - Wrap `view.getStorybookUI` to route through `getStorybook(view, params)`
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('@react-native/metro-config');
 * const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
 * const { createSherloStorybook } = require('@sherlo/react-native-storybook/metro');
 *
 * const withSherloStorybook = createSherloStorybook(withStorybook);
 *
 * const defaultConfig = getDefaultConfig(__dirname);
 * module.exports = withSherloStorybook(defaultConfig, { enabled: true, configPath: __dirname + '/.rnstorybook' });
 *
 * @param {Function} withStorybook - The withStorybook function from @storybook/react-native
 * @returns {Function} A function with the same signature as withStorybook
 */
function createSherloStorybook(withStorybook) {
  return function withSherloStorybook(config, opts) {
    // Call withStorybook first to get the base config.
    var result = withStorybook(config, opts);

    // When enabled: false, return the withStorybook result unchanged (complete passthrough).
    // No Sherlo resolver override, no polyfill injection, no wrapper generation.
    if (opts && opts.enabled === false) {
      return result;
    }

    var projectRoot =
      (result && result.projectRoot) || (config && config.projectRoot) || process.cwd();

    // Resolve configPath to an absolute path so the SDK can require() it at runtime.
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
      result.resolver && result.resolver.resolveRequest
        ? result.resolver.resolveRequest
        : null;

    function resolveRequest(context, moduleName, platform) {
      // Self-bypass: let the wrapper itself import the real @storybook/react-native
      if (context.originModulePath === wrapperPath) {
        return existingResolveRequest
          ? existingResolveRequest(context, moduleName, platform)
          : context.resolveRequest(context, moduleName, platform);
      }

      // Intercept @storybook/react-native and redirect to wrapper
      if (moduleName === '@storybook/react-native') {
        return { type: 'sourceFile', filePath: wrapperPath };
      }

      return existingResolveRequest
        ? existingResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
    }

    // The polyfill is added to every bundle built with createSherloStorybook(). It is INERT
    // in production: the first line of the IIFE gates on
    // globalThis.__sherloRuntimeMode_v1 === 'testing' (set by the JSI binding
    // before bundle eval). See metro/polyfill.js for the detailed safety analysis.
    var polyfillPath = path.join(__dirname, 'metro', 'polyfill.js');

    var existingGetPolyfills =
      result.serializer && typeof result.serializer.getPolyfills === 'function'
        ? result.serializer.getPolyfills
        : null;

    function getPolyfills(ctx) {
      var base = existingGetPolyfills ? existingGetPolyfills(ctx) : [];
      return base.concat([polyfillPath]);
    }

    return Object.assign({}, result, {
      resolver: Object.assign({}, result.resolver, {
        resolveRequest: resolveRequest,
      }),
      serializer: Object.assign({}, result.serializer, {
        getPolyfills: getPolyfills,
      }),
    });
  };
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

  // Build the static entry require line (only when configPath is known).
  // JSON.stringify produces a string literal that Metro resolves at bundle time,
  // unlike a runtime-computed path which Metro cannot statically analyze.
  var entryRequireLine = configPath !== null
    ? 'exports.__sherloStorybookEntry = require(' + JSON.stringify(configPath + '/index') + ');\n'
    : 'exports.__sherloStorybookEntry = null;\n';

  var content =
    "'use strict';\n" +
    '\n' +
    'var SHERLO_STORYBOOK_CONFIG_PATH = ' + JSON.stringify(configPath) + ';\n' +
    'exports.__sherloStorybookConfigPath = SHERLO_STORYBOOK_CONFIG_PATH;\n' +
    entryRequireLine +
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
    "    console.error('[createSherloStorybook] addStorybookToDevMenu failed:', e);\n" +
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

module.exports = { createSherloStorybook: createSherloStorybook };
module.exports.createSherloStorybook = createSherloStorybook;
module.exports.default = createSherloStorybook;
