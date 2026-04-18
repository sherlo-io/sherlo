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
 *  2. Requires @sherlo/react-native-storybook (for addStorybookToDevMenu + getStorybook)
 *  3. Re-exports all keys from the real module
 *  4. Overrides the `start` export with a patched version that wraps view.getStorybookUI
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
    "var sherlo = require('@sherlo/react-native-storybook');\n" +
    '\n' +
    '// Re-export everything from the real module\n' +
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
    '    return sherlo.getStorybook(view, params);\n' +
    '  };\n' +
    '\n' +
    '  // Signal that Storybook has loaded and is ready\n' +
    '  try {\n' +
    "    var sherloInternal = require('@sherlo/react-native-storybook/dist/SherloModule');\n" +
    "    var SherloModule = sherloInternal && sherloInternal.default ? sherloInternal.default : sherloInternal;\n" +
    "    if (SherloModule && typeof SherloModule.getMode === 'function' && SherloModule.getMode() === 'testing') {\n" +
    "      SherloModule.appendFile('protocol.sherlo', JSON.stringify({ action: 'STORYBOOK_LOADED', timestamp: Date.now(), entity: 'app' }) + '\\n');\n" +
    '    }\n' +
    '  } catch (e) {}\n' +
    '\n' +
    '  return view;\n' +
    '};\n';

  fs.writeFileSync(wrapperPath, content, 'utf8');
}

module.exports = { withSherlo: withSherlo };
module.exports.withSherlo = withSherlo;
module.exports.default = withSherlo;
