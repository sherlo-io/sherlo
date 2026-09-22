'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var mockShims = require('./mockShims');
var createOpenStoryLetterbox = require('./openStoryLetterbox');
var createCaptureSocket = require('./captureSocket');
var storyTitleReader = require('./storyTitleReader');

// ---------------------------------------------------------------------------
// Module path helper (shared by the Diff Scope module manifest)
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
  // output feeds the Diff Scope module manifest (the moduleHashes/storyClosures
  // keys emitted by emitModuleManifestSidecar below). The server strips the
  // prefix at ingestion, in sherlo-api's parseModuleManifest
  // (computeDiffScopeDecision/moduleManifest.ts), per SHERLO-1912. Emitting bare
  // paths here would mismatch every "./"-keyed ancestor manifest already stored
  // in S3 - making every module look changed and silently degrading partial
  // capture to whole-suite capture for every diff going forward.
  return './' + rel.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Module manifest sidecar (SHERLO-1890 Diff Scope - Phase A)
// ---------------------------------------------------------------------------
// Emitted on the test:bundled bundling path only: the CLI sets
// SHERLO_MODULE_MANIFEST=1 in the bundler subprocess it spawns (see the
// serializer below), and off that path the env var is unset so not one byte of
// this code runs inside a build.
//
// The manifest answers one empirical question: are per-module content hashes,
// keyed by SOURCE PATH, deterministic across clean rebuilds of unchanged source?
// It records:
//   1. moduleHashes  - source-path -> sha256 of the module's TRANSFORMED output.
//                      Keyed by source path (never Metro's ordinal module id,
//                      which renumbers on any import add/remove/reorder).
//   2. storyClosures - story source-path -> its transitive forward dependency
//                      set (source paths). Stories are the require.context
//                      targets collectStories resolves below. Unioned into
//                      EVERY story's set: the preview module (collectPreviewAbsPaths)
//                      and its own transitive closure - Storybook applies the
//                      preview's annotations/decorators around every story, so no
//                      story's own downward walk ever reaches it (SHERLO-3).
//   3. storyTitles   - story source-path -> the Storybook TITLE of that story
//                      file. The other two maps are keyed by path and the
//                      runner knows nothing about paths, so without this the
//                      server's include/exclude narrowing and the runner's are
//                      done in two different namespaces. A story whose title
//                      cannot be read without evaluating its source is OMITTED
//                      rather than guessed. NOT SUFFICIENT on its own to drop a
//                      story certainly - the runner matches a PER-EXPORT display
//                      name and this is per file - see the header of
//                      metro/storyTitleReader.js before narrowing by it.
//   4. header        - toolchain/env fingerprint (metro version, transformer/
//                      babel config digest, env digest) so a build produced by a
//                      different toolchain/env is never mistaken for an unchanged one,
//                      plus `generatedFiles`: the graph files a tool wrote at
//                      bundle time and the inputs it wrote them from.
//
// Bail-open on any unrecognised Metro shape or error - never throw into a user's
// bundle.

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
 * The directory a Metro require.context module gathers from, read back out of
 * its own synthetic path.
 *
 * Metro builds that path as `<directory>?ctx=<hash>` and nowhere else records
 * the directory (a dependency's `contextParams` carries the filter and mode, not
 * the directory), so this suffix is the only source for it. A path without the
 * marker is not a Metro context module and yields null, which leaves the stories
 * behind it without titles rather than with invented ones.
 */
function contextDirectoryOf(contextModuleAbsPath) {
  var marker = contextModuleAbsPath.indexOf('?ctx=');
  return marker === -1 ? null : contextModuleAbsPath.slice(0, marker);
}

/**
 * Collects the absolute paths of every story module: the targets of the
 * require.context() edge declared in Storybook's own generated requires file
 * (STORYBOOK_REQUIRES_BASENAMES, matched by basename exactly like
 * describeGeneratedFiles below). require.context is an ordinary Metro feature
 * an app is free to use for its own gathering (icons, fonts, locale files) -
 * a require.context dependency is a synthetic module whose own dependencies
 * are the matched files, and nothing in its shape distinguishes "this is a
 * story list" from "this is an icon folder". Matching only the DECLARING
 * MODULE, not the context's directory or filter regex (an app may legitimately
 * reuse either), is what tells the two apart.
 *
 * Found via the Diff Scope fixture app's StorefrontBadge component, which
 * gathers its own icons with `require.context('./badgeIcons', false, /\.ts$/)`:
 * before this guard, truck.ts and cart.ts were counted as stories neither is,
 * inflating every capture's story count by 2 and giving each icon a
 * storyClosures entry it should never have had.
 *
 * Bail-open: if no such generated file is in the graph (e.g. a machine that
 * never bundled - see describeGeneratedFiles), the result is an empty story
 * list, exactly as for an app with no require.context at all.
 *
 * Each story is returned with the two paths its TITLE is derived from: the
 * require.context directory it was gathered from, and the generated requires
 * file that declared that context (see storyTitleReader.js). Either can be null on
 * an unrecognised shape; a story then simply gets no title.
 *
 * @returns {{ absPath: string, contextDirAbsPath: string|null, requiresAbsPath: string }[]}
 *   one entry per unique story absolute path.
 */
