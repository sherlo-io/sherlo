'use strict';

// ---------------------------------------------------------------------------
// Module Mocking - shim emission + resolver map (SHERLO-1734 Phase 2)
// ---------------------------------------------------------------------------
//
// Given the set of mock keys (from mockScan + the `mockModules` escape hatch),
// this module:
//   1. rejects deny-listed keys (FG-02),
//   2. resolves each key to an absolute real-module path (FG-01),
//   3. writes one deterministic one-line shim per key under <cacheDir>/mocks/,
//   4. returns an in-memory `canonical real path -> shim path` map that the
//      resolver uses to redirect matched requests.
//
// The shim is exactly one `createMockable` call requiring the real module. It
// requires createMockable from the installed/compiled Sherlo package (never the
// TS source) so it runs correctly at bundle time.

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var scan = require('./mockScan');

// Mirror of src/mocking/denyList.ts MOCK_DENY_LIST. Kept as a literal here
// because this file runs at Metro-config time (plain JS, before any tsc build);
// a unit test asserts it stays in sync with the TypeScript source of truth.
var MOCK_DENY_LIST = ['react', 'react-native', '@storybook/*', '@sherlo/*'];

// The specifier the emitted shim uses to reach createMockable. Points at the
// package's `./mocking` export (compiled dist), which resolves from anywhere in
// the dependency tree - including from inside <cacheDir>/mocks/.
var CREATE_MOCKABLE_SPECIFIER = '@sherlo/react-native-storybook/mocking';

// Platform suffixes Metro layers on top of the base extension.
var PLATFORM_SUFFIXES = ['ios', 'android', 'native', 'web'];

// A deny-list entry is either an exact specifier ('react') or a scope glob
// ('@storybook/*'). Both forms deny the entry itself AND everything under it, so
// 'react/jsx-runtime' and 'react-native/Libraries/Core/InitializeCore' are
// denied via their 'react'/'react-native' roots (FG-02). A non-denied lookalike
// like 'react-native-svg' is NOT matched because the '/' boundary is required.
function isDeniedKey(key) {
  for (var i = 0; i < MOCK_DENY_LIST.length; i++) {
    var entry = MOCK_DENY_LIST[i];
    var base = entry.slice(-2) === '/*' ? entry.slice(0, -2) : entry;
    if (key === base || key.indexOf(base + '/') === 0) return true;
  }
  return false;
}

function isRelativeOrAbsolute(key) {
  return key.charAt(0) === '.' || path.isAbsolute(key);
}

// Reduce an absolute module path to a platform/extension-independent identity so
// that Button.tsx, Button.ios.tsx, and Button.android.tsx all collapse to the
// same key. This is what lets ONE shim match a module across every platform.
//
// The path is first passed through realpathSync so both sides of the resolver
// comparison agree even when symlinks are involved (require.resolve follows
// symlinks; a workspace/pnpm node_modules layout or a /tmp symlink would
// otherwise make the config-time identity and the runtime identity diverge).
// Non-existent paths fall back to the raw path unchanged.
function canonicalizeModulePath(absPath) {
  var real = absPath;
  try {
    real = fs.realpathSync(absPath);
  } catch (_) {
    /* path may not exist (e.g. unit tests on synthetic paths); use it as-is */
  }
  var ext = path.extname(real);
  if (!ext) return real;
  var base = real.slice(0, -ext.length);
  var maybePlatform = path.extname(base);
  if (maybePlatform && PLATFORM_SUFFIXES.indexOf(maybePlatform.slice(1)) !== -1) {
    base = base.slice(0, -maybePlatform.length);
  }
  return base;
}

// Find a concrete file for a relative/absolute app-module base path, trying the
// bare extensions, the platform-split variants, and the directory index form.
// Returns the found absolute file path, or null when nothing exists.
function resolveAppModuleFile(basePath) {
  var extensions = ['.tsx', '.ts', '.jsx', '.js'];

  var candidates = [];
  for (var e = 0; e < extensions.length; e++) {
    candidates.push(basePath + extensions[e]);
    for (var p = 0; p < PLATFORM_SUFFIXES.length; p++) {
      candidates.push(basePath + '.' + PLATFORM_SUFFIXES[p] + extensions[e]);
    }
    candidates.push(path.join(basePath, 'index' + extensions[e]));
  }

  for (var c = 0; c < candidates.length; c++) {
    try {
      if (fs.statSync(candidates[c]).isFile()) return candidates[c];
    } catch (_) {
      /* keep looking */
    }
  }
  return null;
}

