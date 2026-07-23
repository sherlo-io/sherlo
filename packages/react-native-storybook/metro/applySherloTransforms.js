'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var mockShims = require('./mockShims');

// ---------------------------------------------------------------------------
// Dependency graph sidecar (Diff Scope Phase 2)
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
  // The leading "./" is INTENTIONAL and load-bearing - do not strip it to match
  // sherlo-api's DiffScope.md "Serialized shape" doc, which shows bare paths
  // (e.g. "src/Button.tsx"). That doc describes the server's canonicalized
  // form, not what the SDK is supposed to emit. This helper's "./"-prefixed
  // output is part of two contracts:
  //   1. Diff Scope v1's graph.json sidecar (emitDependencyGraphSidecar below)
  //      - its consumers expect the "./" form as-is.
  //   2. Diff Scope v2's module manifest (moduleHashes/storyClosures keys) -
  //      the server strips the prefix at ingestion, in sherlo-api's
  //      parseModuleManifest (computeDiffScopeDecision/moduleManifest.ts),
  //      per SHERLO-1912.
  // Emitting bare paths here would break v1's sidecar consumers and, for v2,
  // mismatch every "./"-keyed ancestor manifest already stored in S3 -
  // making every module look changed and silently degrading partial capture
  // to whole-suite capture for every diff going forward.
  return './' + rel.split(path.sep).join('/');
}

/**
 * Emits a NON-DESTRUCTIVE graph sidecar to node_modules/.cache/sherlo/graph.json.
 *
 * Format:
 *   {
 *     "version": 1,
 *     "inverseGraph": { "./src/Button.tsx": ["./src/Button.stories.tsx"] },
 *     "contextGraph":  { "./src/.rnstorybook/storybook.requires.ts": ["./src/Button.stories.tsx"] },
 *     "mockedFileToKey": { "./src/api/client.ts": "./src/api/client" }
 *   }
 *
 * inverseGraph    – static (non-dynamic) reverse edges only: file → files that statically import it.
 * contextGraph    – require.context targets grouped by the module that owns the require.context call.
 * mockedFileToKey – real mocked-module file → the mock key stories declare against it (EB-07).
 *   A mocked module is imported only through its generated shim, so there is no static story→module
 *   edge in inverseGraph. This map lets the CLI attribute a changed mocked-module file to the mock
 *   key, then (via each story's declared mock keys) to the stories that mock it.
 *
 * Bail-open: any unrecognised Metro Graph shape or error → no sidecar (CLI forces full run).
 *
 * @param {object} graph      Metro ReadOnlyGraph passed to the customSerializer
 * @param {string} projectRoot absolute project root
 * @param {string} cacheDir   absolute cache directory (node_modules/.cache/sherlo)
 * @param {Map<string,string>|null} mockedPathToKey canonical real path → mock key (from setupMocks)
 */
