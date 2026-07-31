'use strict';

var fs = require('fs');
var path = require('path');

// ---------------------------------------------------------------------------
// Dependency graph sidecar (TurboSnap Phase 2)
// ---------------------------------------------------------------------------

/**
 * Converts an absolute Metro module path to a project-root-relative path
 * (e.g. "./src/Button.tsx").  Returns null for:
 *   - synthetic/virtual paths (Metro require.context modules contain "?")
 *   - paths outside the project root
 */
function toRelativePath(absPath, projectRoot) {
  if (!absPath || absPath.indexOf('?') !== -1 || absPath.indexOf('\0') !== -1) {
    return null;
  }
  var rel = path.relative(projectRoot, absPath);
  if (rel.indexOf('..') === 0) return null; // outside project root
  return './' + rel.split(path.sep).join('/');
}

/**
 * Emits a NON-DESTRUCTIVE graph sidecar to node_modules/.cache/sherlo/graph.json.
 *
 * Format:
 *   {
 *     "version": 1,
 *     "inverseGraph": { "./src/Button.tsx": ["./src/Button.stories.tsx"] },
 *     "contextGraph":  { "./src/.rnstorybook/storybook.requires.ts": ["./src/Button.stories.tsx"] }
 *   }
 *
 * inverseGraph  – static (non-dynamic) reverse edges only: file → files that statically import it.
 * contextGraph  – require.context targets grouped by the module that owns the require.context call.
 *
 * Bail-open: any unrecognised Metro Graph shape or error → no sidecar (CLI forces full run).
 *
 * @param {object} graph      Metro ReadOnlyGraph passed to the customSerializer
 * @param {string} projectRoot absolute project root
 * @param {string} cacheDir   absolute cache directory (node_modules/.cache/sherlo)
 */
function emitDependencyGraphSidecar(graph, projectRoot, cacheDir) {
  try {
    // Feature-detect Metro Graph shape: bail-open if unrecognised.
    if (
      !graph ||
      typeof graph !== 'object' ||
      !(graph.dependencies instanceof Map)
    ) {
      return;
    }

    /** @type {Record<string, string[]>} */
    var inverseGraph = {};
    /** @type {Record<string, string[]>} */
    var contextGraph = {};

    graph.dependencies.forEach(function (module, absPath) {
      var rel = toRelativePath(absPath, projectRoot);
      if (!rel) return; // skip synthetic modules

      // Ensure every real module appears as a key (even if it has no importers).
      if (!inverseGraph[rel]) inverseGraph[rel] = [];

      if (!module.dependencies || !(module.dependencies instanceof Map)) return;

      module.dependencies.forEach(function (dep) {
        // contextParams is set on require.context() edges.
        var contextParams =
          dep.data && dep.data.data && dep.data.data.contextParams;

        if (contextParams) {
          // This dependency is a synthetic context module.
          // Resolve one level deeper to find the actual target files.
          var ctxModule = graph.dependencies.get(dep.absolutePath);
          if (ctxModule && ctxModule.dependencies instanceof Map) {
            if (!contextGraph[rel]) contextGraph[rel] = [];
            ctxModule.dependencies.forEach(function (ctxDep) {
              var targetRel = toRelativePath(ctxDep.absolutePath, projectRoot);
              if (targetRel) contextGraph[rel].push(targetRel);
            });
          }
        } else {
          // Static (or async) import → record as a reverse edge.
          var depRel = toRelativePath(dep.absolutePath, projectRoot);
          if (!depRel) return;
          if (!inverseGraph[depRel]) inverseGraph[depRel] = [];
          inverseGraph[depRel].push(rel);
        }
      });
    });

    var sidecar = JSON.stringify({ version: 1, inverseGraph: inverseGraph, contextGraph: contextGraph });
    fs.writeFileSync(path.join(cacheDir, 'graph.json'), sidecar, 'utf8');
  } catch (err) {
    // Non-fatal: if we fail, no sidecar is emitted and the CLI bails to a full run.
    console.warn('[Sherlo] Failed to emit dependency graph sidecar:', err && err.message);
  }
}

/**
 * Returns Metro's built-in default serializer (baseJSBundle + bundleToString).
 * Used when there is no pre-existing customSerializer to delegate to.
 * Returns null if Metro internals cannot be resolved (non-fatal, just skip wrapping).
 */
function getMetroDefaultSerializer() {
  try {
    var baseJSBundle = require('metro/src/DeltaBundler/Serializers/baseJSBundle').default
      || require('metro/src/DeltaBundler/Serializers/baseJSBundle');
    var bundleToString = require('metro/src/lib/bundleToString').default
      || require('metro/src/lib/bundleToString');
    return function defaultSerializer(entryPoint, preModules, graph, options) {
      return bundleToString(baseJSBundle(entryPoint, preModules, graph, options)).code;
    };
  } catch (_) {
    return null;
  }
}

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
  fs.writeFileSync(
    flagPath,
    "'use strict';\n" +
    "global.__sherloWithStorybookApplied = true;\n" +
    "global.__sherloStorybookDisabledFlag = true;\n",
    'utf8'
  );
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

  var polyfillPath = path.join(__dirname, 'polyfill.js');
  var sherloPolyfills = (opts && opts.enabled === false)
    ? [writeDisabledFlagPolyfill(cacheDir)]   // minimal only
    : [polyfillPath];                          // full polyfill for enabled: true

  var existingGetPolyfills =
    result && result.serializer && typeof result.serializer.getPolyfills === 'function'
      ? result.serializer.getPolyfills
      : null;

  function getPolyfills(ctx) {
    var base = existingGetPolyfills ? existingGetPolyfills(ctx) : [];
    return base.concat(sherloPolyfills);
  }

  // ---- TurboSnap Phase 2: non-destructive dependency graph sidecar ----
  // Wrap (or install) a customSerializer that side-effects a graph.json sidecar
  // and then delegates to the original serializer unchanged.
  var existingCustomSerializer =
    result && result.serializer && typeof result.serializer.customSerializer === 'function'
      ? result.serializer.customSerializer
      : null;

  // Only install the serializer wrapper when we can safely delegate to something.
  // If there is no pre-existing serializer we try to load Metro's default; if that
  // also fails we skip the wrapper rather than risk corrupting the bundle.
  var delegateSerializer = existingCustomSerializer || getMetroDefaultSerializer();

  var sherloCustomSerializer = null;
  if (delegateSerializer) {
    sherloCustomSerializer = function sherloSerializer(entryPoint, preModules, graph, options) {
      // Emit the sidecar as a pure side-effect; never affects bundle output.
      var serializerProjectRoot =
        (options && options.projectRoot) || projectRoot;
      emitDependencyGraphSidecar(graph, serializerProjectRoot, cacheDir);
      // Delegate to the original serializer and return its output unchanged.
      return delegateSerializer(entryPoint, preModules, graph, options);
    };
  }

  var baseResult = result || {};

  var serializer = Object.assign({}, baseResult.serializer, {
    getPolyfills: getPolyfills,
  });
  if (sherloCustomSerializer) {
    serializer.customSerializer = sherloCustomSerializer;
  }

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
    serializer: serializer,
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