// Build the app-module resolution result shared by the './'-prefixed and the
// dotless project-root-relative branches: canonical identity and require
// specifier are the same realpath-normalised, extensionless absolute path so
// Metro re-resolves the platform-split file per platform.
function appModuleResult(file) {
  return {
    canonicalRealPath: canonicalizeModulePath(file),
    requireSpecifier: canonicalizeModulePath(file),
  };
}

// A bare key is a package ROOT (not a subpath) when it has no path segment past
// the package name: 'async-storage' or '@scope/name', but NOT 'pkg/submodule' or
// '@scope/name/submodule'. Only roots need alternate-entry registration below -
// subpath keys resolve to one concrete file that Node and Metro agree on.
function isPackageRootKey(key) {
  if (key.charAt(0) === '@') return key.split('/').length === 2;
  return key.indexOf('/') === -1;
}

// Walk up from a resolved file to the directory of the package that owns it,
// returning { dir, pkg } once a package.json whose "name" matches the key is
// found. Matching on name (not just "first package.json up") skips nested
// dependency package.jsons and lands on the real package root.
function findPackageDir(fromFile, key) {
  var dir = path.dirname(fromFile);
  while (true) {
    try {
      var pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg && pkg.name === key) return { dir: dir, pkg: pkg };
    } catch (_) {
      /* no package.json here (or unreadable) - keep walking up */
    }
    var parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Collect every string leaf under a package.json "exports" value that applies to
// the package root ("."). exports can be a bare string, a { ".": ... } map, or a
// pure conditions object (no subpath keys). Different conditions (react-native,
// import, require, default) can each point at a DIFFERENT file, and Metro follows
// the 'react-native' condition while Node follows 'require'/'default' - so we
// gather them all as alternate entries.
function collectExportsRootLeaves(exportsField) {
  if (!exportsField) return [];
  var rootEntry;
  if (typeof exportsField === 'string') {
    rootEntry = exportsField;
  } else if (Object.prototype.hasOwnProperty.call(exportsField, '.')) {
    rootEntry = exportsField['.'];
  } else if (Object.keys(exportsField).some((k) => k.charAt(0) === '.')) {
    // Has subpath keys but no '.' entry -> no root entry to register.
    return [];
  } else {
    // A pure conditions object applies to the root.
    rootEntry = exportsField;
  }
  return collectStringLeaves(rootEntry);
}

function collectStringLeaves(node) {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') {
    var out = [];
    for (var k of Object.keys(node)) {
      out = out.concat(collectStringLeaves(node[k]));
    }
    return out;
  }
  return [];
}

// For a package-root key, the canonical entry file Node's require.resolve picks
// (e.g. lib/commonjs/index.js via "main"/exports.require) can differ from the one
// Metro picks (e.g. src/index.ts via the "react-native" field/condition). When
// they diverge the resolver's map lookup misses and the redirect silently no-ops
// (MK-02). To keep config-time identity in agreement with Metro's bundle-time
// resolution, register EVERY plausible root entry - "main", "react-native", and
// all exports-root leaves - as an alternate canonical path pointing at the same
// shim. Whichever file Metro resolves at bundle time then matches.
function packageRootAlternateCanonicalPaths(key, resolved, primaryCanonicalPath) {
  if (!isPackageRootKey(key)) return [];
  var located = findPackageDir(resolved, key);
  if (!located) return [];

  var candidates = [located.pkg.main, located.pkg['react-native']].concat(
    collectExportsRootLeaves(located.pkg.exports)
  );

  var seen = {};
  var alternates = [];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (!candidate || typeof candidate !== 'string') continue;
    // Resolve the candidate (a package-relative specifier) to a concrete file,
    // probing extensions/index the same way an app module is resolved.
    var abs = path.resolve(located.dir, candidate);
    var file = null;
    try {
      if (fs.statSync(abs).isFile()) file = abs;
    } catch (_) {
      /* not a direct file - fall through to extension/index probing */
    }
    if (!file) file = resolveAppModuleFile(abs);
    if (!file) continue;

    var canonical = canonicalizeModulePath(file);
    if (canonical === primaryCanonicalPath || seen[canonical]) continue;
    seen[canonical] = true;
    alternates.push(canonical);
  }
  return alternates;
}

