'use strict';

// ---------------------------------------------------------------------------
// Module Mocking - shim emission + resolver map (SHERLO-1734 Phase 2)
// ---------------------------------------------------------------------------
//
// Given the set of mock keys (from mockScan + the `mockModules` escape hatch), this module:
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
var toRelativePath = require('./projectPaths').toRelativePath;
var createResolveLikeMetro = require('./resolveLikeMetro').createResolveLikeMetro;

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

function isRelativeKey(key) {
  return key.charAt(0) === '.';
}

function isRelativeOrAbsolute(key) {
  return isRelativeKey(key) || path.isAbsolute(key);
}

// The file `filePath` really is, with every symlink on the way followed, so a project installed
// through links (pnpm, a monorepo) names each file one way only. When it is not on disk (a unit
// test's synthetic path) it is the absolute form of the path: both callers pass absolute paths,
// which stay as written, and a relative one still compares against absolute ones.
function realFilePath(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch (_) {
    return path.resolve(filePath);
  }
}

// Whether `file` lies somewhere under `folder` (both absolute). False when either is missing.
function isInsideFolder(file, folder) {
  return !!file && !!folder && file.indexOf(folder + path.sep) === 0;
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
  var real = realFilePath(absPath);
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
  // Not SOURCE_EXTENSIONS: this order is the one Metro resolves an extensionless import in.
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
// Metro re-resolves the platform-split file per platform. moduleKey is the name
// the shim registers - see resolveMockKey.
function appModuleResult(file, moduleKey) {
  var modulePath = canonicalizeModulePath(file);
  return {
    moduleKey: moduleKey,
    canonicalRealPath: modulePath,
    requireSpecifier: modulePath,
  };
}

// The package a bare key names: 'pkg/sub' -> 'pkg', '@scope/name/sub' -> '@scope/name'.
function packageNameOf(key) {
  var parts = key.split('/');
  return key.charAt(0) === '@' ? parts.slice(0, 2).join('/') : parts[0];
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
//   - moduleKey:         the name the shim registers, and the name a declaration reads back
//     off that shim. A key a story wrote is that name; a relative key an import expression
//     named is named by the module it resolved to instead, because two stories may both write
//     './whoAmI' for two different files and each must name its own module.
//   - canonicalRealPath: the identity the resolver matches delegate output on,
//   - requireSpecifier:  what the shim's inner require() targets. Bare package
//     keys keep their specifier so Metro re-resolves per platform (MK-06);
//     app-module keys use the extensionless absolute path so Metro re-resolves
//     the platform-split file per platform.
//   - alternateCanonicalPaths: extra identities (for package roots) that Metro
//     might resolve the same key to, all pointing at the same shim (MK-02).
//
// importedFromFile is the story or preview file whose import expression named the key; it is
// what makes a relative key point beside that file, the way that file's own imports do. A key
// a story wrote as a string, or the mockModules option named, has no such file and is read
// from the project root.
// Throws when the key cannot be resolved (FG-01).
//
// resolveLikeMetro, when given, is (name) -> the file the app's bundler resolves the name to, or
// null (metro/resolveLikeMetro.js); without it only Node and the project root are asked.
function resolveMockKey(key, projectRoot, importedFromFile, resolveLikeMetro) {
  // Explicit './'-prefixed or absolute keys are always app modules.
  if (isRelativeOrAbsolute(key)) {
    var namedBesideFile = !!importedFromFile && isRelativeKey(key);
    var fromDir = namedBesideFile ? path.dirname(importedFromFile) : projectRoot;
    var file = resolveAppModuleFile(path.resolve(fromDir, key));
    if (!file) throw new Error('cannot resolve app module');
    return appModuleResult(file, namedBesideFile ? canonicalizeModulePath(file) : key);
  }

  // Otherwise the key is a bare specifier. Try node_modules resolution FIRST so
  // MK-03 subpath packages ('pkg/submodule') keep their runtime bare-specifier
  // semantics. Only when that fails do we treat the key as a DOTLESS
  // project-root-relative app module ('src/api/client'), the canonical
  // app-module key form. FG-01 fires only when both routes fail.
  //
  // The app's own bundler resolution comes first (resolveLikeMetro, which reads the config's
  // extraNodeModules too): it names the file Metro will hand the resolver. Node's require.resolve
  // stays for the package branch below, which keeps a bare specifier so Metro re-resolves it.
  var viaMetro = resolveLikeMetro ? resolveLikeMetro(key) : null;
  try {
    var resolved = require.resolve(key, { paths: [projectRoot] });
    var canonicalRealPath = canonicalizeModulePath(resolved);
    var owner = findPackageDir(resolved, packageNameOf(key));
    // A name no package owns (an alias both Metro and Node reach) is an app module: the stand-in
    // requires the file by absolute path, never the name, so its own request is never matched
    // against the name again and never resolves from the shim folder to another copy.
    var appModuleFile = owner ? null : viaMetro || (path.isAbsolute(resolved) ? resolved : null);
    if (appModuleFile) {
      return appModuleResult(appModuleFile, key);
    }
    var alternates = packageRootAlternateCanonicalPaths(key, resolved, canonicalRealPath);
    if (viaMetro) {
      // The file Metro picks for the package may differ from Node's (main vs react-native).
      var metroCanonical = canonicalizeModulePath(viaMetro);
      if (metroCanonical !== canonicalRealPath && alternates.indexOf(metroCanonical) === -1) {
        alternates = alternates.concat(metroCanonical);
      }
    }
    return {
      moduleKey: key,
      canonicalRealPath: canonicalRealPath,
      requireSpecifier: key,
      alternateCanonicalPaths: alternates,
      packageDir: owner ? owner.dir : null,
    };
  } catch (_) {
    // Node cannot reach the name, Metro can (extraNodeModules): an app module.
    if (viaMetro) return appModuleResult(viaMetro, key);
    var appFile = resolveAppModuleFile(path.resolve(projectRoot, key));
    if (appFile) return appModuleResult(appFile, key);
    throw new Error('cannot resolve mock key');
  }
}

// Deterministic shim filename: a short hash of the module's name. Same name -> same file,
// so shim content only changes when the set of mocked modules changes.
function shimFileName(moduleKey) {
  var hash = crypto.createHash('sha1').update(moduleKey).digest('hex').slice(0, 16);
  return 'mock-' + hash + '.js';
}

// The shim body: one createLazyMockable call that loads the real module on first use. The stand-in
// is module.exports from the first moment, so a module in an import cycle through the real file
// never holds an empty exports object. requireSpecifier is emitted as a require() so Metro (not us)
// does the real resolution at bundle time - which re-resolves platform-split files.
function generateShimContent(moduleKey, requireSpecifier) {
  return (
    "'use strict';\n" +
    'module.exports = require(' +
    JSON.stringify(CREATE_MOCKABLE_SPECIFIER) +
    ').createLazyMockable(' +
    JSON.stringify(moduleKey) +
    ', function () { return require(' +
    JSON.stringify(requireSpecifier) +
    '); });\n'
  );
}

// -------------------------------------------------------------------------
// Config-time scan overhead budget (WS7 / SHERLO-1738 Phase 6)
// -------------------------------------------------------------------------
// setupMocks runs ONCE per `metro` config load, not per request. Measured (Apple M-series, warm
// fs cache): ~0.7 ms scan for a ~520-file app, ~7 / ~28 ms for 13 / ~120 mock stories over 2000
// files, ~6 / 15 / 32 ms to resolve and emit 10 / 40 / 100 keys - a realistic app well under
// 50 ms. BUDGET: scan + setup MUST stay under 250 ms for the largest project. Past it, profile
// first: the babel parse per story file and the require.resolve per package key dominate (memoise
// resolves across keys, or cache parsed keys by file mtime across warm Metro restarts).
// -------------------------------------------------------------------------
//
// Build the complete mock setup for a config run.
//
// Returns { mocksDir, mockedPathToShim, shimPaths }:
//   - mockedPathToShim: Map<canonicalRealPath, shimAbsolutePath> for the resolver.
//   - shimPaths:        every emitted shim path (for tests / diagnostics).
//   - declaredImportsPolyfill: the polyfill naming what the scan saw, or null with no mocks.
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
  var resolveLikeMetro = createResolveLikeMetro(opts.metroConfig, projectRoot);

  // 1. Collect what the project declares: static scan + the mockModules escape hatch (MK-10).
  var declaredMocks = opts.scanFiles
    ? scanFilesForMocks(opts.scanFiles)
    : scan.scanProjectForMocks(projectRoot);
  for (var m = 0; m < mockModules.length; m++) {
    // A key the option names sits in no file, so it is read from the project root.
    declaredMocks.push({
      key: mockModules[m],
      file: '<mockModules option>',
      namedByImport: false,
    });
  }

  // One shim per module, however many stories declare it. Two stories that both write
  // './whoAmI' name two DIFFERENT modules, each beside its own story file, so a declaration
  // is filed under where its key points and never under the key's bare text.
  var mocksByModulePath = new Map();
  declaredMocks.forEach(function (declared) {
    var modulePath = modulePathOf(declared);
    if (!mocksByModulePath.has(modulePath)) mocksByModulePath.set(modulePath, declared);
  });

  // 2. Rewrite the mocks directory from scratch so no stale shims survive. A project that
  // declares no mock gets no directory at all, so it pays nothing for a layer it does not use.
  var mocksDir = path.join(cacheDir, 'mocks');
  fs.rmSync(mocksDir, { recursive: true, force: true });
  if (mocksByModulePath.size > 0) fs.mkdirSync(mocksDir, { recursive: true });

  // 3. Resolve each key and emit its shim.
  //
  // A bad key (deny-listed or unresolvable) must NEVER fail the build (SHERLO-1765 B4):
  // metro config is evaluated in the client's production build pipeline, so a throw here
  // would fail a store build on a typo in a Sherlo story fixture. Instead we warn-and-skip:
  // emit a clear console.warn naming the key AND its source, skip that key (no shim, no map
  // entry), and continue with the rest. A skipped key still fails its story at run time, as a mock
  // the bundler had not seen (src/mocking/activateStoryMocks.ts, mockFailureOf).
  var mockedPathToShim = new Map();
  var shimPaths = [];
  var mockedPackages = new Map();
  var bareKeyShims = new Map();
  var shimmedKeys = [];
  // The name each module's stand-in is installed under, by the module path it was filed under.
  var moduleKeyByModulePath = new Map();

  mocksByModulePath.forEach(function (declared) {
    var key = declared.key;
    var declaredIn = declared.file;
    // Deny list (FG-02): react, react-native, @storybook/*, and @sherlo/* are off-limits.
    if (isDeniedKey(key)) {
      console.warn(
        '[Sherlo] Skipping mock key "' +
          key +
          '" in ' +
          declaredIn +
          ': react, react-native, @storybook/*, and @sherlo/* cannot be mocked directly. ' +
          'Create a wrapper module in your own code that re-exports what you need from "' +
          key +
          '", then mock the wrapper\'s path instead.'
      );
      return;
    }

    var resolved;
    try {
      resolved = resolveMockKey(key, projectRoot, importExpressionFile(declared), resolveLikeMetro);
    } catch (_) {
      console.warn(
        '[Sherlo] Skipping mock key "' +
          key +
          '" in ' +
          declaredIn +
          ': it did not resolve to a real module. Check for a typo, confirm the package is installed, ' +
          'or write the path relative to the project root (with or without a leading "./").'
      );
      return;
    }

    var shimPath = path.join(mocksDir, shimFileName(resolved.moduleKey));
    fs.writeFileSync(
      shimPath,
      generateShimContent(resolved.moduleKey, resolved.requireSpecifier),
      'utf8'
    );

    // Register the primary identity plus any alternate package-root entries
    // (main/react-native/exports) so the redirect hits whichever file Metro
    // resolves the key to at bundle time (MK-02).
    mockedPathToShim.set(resolved.canonicalRealPath, shimPath);
    var alternates = resolved.alternateCanonicalPaths || [];
    for (var a = 0; a < alternates.length; a++) {
      mockedPathToShim.set(alternates[a], shimPath);
    }
    if (resolved.packageDir) {
      mockedPackages.set(key, { dir: resolved.packageDir, shimPath: shimPath });
    }
    if (!isRelativeOrAbsolute(key)) bareKeyShims.set(key, shimPath);
    shimPaths.push(shimPath);
    shimmedKeys.push(key);
    moduleKeyByModulePath.set(modulePathOf(declared), resolved.moduleKey);
  });

  // One line at every bundler start that reads mocks, so a log always says which mocks can apply.
  if (mocksByModulePath.size > 0) {
    console.log('[Sherlo] mocks shimmed: ' + (shimmedKeys.join(', ') || 'none'));
  }

  return {
    mocksDir: mocksDir,
    mockedPathToShim: mockedPathToShim,
    mockedPackages: mockedPackages,
    warnedKeys: new Set(),
    bareKeyShims: bareKeyShims,
    reachedShims: new Set(),
    shimPaths: shimPaths,
    declaredImportsPolyfill:
      mocksByModulePath.size > 0
        ? writeDeclaredImportsPolyfill(cacheDir, projectRoot, declaredMocks, moduleKeyByModulePath)
        : null,
  };
}

// Where a declaration's key points: beside the file whose import expression named it, or the
// key's own text for a key read from the project root.
function modulePathOf(declared) {
  var declaringFile = importExpressionFile(declared);
  return declaringFile ? path.resolve(path.dirname(declaringFile), declared.key) : declared.key;
}

// What the scan saw, for the run-time check that fails a story whose mock did not take effect
// (src/mocking/declaredImports.ts): each story file's mocks declared by an import expression, as
// the file wrote them, with the name each one's stand-in is installed under (null when the scan
// made it none), and every name a stand-in was made for. A stand-in loads only when something
// imports it, so the app cannot learn this from the stand-ins it has loaded. Story files are filed
// under the path Storybook knows them by (`./src/X.stories.tsx`, from the project root). It
// reaches run time as a polyfill setting `globalThis.__sherloDeclaredImports`; returns its path.
function writeDeclaredImportsPolyfill(cacheDir, projectRoot, declaredMocks, moduleKeyByModulePath) {
  var storyFiles = {};
  declaredMocks.forEach(function (declared) {
    var storyPath = declared.file.charAt(0) !== '<' && toRelativePath(declared.file, projectRoot);
    if (!declared.namedByImport || !storyPath) return;
    var imports = storyFiles[storyPath] || (storyFiles[storyPath] = []);
    var written = imports.some(function (declaredImport) {
      return declaredImport.specifier === declared.key;
    });
    if (written) return;
    imports.push({
      specifier: declared.key,
      moduleKey: moduleKeyByModulePath.get(modulePathOf(declared)) || null,
    });
  });
  var declaredImports = {
    storyFiles: storyFiles,
    mockedModules: Array.from(new Set(moduleKeyByModulePath.values())),
  };

  fs.mkdirSync(cacheDir, { recursive: true });
  var polyfillPath = path.join(cacheDir, 'declared-imports.js');
  fs.writeFileSync(
    polyfillPath,
    "'use strict';\nglobal.__sherloDeclaredImports = " + JSON.stringify(declaredImports) + ';\n',
    'utf8'
  );
  return polyfillPath;
}

// The shim a resolved request is redirected to, or undefined when it is not a mocked module.
//
// A file registered ahead of time (the key's own entry and the package.json entries) matches. A
// request whose name is exactly a mocked package ROOT key matches wherever it resolves: which entry
// file the bundler picks (a "module" field, an exports condition, a platform file) and which
// installed copy it lands in (the app's own or a nested one) is the bundler's choice, but the
// module asked for is the same. A deep bare key ('pkg/sub') matches any file inside its package;
// when it lands outside its package, that is the one case the redirect cannot cover, so it warns
// once instead of staying silent.
function shimForRequest(mockSetup, moduleName, resolvedFilePath) {
  var shimPath = shimMatchingRequest(mockSetup, moduleName, resolvedFilePath);
  if (shimPath) mockSetup.reachedShims.add(shimPath);
  return shimPath;
}

function shimMatchingRequest(mockSetup, moduleName, resolvedFilePath) {
  var registered = mockSetup.mockedPathToShim.get(canonicalizeModulePath(resolvedFilePath));
  if (registered) return registered;
  var mockedPackage = mockSetup.mockedPackages.get(moduleName);
  if (!mockedPackage) return undefined;
  if (isPackageRootKey(moduleName)) return mockedPackage.shimPath;
  if (isInsideFolder(realFilePath(resolvedFilePath), realFilePath(mockedPackage.dir))) {
    return mockedPackage.shimPath;
  }
  if (mockSetup.warnedKeys.has(moduleName)) return undefined;
  mockSetup.warnedKeys.add(moduleName);
  console.warn(
    '[Sherlo] The story mocks "' +
      moduleName +
      '", but the bundler resolved that import to ' +
      resolvedFilePath +
      ', outside the package Sherlo mocks (' +
      mockedPackage.dir +
      '), so this import is NOT mocked. Make sure only one copy of the package is installed.'
  );
  return undefined;
}

// Once the bundle is built: warns, once per key, of each mocked bare package that no import
// reached, so a mock that can never apply is not silent in the bundler output. The bundle's
// serializer calls it, the one point Metro gives where every import has been resolved.
function warnUnreachedMocks(mockSetup) {
  mockSetup.bareKeyShims.forEach(function (shimPath, key) {
    if (mockSetup.reachedShims.has(shimPath) || mockSetup.warnedKeys.has('unreached:' + key)) {
      return;
    }
    mockSetup.warnedKeys.add('unreached:' + key);
    console.warn('[Sherlo] mock of ' + key + ' was declared but no import reached it');
  });
}

// The file whose import expression named this key, when that is what makes the key point at a
// module: a relative key reads from beside the file that wrote it, exactly as that file's own
// imports do. A key a story wrote as a string, a bare package, and a key the mockModules
// option named all read from the project root and have no such file.
function importExpressionFile(declared) {
  return declared.namedByImport && isRelativeKey(declared.key) ? declared.file : null;
}

// Scan an explicit list of files for the mocks they declare (test entry).
function scanFilesForMocks(files) {
  var declaredMocks = [];
  for (var i = 0; i < files.length; i++) {
    declaredMocks = declaredMocks.concat(scan.scanFileForMocks(files[i]));
  }
  return declaredMocks;
}

module.exports = {
  MOCK_DENY_LIST: MOCK_DENY_LIST,
  CREATE_MOCKABLE_SPECIFIER: CREATE_MOCKABLE_SPECIFIER,
  isDeniedKey: isDeniedKey,
  canonicalizeModulePath: canonicalizeModulePath,
  isInsideFolder: isInsideFolder,
  realFilePath: realFilePath,
  resolveMockKey: resolveMockKey,
  shimFileName: shimFileName,
  generateShimContent: generateShimContent,
  setupMocks: setupMocks,
  shimForRequest: shimForRequest,
  warnUnreachedMocks: warnUnreachedMocks,
};