function emitDependencyGraphSidecar(graph, projectRoot, cacheDir, mockedPathToKey) {
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
    /** @type {Record<string, string>} */
    var mockedFileToKey = {};

    graph.dependencies.forEach(function (module, absPath) {
      var rel = toRelativePath(absPath, projectRoot);
      if (!rel) return; // skip synthetic modules

      // Ensure every real module appears as a key (even if it has no importers).
      if (!inverseGraph[rel]) inverseGraph[rel] = [];

      // Diff Scope (EB-07): if this real module is mocked, record the file (with
      // whatever extension/platform variant Metro bundled) → mock key. The mocked
      // module is in the graph because its shim requires it (the shim's own
      // require is not redirected). Canonicalising collapses platform/ext so it
      // matches the identity setupMocks registered.
      if (mockedPathToKey && mockedPathToKey.size > 0) {
        var mockKey = mockedPathToKey.get(mockShims.canonicalizeModulePath(absPath));
        if (mockKey) mockedFileToKey[rel] = mockKey;
      }

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

    var sidecar = JSON.stringify({
      version: 1,
      inverseGraph: inverseGraph,
      contextGraph: contextGraph,
      mockedFileToKey: mockedFileToKey,
    });
    fs.writeFileSync(path.join(cacheDir, 'graph.json'), sidecar, 'utf8');
  } catch (err) {
    // Non-fatal: if we fail, no sidecar is emitted and the CLI bails to a full run.
    console.warn('[Sherlo] Failed to emit dependency graph sidecar:', err && err.message);
  }
}

// ---------------------------------------------------------------------------
// Module manifest sidecar (SHERLO-1890 Diff Scope v2 - Phase A SPIKE)
// ---------------------------------------------------------------------------
// Emitted ONLY when the opt-in `experimentalModuleManifest` flag is set (default
// OFF). This is a spike deliverable: it ships INERT. Nothing consumes the
// manifest; with the flag off, not one byte of this code runs inside a build.
//
// The manifest answers one empirical question: are per-module content hashes,
// keyed by SOURCE PATH, deterministic across clean rebuilds of unchanged source?
// It records:
//   1. moduleHashes  - source-path -> sha256 of the module's TRANSFORMED output.
//                      Keyed by source path (never Metro's ordinal module id,
//                      which renumbers on any import add/remove/reorder).
//   2. storyClosures - story source-path -> its transitive forward dependency
//                      set (source paths). Stories are the require.context
//                      targets the existing graph sidecar already resolves.
//   3. header        - toolchain/env fingerprint (metro version, transformer/
//                      babel config digest, env digest) so a build produced by a
//                      different toolchain/env is never mistaken for an unchanged one.
//
// Bail-open on any unrecognised Metro shape or error, exactly like
// emitDependencyGraphSidecar - never throw into a user's bundle.

/**
 * sha256 of a module's transformed output code.
 *
 * Metro puts transformed code on module.output[].data.code. We hash the code of
 * every output entry in array order (a module can have >1 output, e.g. js/module
 * + js/script). The code references dependencies through a per-module dependency
 * map by LOCAL index, not by global module id, so this hash is stable across the
 * ordinal-id renumbering that import add/remove/reorder causes elsewhere.
 *
 * @returns {string|null} hex digest, or null if the module has no hashable output.
 */
function hashModuleOutput(module) {
  if (!module || !Array.isArray(module.output)) return null;
  var hash = crypto.createHash('sha256');
  var hashedAnything = false;
  module.output.forEach(function (out) {
    var code = out && out.data && out.data.code;
    if (typeof code === 'string') {
      hash.update(code);
      hashedAnything = true;
    }
  });
  return hashedAnything ? hash.digest('hex') : null;
}

/**
 * Cross-machine determinism guard (SHERLO-1894). Returns true when a module's
 * TRANSFORMED output inlines the absolute project root - the one path fragment that
 * necessarily differs machine-to-machine, so its presence means the module's content
 * hash is NOT portable across machines. Scans the exact same bytes hashModuleOutput
 * hashes (module.output[].data.code), so a leak found here is a leak in the hash.
 * Pure read: never mutates output, never influences the hash.
 *
 * @returns {boolean} true if any output entry's code contains the absolute projectRoot.
 */
function moduleOutputLeaksAbsolutePath(module, projectRoot) {
  if (!module || !Array.isArray(module.output) || !projectRoot) return false;
  for (var i = 0; i < module.output.length; i++) {
    var out = module.output[i];
    var code = out && out.data && out.data.code;
    if (typeof code === 'string' && code.indexOf(projectRoot) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Collects the absolute paths of every story module: the targets of every
 * require.context() edge in the graph. Mirrors how emitDependencyGraphSidecar
 * resolves contextGraph - a require.context dependency is a synthetic module
 * whose own dependencies are the matched files.
 *
 * @returns {string[]} unique story absolute paths.
 */
function collectStoryAbsPaths(graph) {
  var seen = {};
  var stories = [];
  graph.dependencies.forEach(function (module) {
    if (!module.dependencies || !(module.dependencies instanceof Map)) return;
    module.dependencies.forEach(function (dep) {
      var contextParams = dep.data && dep.data.data && dep.data.data.contextParams;
      if (!contextParams) return;
      var ctxModule = graph.dependencies.get(dep.absolutePath);
      if (!ctxModule || !(ctxModule.dependencies instanceof Map)) return;
      ctxModule.dependencies.forEach(function (ctxDep) {
        if (ctxDep.absolutePath && !seen[ctxDep.absolutePath]) {
          seen[ctxDep.absolutePath] = true;
          stories.push(ctxDep.absolutePath);
        }
      });
    });
  });
  return stories;
}

/**
 * Transitive forward dependency closure of one story, as a sorted list of
 * repo-relative source paths (the story itself is NOT included).
 *
 * Follows every dependency edge - static, async (dynamic import) and
 * require.context. A require.context edge points at a synthetic module; we
 * descend THROUGH it (recording its matched targets, not the synthetic path
 * itself), so files reached only via require.context still land in the closure.
 * Paths outside the project root (toRelativePath -> null) are skipped as keys but
 * still traversed, so a source file reached only through a node_modules hop is
 * not lost.
 */
function collectForwardClosure(graph, storyAbsPath, projectRoot) {
  var closure = {};
  var visited = {};
  var stack = [storyAbsPath];
  while (stack.length) {
    var absPath = stack.pop();
    if (visited[absPath]) continue;
    visited[absPath] = true;
    var module = graph.dependencies.get(absPath);
    if (!module || !(module.dependencies instanceof Map)) continue;
    module.dependencies.forEach(function (dep) {
      var depAbs = dep.absolutePath;
      if (!depAbs) return;
      var contextParams = dep.data && dep.data.data && dep.data.data.contextParams;
      // A require.context edge resolves to a synthetic module: don't record its
      // path, just traverse into it so its matched targets get recorded.
      if (!contextParams) {
        var rel = toRelativePath(depAbs, projectRoot);
        if (rel) closure[rel] = true;
      }
      if (!visited[depAbs]) stack.push(depAbs);
    });
  }
  return Object.keys(closure).sort();
}

/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth, so
 * two runs that produce equal data produce BYTE-IDENTICAL output regardless of
 * the order Metro happened to enumerate its graph. Arrays keep their order (the
 * caller sorts the arrays it cares about).
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  var keys = Object.keys(value).sort();
  var parts = keys.map(function (key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  });
  return '{' + parts.join(',') + '}';
}

/**
 * The env vars whose values can inline into a bundle, so a change to any of them
 * is a legitimate reason for otherwise-unchanged source to produce a different
 * bundle. Populated from Phase A spike question 4 (measured empirically, not read
 * from docs): NODE_ENV / BABEL_ENV drive dead-code branches (`__DEV__`,
 * `process.env.NODE_ENV === 'production'`); EXPO_PUBLIC_* are string-inlined by
 * babel-preset-expo. The header records BOTH the digest and the sorted key list,
 * so the manifest is self-describing about which vars were considered.
 */
function selectBundleInliningEnv() {
  var picked = {};
  Object.keys(process.env).forEach(function (name) {
    if (
      name === 'NODE_ENV' ||
      name === 'BABEL_ENV' ||
      name.indexOf('EXPO_PUBLIC_') === 0
    ) {
      picked[name] = process.env[name];
    }
  });
  return picked;
}

/**
 * Builds the toolchain/env header. Every input is stable across rebuilds on the
 * same machine with the same toolchain and env, and changes exactly when the
 * thing it fingerprints changes - never on wall-clock or run identity.
 */
function buildManifestHeader(projectRoot) {
  var metroVersion = null;
  try {
    metroVersion = require('metro/package.json').version || null;
  } catch (_) {
    metroVersion = null;
  }

  // Transformer/babel config digest: hash the project's babel config source. This
  // is the config that actually shapes every module's transformed output.
  var babelConfigDigest = null;
  var babelCandidates = ['babel.config.js', 'babel.config.cjs', '.babelrc', '.babelrc.js'];
  for (var i = 0; i < babelCandidates.length; i++) {
    var candidate = path.join(projectRoot, babelCandidates[i]);
    if (fs.existsSync(candidate)) {
      babelConfigDigest = crypto
        .createHash('sha256')
        .update(fs.readFileSync(candidate, 'utf8'))
        .digest('hex');
      break;
    }
  }

  var env = selectBundleInliningEnv();
  var envKeys = Object.keys(env).sort();
  var envDigest = crypto
    .createHash('sha256')
    .update(stableStringify(env))
    .digest('hex');

  return {
    metroVersion: metroVersion,
    babelConfigDigest: babelConfigDigest,
    envDigest: envDigest,
    envKeys: envKeys,
  };
}

/**
 * Emits the module manifest sidecar to node_modules/.cache/sherlo/module-manifest.json.
 *
 * Written to a SEPARATE file from graph.json so the existing sidecar's bytes are
 * untouched. Pure side-effect: never influences bundle output.
 *
 * Bail-open: any unrecognised Metro Graph shape or error -> no manifest.
 *
 * @param {object} graph      Metro ReadOnlyGraph passed to the customSerializer
 * @param {string} projectRoot absolute project root
 * @param {string} cacheDir   absolute cache directory (node_modules/.cache/sherlo)
 */
function emitModuleManifestSidecar(graph, projectRoot, cacheDir) {
  try {
    if (!graph || typeof graph !== 'object' || !(graph.dependencies instanceof Map)) {
      return;
    }

    /** @type {Record<string, string>} */
    var moduleHashes = {};
    /** @type {string[]} source-path keys whose transformed output leaks an abs path. */
    var absolutePathLeaks = [];
    graph.dependencies.forEach(function (module, absPath) {
      var rel = toRelativePath(absPath, projectRoot);
      if (!rel) return; // skip synthetic/out-of-root modules
      var digest = hashModuleOutput(module);
      if (digest) moduleHashes[rel] = digest;
      if (moduleOutputLeaksAbsolutePath(module, projectRoot)) {
        absolutePathLeaks.push(rel);
      }
    });
    absolutePathLeaks.sort();

    /** @type {Record<string, string[]>} */
    var storyClosures = {};
    collectStoryAbsPaths(graph).forEach(function (storyAbsPath) {
      var storyRel = toRelativePath(storyAbsPath, projectRoot);
      if (!storyRel) return;
      storyClosures[storyRel] = collectForwardClosure(graph, storyAbsPath, projectRoot);
    });

    var header = buildManifestHeader(projectRoot);
    // Cross-machine determinism guard (SHERLO-1894): FLAG (never fail) modules whose
    // transformed output inlines the absolute project root - their hashes are not
    // portable across machines. Recorded in the header so the manifest is
    // self-describing; a non-empty list means the hashes are machine-local. Bail-open
    // is preserved: we warn and still emit, never throw.
    header.absolutePathLeaks = absolutePathLeaks;
    if (absolutePathLeaks.length > 0) {
      console.warn(
        '[Sherlo] Module manifest: ' +
          absolutePathLeaks.length +
          ' module(s) inline an absolute path into transformed output; their hashes ' +
          'are not cross-machine portable: ' +
          absolutePathLeaks.join(', ')
      );
    }

    var manifest = {
      version: 1,
      header: header,
      moduleHashes: moduleHashes,
      storyClosures: storyClosures,
    };

    fs.writeFileSync(
      path.join(cacheDir, 'module-manifest.json'),
      stableStringify(manifest),
      'utf8'
    );
  } catch (err) {
    // Non-fatal: if we fail, no manifest is emitted. Never throw into the bundle.
    console.warn('[Sherlo] Failed to emit module manifest sidecar:', err && err.message);
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

  // ---- Module Mocking (SHERLO-1734 Phase 2) ----
  // Gated entirely behind the opt-in `experimentalMocks` flag (SHERLO-1764):
  // default OFF, so a normal store release ships zero mocking artifacts. When the
  // flag is absent or false we scan nothing, emit no shims, and install no
  // resolver branch, and the `./mocking` runtime stays unreachable from the bundle.
  // This is INDEPENDENT of `opts.enabled`, which gates the storybook-disabled
  // polyfill path below and must not influence mocking either way.
  var mockingEnabled = !!(opts && opts.experimentalMocks);
  var mocksDir = null;
  var mockedPathToShim = null;
  var mockedPathToKey = null;
  if (mockingEnabled) {
    var mockSetup = mockShims.setupMocks({
      projectRoot: projectRoot,
      cacheDir: cacheDir,
      mockModules: opts && opts.mockModules,
    });
    mocksDir = mockSetup.mocksDir;
    mockedPathToShim = mockSetup.mockedPathToShim;
    mockedPathToKey = mockSetup.mockedPathToKey;
  }

  // True when a module path lives inside the emitted mocks directory. Requests
  // originating from a shim must NEVER be redirected back into a shim, otherwise
  // the shim's own require(real) would loop onto itself.
  function isShimPath(absPath) {
    return !!absPath && !!mocksDir && absPath.indexOf(mocksDir + path.sep) === 0;
  }

  var existingResolveRequest =
    result && result.resolver && result.resolver.resolveRequest
      ? result.resolver.resolveRequest
      : null;

  function delegateResolve(context, moduleName, platform) {
    return existingResolveRequest
      ? existingResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  }

  function resolveRequest(context, moduleName, platform) {
    if (context.originModulePath === wrapperPath) {
      return delegateResolve(context, moduleName, platform);
    }

    if (moduleName === '@storybook/react-native') {
      return { type: 'sourceFile', filePath: wrapperPath };
    }

    var resolution = delegateResolve(context, moduleName, platform);

    // Delegate-first mock redirect: once the real request has resolved, redirect
    // to the shim when the resolved absolute path belongs to a mocked module and
    // the importer is not itself a shim (MK-01..04, MK-08).
    if (
      mockingEnabled &&
      mockedPathToShim &&
      mockedPathToShim.size > 0 &&
      resolution &&
      resolution.type === 'sourceFile' &&
      resolution.filePath &&
      !isShimPath(context.originModulePath)
    ) {
      var shimPath = mockedPathToShim.get(
        mockShims.canonicalizeModulePath(resolution.filePath)
      );
      if (shimPath && shimPath !== resolution.filePath) {
        return { type: 'sourceFile', filePath: shimPath };
      }
    }

    return resolution;
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

  // ---- Diff Scope Phase 2: non-destructive dependency graph sidecar ----
  // Wrap (or install) a customSerializer that side-effects a graph.json sidecar
  // and then delegates to the original serializer unchanged.
  var existingCustomSerializer =
    result && result.serializer && typeof result.serializer.customSerializer === 'function'
      ? result.serializer.customSerializer
      : null;

  // ---- Module manifest sidecar (SHERLO-1890 Phase A / SHERLO-1894 Phase B) ----
  // Gated behind the opt-in `experimentalModuleManifest` flag: default OFF,
  // mirroring how `experimentalMocks` is gated above. With the flag off the
  // serializer's behaviour is byte-for-byte identical to today - only graph.json
  // is emitted - and none of the manifest code runs. INDEPENDENT of opts.enabled.
  //
  // Phase B (SHERLO-1894): the CLI test:bundled path turns the manifest ON for that
  // path ONLY by setting SHERLO_EXPERIMENTAL_MODULE_MANIFEST=1 in the bundler
  // subprocess env it spawns. That env var is scoped to that one child process, so
  // the opt stays default-OFF for every normal build / every other user.
  var moduleManifestEnabled =
    !!(opts && opts.experimentalModuleManifest) ||
    process.env.SHERLO_EXPERIMENTAL_MODULE_MANIFEST === '1';

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
      emitDependencyGraphSidecar(graph, serializerProjectRoot, cacheDir, mockedPathToKey);
      if (moduleManifestEnabled) {
        emitModuleManifestSidecar(graph, serializerProjectRoot, cacheDir);
      }
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
// Exported for SHERLO-1890 spike unit tests (module manifest sidecar).
module.exports.emitModuleManifestSidecar = emitModuleManifestSidecar;
module.exports.stableStringify = stableStringify;