// Resolve one mock key to:
//   - canonicalRealPath: the identity the resolver matches delegate output on,
//   - requireSpecifier:  what the shim's inner require() targets. Bare package
//     keys keep their specifier so Metro re-resolves per platform (MK-06);
//     app-module keys use the extensionless absolute path so Metro re-resolves
//     the platform-split file per platform.
//   - alternateCanonicalPaths: extra identities (for package roots) that Metro
//     might resolve the same key to, all pointing at the same shim (MK-02).
// Throws when the key cannot be resolved (FG-01).
function resolveMockKey(key, projectRoot) {
  // Explicit './'-prefixed or absolute keys are always app modules.
  if (isRelativeOrAbsolute(key)) {
    var basePath = path.resolve(projectRoot, key);
    var file = resolveAppModuleFile(basePath);
    if (!file) throw new Error('cannot resolve app module');
    return appModuleResult(file);
  }

  // Otherwise the key is a bare specifier. Try node_modules resolution FIRST so
  // MK-03 subpath packages ('pkg/submodule') keep their runtime bare-specifier
  // semantics. Only when that fails do we treat the key as a DOTLESS
  // project-root-relative app module ('src/api/client'), matching the epic's
  // canonical app-module key form. FG-01 fires only when both routes fail.
  try {
    var resolved = require.resolve(key, { paths: [projectRoot] });
    var canonicalRealPath = canonicalizeModulePath(resolved);
    return {
      canonicalRealPath: canonicalRealPath,
      requireSpecifier: key,
      alternateCanonicalPaths: packageRootAlternateCanonicalPaths(
        key,
        resolved,
        canonicalRealPath
      ),
    };
  } catch (_) {
    var appFile = resolveAppModuleFile(path.resolve(projectRoot, key));
    if (appFile) return appModuleResult(appFile);
    throw new Error('cannot resolve mock key');
  }
}

// Deterministic shim filename: a short hash of the key. Same key -> same file,
// so shim content only changes when the key set changes.
function shimFileName(key) {
  var hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
  return 'mock-' + hash + '.js';
}

// The one-line shim body: a single createMockable call requiring the real
// module. requireSpecifier is emitted as a require() so Metro (not us) does the
// real resolution at bundle time - which re-resolves platform-split files.
function generateShimContent(key, requireSpecifier) {
  return (
    "'use strict';\n" +
    'module.exports = require(' +
    JSON.stringify(CREATE_MOCKABLE_SPECIFIER) +
    ').createMockable(' +
    JSON.stringify(key) +
    ', require(' +
    JSON.stringify(requireSpecifier) +
    '));\n'
  );
}