function collectStories(graph) {
  var seen = {};
  var stories = [];
  graph.dependencies.forEach(function (module, requiresAbsPath) {
    if (STORYBOOK_REQUIRES_BASENAMES.indexOf(path.basename(requiresAbsPath)) === -1) return;
    if (!module.dependencies || !(module.dependencies instanceof Map)) return;
    module.dependencies.forEach(function (dep) {
      var contextParams = dep.data && dep.data.data && dep.data.data.contextParams;
      if (!contextParams) return;
      var ctxModule = graph.dependencies.get(dep.absolutePath);
      if (!ctxModule || !(ctxModule.dependencies instanceof Map)) return;
      var contextDirAbsPath = contextDirectoryOf(dep.absolutePath);
      ctxModule.dependencies.forEach(function (ctxDep) {
        if (ctxDep.absolutePath && !seen[ctxDep.absolutePath]) {
          seen[ctxDep.absolutePath] = true;
          stories.push({
            absPath: ctxDep.absolutePath,
            contextDirAbsPath: contextDirAbsPath,
            requiresAbsPath: requiresAbsPath,
          });
        }
      });
    });
  });
  return stories;
}

/**
 * True when a basename is a Storybook preview entry (`preview.<ext>`, e.g.
 * `.rnstorybook/preview.ts`) - same convention mockScan.js's isScanTarget uses
 * for the module-mocking scan, kept independent here since this walks the
 * Metro graph rather than the filesystem.
 */
function isPreviewBasename(basename) {
  var ext = path.extname(basename);
  return basename.slice(0, basename.length - ext.length) === 'preview';
}

/**
 * Absolute paths of every preview module: an ORDINARY (non-require.context)
 * dependency of the generated requires file whose basename matches the
 * preview convention (`require('./preview')` in storybook.requires.ts).
 *
 * The requires file sits ABOVE every story - Storybook applies its
 * `annotations` (which include the preview module) around every story it
 * renders, so no story ever imports preview.ts itself and a downward walk
 * from a story can never reach it (SHERLO-3: "a global decorator captures
 * every story"). This is the other direction: walking OUT of the requires
 * file along its ordinary edges to find the preview module that wraps
 * everything.
 *
 * @returns {string[]} unique preview absolute paths.
 */
