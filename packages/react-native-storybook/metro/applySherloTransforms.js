'use strict';

var fs = require('fs');
var path = require('path');

/**
 * Applies Sherlo Metro transforms to an already-configured Metro config object.
 *
 * Takes the result of withStorybook() + opts and returns the Sherlo-augmented config.
 * Installs the resolver redirect, polyfill injection, and storybook-wrapper.js generation.
 *
 * When opts.enabled === false, a disabled-notifier.js polyfill is generated and
 * injected. It fires SherloModule.sendNativeError(ERROR_STORYBOOK_DISABLED) at app
 * boot before any module factories, which works for both Storybook v9 and v10.
 * In Storybook v10, withStorybook({ enabled: false }) stubs .rnstorybook/index.tsx
 * so @storybook/react-native is never imported - making the wrapper-based runtime
 * detection dead code. The polyfill approach bypasses this.
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
  var sherloPolyfills = [polyfillPath];

  // When Storybook is explicitly disabled, inject a polyfill that fires
  // ERROR_STORYBOOK_DISABLED at app boot via the native module, before any module
  // factories run. Guard is strictly === false so default-undefined is unchanged.
  if (opts && opts.enabled === false) {
    var notifierPath = path.join(
      projectRoot,
      'node_modules',
      '.cache',
      'sherlo',
      'disabled-notifier.js'
    );
    generateDisabledNotifier(notifierPath);
    sherloPolyfills = sherloPolyfills.concat([notifierPath]);
  }

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
    '  // ERROR_STORYBOOK_DISABLED is reported by the disabled-notifier polyfill\n' +
    '  // at app boot (before module factories), so no sendNativeError call here.\n' +
    "  if (typeof real.start !== 'function') {\n" +
    '    return {};\n' +
    '  }\n' +
    '\n' +
    '  // Lazy-require sherlo AFTER the re-exports above are already set up.\n' +
    '  // This breaks the circular dependency that would otherwise cause\n' +
    '  // isStorybook7 to be detected incorrectly (see comment above).\n' +
    "  var getStorybook = require('@sherlo/react-native-storybook/dist/getStorybook').default;\n" +
    "  var addStorybookToDevMenu = require('@sherlo/react-native-storybook/dist/addStorybookToDevMenu').default;\n" +
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

/**
 * Generates the disabled-notifier.js polyfill.
 *
 * Fires SherloModule.sendNativeError(ERROR_STORYBOOK_DISABLED) at app boot,
 * before any module factories. No JS-side mode gate - native side gates
 * production via SherloModuleCore early-return, same pattern as metro/polyfill.js.
 *
 * @param {string} notifierPath - Absolute path to write the file to
 */
function generateDisabledNotifier(notifierPath) {
  var cacheDir = path.dirname(notifierPath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  var content =
    "'use strict';\n" +
    '(function () {\n' +
    '  try {\n' +
    "    var nm = (global.__turboModuleProxy && global.__turboModuleProxy('SherloModule')) ||\n" +
    '             (global.nativeModuleProxy && global.nativeModuleProxy.SherloModule);\n' +
    "    if (nm && typeof nm.sendNativeError === 'function') {\n" +
    '      nm.sendNativeError(\n' +
    "        'ERROR_STORYBOOK_DISABLED',\n" +
    "        'Storybook is disabled in metro.config.js. Set enabled: true for Sherlo testing builds.',\n" +
    "        ''\n" +
    '      );\n' +
    '    }\n' +
    '  } catch (e) {}\n' +
    '})();\n';

  fs.writeFileSync(notifierPath, content, 'utf8');
}

module.exports = applySherloTransforms;
module.exports.applySherloTransforms = applySherloTransforms;
module.exports.generateWrapper = generateWrapper;
module.exports.generateDisabledNotifier = generateDisabledNotifier;
