'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Wraps a Metro config to automatically integrate Sherlo into your React Native app.
 *
 * Intercepts imports of `@storybook/react-native` at the Metro resolver level and
 * redirects them to a generated wrapper. The wrapper re-exports everything from the
 * real package but patches `start()` to:
 *  - Call `addStorybookToDevMenu()` once
 *  - Wrap `view.getStorybookUI` to route through `getStorybook(view, params)`
 *
 * No changes to App.tsx or .rnstorybook/index.ts are required.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('@react-native/metro-config');
 * const { withStorybook } = require('@storybook/react-native/metro/withStorybook');
 * const { withSherlo } = require('@sherlo/react-native-storybook/metro');
 *
 * const config = getDefaultConfig(__dirname);
 * module.exports = withSherlo(withStorybook(config));
 *
 * @param {Record<string, any>} config - Metro config object
 * @returns {Record<string, any>}
 */
function withSherlo(config) {
  var projectRoot = config.projectRoot || process.cwd();
  var wrapperPath = path.join(
    projectRoot,
    'node_modules',
    '.cache',
    'sherlo',
    'storybook-wrapper.js'
  );

  generateWrapper(wrapperPath);

  var existingResolveRequest =
    config.resolver && config.resolver.resolveRequest
      ? config.resolver.resolveRequest
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

  return Object.assign({}, config, {
    resolver: Object.assign({}, config.resolver, {
      resolveRequest: resolveRequest,
    }),
  });
}

/**
 * Generates the storybook-wrapper.js file.
 *
 * The wrapper:
 *  1. Requires the real @storybook/react-native (self-bypass lets this through)
 *  2. Re-exports all keys from the real module (so isStorybook7 detection sees
 *     updateView and correctly returns false for Storybook 8+)
 *  3. Overrides the `start` export with a patched version that lazily requires
 *     @sherlo/react-native-storybook and wraps view.getStorybookUI
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
    '// Patched start(): wraps view.getStorybookUI to route through sherlo.getStorybook\n' +
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
    '\n' +
    '  var view = real.start(config);\n' +
    '\n' +
    '  try {\n' +
    '    sherlo.addStorybookToDevMenu();\n' +
    '  } catch (e) {\n' +
    "    console.error('[withSherlo] addStorybookToDevMenu failed:', e);\n" +
    '  }\n' +
    '\n' +
    '  view.__sherloOriginalGetStorybookUI = view.getStorybookUI.bind(view);\n' +
    '  view.getStorybookUI = function (params) {\n' +
    '    // Pass {} when params is undefined so Storybook always receives an object\n' +
    '    // and applies its own defaults (theme, etc.) rather than propagating\n' +
    '    // undefined into getStorybookUI which can strip those defaults.\n' +
    '    return sherlo.getStorybook(view, params != null ? params : {});\n' +
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

module.exports = { withSherlo: withSherlo };
module.exports.withSherlo = withSherlo;
module.exports.default = withSherlo;
