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
// ('@storybook/*'). The glob matches the bare scope and anything under it.
function isDeniedKey(key) {
  for (var i = 0; i < MOCK_DENY_LIST.length; i++) {
    var entry = MOCK_DENY_LIST[i];
    if (entry.slice(-2) === '/*') {
      var scope = entry.slice(0, -2);
      if (key === scope || key.indexOf(scope + '/') === 0) return true;
    } else if (key === entry) {
      return true;
    }
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

// Resolve one mock key to:
//   - canonicalRealPath: the identity the resolver matches delegate output on,
//   - requireSpecifier:  what the shim's inner require() targets. Bare package
//     keys keep their specifier so Metro re-resolves per platform (MK-06);
//     app-module keys use the extensionless absolute path so Metro re-resolves
//     the platform-split file per platform.
// Throws when the key cannot be resolved (FG-01).
function resolveMockKey(key, projectRoot) {
  if (isRelativeOrAbsolute(key)) {
    var basePath = path.resolve(projectRoot, key);
    var file = resolveAppModuleFile(basePath);
    if (!file) throw new Error('cannot resolve app module');
    return {
      canonicalRealPath: canonicalizeModulePath(file),
      requireSpecifier: canonicalizeModulePath(file),
    };
  }

  var resolved = require.resolve(key, { paths: [projectRoot] });
  return {
    canonicalRealPath: canonicalizeModulePath(resolved),
    requireSpecifier: key,
  };
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

  // 2. Enforce the deny list (FG-02).
  keyToSource.forEach(function (source, key) {
    if (isDeniedKey(key)) {
      throw new Error(
        '[Sherlo] Cannot mock "' +
          key +
          '" (declared in ' +
          source +
          '): this module is on the mock deny list because mocking it would break ' +
          "Storybook's own runtime. Mock a thin wrapper module you own that re-exports it instead."
      );
    }
  });

  // 3. Rewrite the mocks directory from scratch so no stale shims survive.
  var mocksDir = path.join(cacheDir, 'mocks');
  fs.rmSync(mocksDir, { recursive: true, force: true });
  fs.mkdirSync(mocksDir, { recursive: true });

  // 4. Resolve each key (FG-01) and emit its shim.
  var mockedPathToShim = new Map();
  var shimPaths = [];

  keyToSource.forEach(function (source, key) {
    var resolved;
    try {
      resolved = resolveMockKey(key, projectRoot);
    } catch (_) {
      throw new Error(
        '[Sherlo] Cannot resolve mocked module "' +
          key +
          '" declared in ' +
          source +
          '. Check the module specifier is spelled correctly and installed.'
      );
    }

    var shimPath = path.join(mocksDir, shimFileName(key));
    fs.writeFileSync(shimPath, generateShimContent(key, resolved.requireSpecifier), 'utf8');

    mockedPathToShim.set(resolved.canonicalRealPath, shimPath);
    shimPaths.push(shimPath);
  });

  return { mocksDir: mocksDir, mockedPathToShim: mockedPathToShim, shimPaths: shimPaths };
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