function collectPreviewAbsPaths(graph) {
  var seen = {};
  var previews = [];
  graph.dependencies.forEach(function (module, absPath) {
    if (STORYBOOK_REQUIRES_BASENAMES.indexOf(path.basename(absPath)) === -1) return;
    if (!module.dependencies || !(module.dependencies instanceof Map)) return;
    module.dependencies.forEach(function (dep) {
      var depAbs = dep.absolutePath;
      if (!depAbs || seen[depAbs]) return;
      var contextParams = dep.data && dep.data.data && dep.data.data.contextParams;
      if (contextParams) return; // require.context edge -> stories, not the preview
      if (!isPreviewBasename(path.basename(depAbs))) return;
      seen[depAbs] = true;
      previews.push(depAbs);
    });
  });
  return previews;
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

// ---------------------------------------------------------------------------
// Generated files in the graph
// ---------------------------------------------------------------------------
//
// Storybook's requires generator rewrites `<config dir>/storybook.requires.ts`
// (or .js) on every bundle, from the config directory it sits in: main.* names
// the story globs and addons, preview.* is imported when present, and the
// generator options come from the same withStorybook call. Projects are told
// not to track the file - a tracked copy is rewritten at bundle time, which
// dirties the tree - so on a machine that never bundled it does not exist.
//
// The CLI digests every app source file in this graph to decide whether a
// prebuilt bundle still matches a tree. A generated file cannot be digested by
// its bytes on a machine that has no copy, but its INPUTS can, and equal inputs
// mean an equal output. So the manifest header names each generated file and
// the files it was generated from, and the CLI digests those instead.

var STORYBOOK_REQUIRES_BASENAMES = ['storybook.requires.ts', 'storybook.requires.js'];

/**
 * The generated files among the graph's modules, keyed like moduleHashes, each
 * with the generator that wrote it and the project-relative inputs it read.
 *
 * @returns {Record<string, { generatedBy: string, inputs: string[] }>}
 */
function describeGeneratedFiles(graph, projectRoot) {
  var generated = {};
  graph.dependencies.forEach(function (_module, absPath) {
    if (STORYBOOK_REQUIRES_BASENAMES.indexOf(path.basename(absPath)) === -1) return;
    var rel = toRelativePath(absPath, projectRoot);
    if (!rel) return;

    var inputs = [];
    try {
      fs.readdirSync(path.dirname(absPath), { withFileTypes: true }).forEach(function (entry) {
        if (!entry.isFile()) return;
        if (STORYBOOK_REQUIRES_BASENAMES.indexOf(entry.name) !== -1) return;
        var inputRel = toRelativePath(path.join(path.dirname(absPath), entry.name), projectRoot);
        if (inputRel) inputs.push(inputRel);
      });
    } catch (_) {
      // An unreadable config directory leaves the file with no inputs; the CLI
      // then digests nothing for it, exactly as if it were absent.
    }
    inputs.sort();

    generated[rel] = { generatedBy: 'storybook-requires', inputs: inputs };
  });
  return generated;
}

/**
 * Emits the module manifest sidecar to node_modules/.cache/sherlo/module-manifest.json.
 *
 * Pure side-effect: never influences bundle output.
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

    // Files that reach every story from ABOVE (the preview module and its own
    // transitive closure), unioned into every story's closure below. A story's
    // own downward walk can never find these - Storybook applies the preview
    // around the story, the story never imports it.
    /** @type {Record<string, boolean>} */
    var globalRelPaths = {};
    collectPreviewAbsPaths(graph).forEach(function (previewAbsPath) {
      var previewRel = toRelativePath(previewAbsPath, projectRoot);
      if (previewRel) globalRelPaths[previewRel] = true;
      collectForwardClosure(graph, previewAbsPath, projectRoot).forEach(function (rel) {
        globalRelPaths[rel] = true;
      });
    });

    /** @type {Record<string, string[]>} */
    var storyClosures = {};
    /**
     * @type {Record<string, string>} story source-path -> the Storybook title
     * the runner matches its snapshots by. A story is absent here when its
     * title cannot be read without evaluating its source; the server must read
     * an absent key as "unknown", never as "untitled".
     */
    var storyTitles = {};
    /** @type {Record<string, object[]>} requires-file path -> its loader entries. */
    var loaderEntriesByRequiresFile = {};

    collectStories(graph).forEach(function (story) {
      var storyRel = toRelativePath(story.absPath, projectRoot);
      if (!storyRel) return;
      var closureSet = {};
      collectForwardClosure(graph, story.absPath, projectRoot).forEach(function (rel) {
        closureSet[rel] = true;
      });
      Object.keys(globalRelPaths).forEach(function (rel) {
        closureSet[rel] = true;
      });
      storyClosures[storyRel] = Object.keys(closureSet).sort();

      if (!loaderEntriesByRequiresFile[story.requiresAbsPath]) {
        loaderEntriesByRequiresFile[story.requiresAbsPath] = storyTitleReader.readStoryLoaderEntries(
          story.requiresAbsPath
        );
      }
      var loaderEntry = storyTitleReader.findLoaderEntry(
        loaderEntriesByRequiresFile[story.requiresAbsPath],
        story.contextDirAbsPath
      );
      if (!loaderEntry) return;
      var title = storyTitleReader.readStoryTitle(story.absPath, loaderEntry);
      if (title) storyTitles[storyRel] = title;
    });

    var header = buildManifestHeader(projectRoot);
    // Cross-machine determinism guard (SHERLO-1894): FLAG (never fail) modules whose
    // transformed output inlines the absolute project root - their hashes are not
    // portable across machines. Recorded in the header so the manifest is
    // self-describing; a non-empty list means the hashes are machine-local. Bail-open
    // is preserved: we warn and still emit, never throw.
    header.absolutePathLeaks = absolutePathLeaks;
    // Files a tool wrote at bundle time, and what it wrote them from - see
    // describeGeneratedFiles. Keyed like moduleHashes.
    header.generatedFiles = describeGeneratedFiles(graph, projectRoot);
    if (absolutePathLeaks.length > 0) {
      console.warn(
        '[Sherlo] Module manifest: ' +
          absolutePathLeaks.length +
          ' module(s) inline an absolute path into transformed output; their hashes ' +
          'are not cross-machine portable: ' +
          absolutePathLeaks.join(', ')
      );
    }

    // version stays 1 across the addition of storyTitles: the map
    // is additive, and the two things a consumer must tell apart are already
    // told apart without it - a manifest with NO storyTitles key was written by
    // an SDK that predates titles, and a key missing from the map is a story
    // this SDK could not be certain about. Neither is an empty title, and
    // neither lets the server narrow that story away. Bumping would instead
    // make every manifest unreadable to the server already deployed, which is
    // exactly the window this change was ordered to land before.
    var manifest = {
      version: 1,
      header: header,
      moduleHashes: moduleHashes,
      storyClosures: storyClosures,
      storyTitles: storyTitles,
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
  if (mockingEnabled) {
    var mockSetup = mockShims.setupMocks({
      projectRoot: projectRoot,
      cacheDir: cacheDir,
      mockModules: opts && opts.mockModules,
    });
    mocksDir = mockSetup.mocksDir;
    mockedPathToShim = mockSetup.mockedPathToShim;
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

  // ---- Diff Scope module manifest sidecar ----
  // The manifest is emitted on the test:bundled bundling path ONLY: the CLI sets
  // SHERLO_MODULE_MANIFEST=1 in the bundler subprocess it spawns, scoping emission
  // to that one child process so every normal build / every other user is
  // unaffected. INDEPENDENT of opts.enabled.
  var moduleManifestEnabled = process.env.SHERLO_MODULE_MANIFEST === '1';

  // Off the bundling path the manifest is never emitted, so there is nothing for
  // the serializer wrapper to do. Skip installing it entirely - Sherlo does not
  // touch the user's result.serializer.customSerializer slot and never forces
  // Metro's default serializer to load. We only wrap (or install) a serializer
  // when moduleManifestEnabled is true and we can safely delegate to something:
  // the user's existing customSerializer if present, else Metro's default; if
  // that also fails to load we skip the wrapper rather than risk corrupting the
  // bundle (bail-open).
  var sherloCustomSerializer = null;
  if (moduleManifestEnabled) {
    var existingCustomSerializer =
      result && result.serializer && typeof result.serializer.customSerializer === 'function'
        ? result.serializer.customSerializer
        : null;
    var delegateSerializer = existingCustomSerializer || getMetroDefaultSerializer();

    if (delegateSerializer) {
      sherloCustomSerializer = function sherloSerializer(entryPoint, preModules, graph, options) {
        // Emit the manifest as a pure side-effect; never affects bundle output.
        var serializerProjectRoot =
          (options && options.projectRoot) || projectRoot;
        emitModuleManifestSidecar(graph, serializerProjectRoot, cacheDir);
        // Delegate to the original serializer and return its output unchanged.
        return delegateSerializer(entryPoint, preModules, graph, options);
      };
    }
  }

  // ---- Sherlo's addresses on the bundler ----
  // Two addresses served beside the bundle: the letterbox and the capture socket. The letterbox is
  // the road `sherlo open` and `sherlo inspect` reach a running app down (see openStoryLetterbox.js);
  // the capture socket is the road `sherlo capture` reaches it down (see captureSocket.js). Both are
  // installed unconditionally: with no Sherlo app attached an address simply has nobody to answer,
  // and a developer never has to add anything for them to be there.
  var letterbox = createOpenStoryLetterbox();
  var captureSocket = createCaptureSocket();

  var existingEnhanceMiddleware =
    result && result.server && typeof result.server.enhanceMiddleware === 'function'
      ? result.server.enhanceMiddleware
      : null;

  function enhanceMiddleware(metroMiddleware, metroServer) {
    var enhanced = existingEnhanceMiddleware
      ? existingEnhanceMiddleware(metroMiddleware, metroServer)
      : metroMiddleware;

    return function sherloMiddleware(request, response, next) {
      // Sherlo's addresses first, everything else untouched behind them.
      return captureSocket.middleware(request, response, function () {
        return letterbox.middleware(request, response, function () {
          return enhanced(request, response, next);
        });
      });
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
    server: Object.assign({}, baseResult.server, {
      enhanceMiddleware: enhanceMiddleware,
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
module.exports.createOpenStoryLetterbox = createOpenStoryLetterbox;
module.exports.createCaptureSocket = createCaptureSocket;
// Exported for SHERLO-1890 spike unit tests (module manifest sidecar).
module.exports.emitModuleManifestSidecar = emitModuleManifestSidecar;
module.exports.stableStringify = stableStringify;