// -------------------------------------------------------------------------
// Config-time scan overhead budget (WS7 / SHERLO-1738 Phase 6)
// -------------------------------------------------------------------------
// setupMocks (scanProjectForMockKeys + deny-list + per-key resolve + shim
// emission) runs ONCE per `metro` config load, not per request. Measured on
// the fixtures in this repo (Apple M-series, warm fs cache):
//   - largest real fixture (integrated-app-expo-sb8, ~520 files): ~0.7 ms scan
//   - synthetic monorepo, 13 mock stories + 2000 source files:    ~7 ms scan
//   - pathological, ~120 mock stories + 2000 files:               ~28 ms scan
//   - setupMocks resolving+emitting 10 / 40 / 100 mock keys: ~6 / 15 / 32 ms
// So a realistic app lands well under 50 ms combined; even a pathological
// monorepo (120 stories + 100 keys + 2000 files) stays around ~60 ms.
//
// BUDGET: the combined scan + setup MUST stay under 250 ms for the largest
// project. That is ~4x the pathological measurement above - headroom for a
// cold fs cache, slower CI disks, and future growth. If a change pushes past
// it, profile before shipping: the dominant costs are the babel parse per
// story/preview file and the require.resolve per package key, both of which
// scale linearly and are the first places to optimise (e.g. memoise resolves
// across keys, or cache parsed keys by file mtime so unchanged files are not
// re-parsed on a warm Metro restart).
// -------------------------------------------------------------------------
//
// Build the complete mock setup for a config run.
//
// Returns { mocksDir, mockedPathToShim, shimPaths }:
//   - mockedPathToShim: Map<canonicalRealPath, shimAbsolutePath> for the resolver.
//   - shimPaths:        every emitted shim path (for tests / diagnostics).
//
// Side effect: the <cacheDir>/mocks/ directory is rewritten to contain exactly
// the current key set's shims (stale shims from prior runs are removed).
//
// opts: { projectRoot, cacheDir, mockModules, scanFiles }
//   - scanFiles is an optional explicit list of files to scan (tests); when
//     omitted the whole project is scanned.
function setupMocks(opts) {
  var projectRoot = opts.projectRoot;
  var cacheDir = opts.cacheDir;
  var mockModules = Array.isArray(opts.mockModules) ? opts.mockModules : [];

  // 1. Collect keys: static scan + the mockModules escape hatch (MK-10).
  var keyToSource = opts.scanFiles
    ? scanFilesToKeyMap(opts.scanFiles)
    : scan.scanProjectForMockKeys(projectRoot);
  for (var m = 0; m < mockModules.length; m++) {
    if (!keyToSource.has(mockModules[m])) {
      keyToSource.set(mockModules[m], '<mockModules option>');
    }
  }

  // 2. Rewrite the mocks directory from scratch so no stale shims survive.
  var mocksDir = path.join(cacheDir, 'mocks');
  fs.rmSync(mocksDir, { recursive: true, force: true });
  fs.mkdirSync(mocksDir, { recursive: true });

  // 3. Resolve each key and emit its shim.
  //
  // A bad key (deny-listed or unresolvable) must NEVER fail the build (SHERLO-1765 B4):
  // metro config is evaluated in the client's production build pipeline, so a throw here
  // would fail a store build on a typo in a Sherlo story fixture. Instead we warn-and-skip:
  // emit a clear console.warn naming the key AND its source, skip that key (no shim, no map
  // entry), and continue with the rest. A skipped key still surfaces at runtime via the FG-03
  // unshimmed-key tripwire.
  var mockedPathToShim = new Map();
  var shimPaths = [];

  keyToSource.forEach(function (source, key) {
    // Deny list (FG-02): react, react-native, @storybook/*, and @sherlo/* are off-limits.
    if (isDeniedKey(key)) {
      console.warn(
        '[Sherlo] Skipping mock key "' +
          key +
          '" in ' +
          source +
          ': react, react-native, @storybook/*, and @sherlo/* cannot be mocked directly. ' +
          'Create a wrapper module in your own code that re-exports what you need from "' +
          key +
          '", then mock the wrapper\'s path instead.'
      );
      return;
    }

    var resolved;
    try {
      resolved = resolveMockKey(key, projectRoot);
    } catch (_) {
      console.warn(
        '[Sherlo] Skipping mock key "' +
          key +
          '" in ' +
          source +
          ': it did not resolve to a real module. Check for a typo, confirm the package is installed, ' +
          'or write the path relative to the project root (with or without a leading "./").'
      );
      return;
    }

    var shimPath = path.join(mocksDir, shimFileName(key));
    fs.writeFileSync(shimPath, generateShimContent(key, resolved.requireSpecifier), 'utf8');

    // Register the primary identity plus any alternate package-root entries
    // (main/react-native/exports) so the redirect hits whichever file Metro
    // resolves the key to at bundle time (MK-02).
    mockedPathToShim.set(resolved.canonicalRealPath, shimPath);
    var alternates = resolved.alternateCanonicalPaths || [];
    for (var a = 0; a < alternates.length; a++) {
      mockedPathToShim.set(alternates[a], shimPath);
    }
    shimPaths.push(shimPath);
  });

  return {
    mocksDir: mocksDir,
    mockedPathToShim: mockedPathToShim,
    shimPaths: shimPaths,
  };
}

// Scan an explicit list of files into a key -> source-file Map (test entry).
function scanFilesToKeyMap(files) {
  var keyToFile = new Map();
  for (var i = 0; i < files.length; i++) {
    var source;
    try {
      source = fs.readFileSync(files[i], 'utf8');
    } catch (_) {
      continue;
    }
    var keys = scan.collectMockKeysFromSource(source);
    for (var k = 0; k < keys.length; k++) {
      if (!keyToFile.has(keys[k])) keyToFile.set(keys[k], files[i]);
    }
  }
  return keyToFile;
}

module.exports = {
  MOCK_DENY_LIST: MOCK_DENY_LIST,
  CREATE_MOCKABLE_SPECIFIER: CREATE_MOCKABLE_SPECIFIER,
  isDeniedKey: isDeniedKey,
  canonicalizeModulePath: canonicalizeModulePath,
  resolveMockKey: resolveMockKey,
  shimFileName: shimFileName,
  generateShimContent: generateShimContent,
  setupMocks: setupMocks,
};
