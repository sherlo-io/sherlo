'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The Metro layer is plain CommonJS .js - require it the same way the existing
// applySherloTransforms.test.ts does.
const applySherloTransforms = require('../../../metro/applySherloTransforms');
const mockScan = require('../../../metro/mockScan');
const mockShims = require('../../../metro/mockShims');

import { MOCK_DENY_LIST } from '../../mocking/denyList';

// ---------------------------------------------------------------------------
// Scaffolding helpers
// ---------------------------------------------------------------------------

function mkProject(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root: string, relPath: string, content: string): string {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

// Creates a fake installed npm package under <root>/node_modules/<name>.
function writePackage(
  root: string,
  name: string,
  mainFile: string,
  files: Record<string, string>
): void {
  const pkgDir = path.join(root, 'node_modules', name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', main: mainFile }),
    'utf8'
  );
  for (const rel of Object.keys(files)) {
    const f = path.join(pkgDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, files[rel], 'utf8');
  }
}

// Like writePackage but lets the caller supply arbitrary package.json fields
// (e.g. a `react-native` field or an `exports` map whose entries diverge from
// `main`). Used to reproduce the MK-02 scoped-root divergence: Node's
// require.resolve picks `main` at config time while Metro follows the
// `react-native` condition to a different file at bundle time.
function writePackageWithJson(
  root: string,
  name: string,
  pkgJson: Record<string, unknown>,
  files: Record<string, string>
): void {
  const pkgDir = path.join(root, 'node_modules', name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', ...pkgJson }),
    'utf8'
  );
  for (const rel of Object.keys(files)) {
    const f = path.join(pkgDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, files[rel], 'utf8');
  }
}

// Fake Metro resolver context whose delegate maps module names -> absolute paths.
function makeContext(originModulePath: string, resolveMap: Record<string, string>) {
  return {
    originModulePath,
    resolveRequest: (_ctx: unknown, name: string) => {
      if (resolveMap[name]) return { type: 'sourceFile', filePath: resolveMap[name] };
      return { type: 'sourceFile', filePath: `/unresolved/${name}` };
    },
  };
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// MK-09 - config-time scan of parameters.sherlo.mocks keys
// ---------------------------------------------------------------------------

describe('mockScan.collectMockKeysFromSource (MK-09)', () => {
  it('collects meta-level and story-level string-literal keys', () => {
    const src = `
      const meta = {
        title: 'Button',
        parameters: { sherlo: { mocks: { 'expo-localization': {} } } },
      };
      export default meta;
      export const Basic = {
        parameters: { sherlo: { mocks: { '@scope/pkg': {}, 'pkg/submodule': {} } } },
      };
    `;
    expect(mockScan.collectMockKeysFromSource(src).sort()).toEqual([
      '@scope/pkg',
      'expo-localization',
      'pkg/submodule',
    ]);
  });

  it('tolerates `satisfies` and `as` annotations around the parameters object', () => {
    const src = `
      import type { Meta } from '@storybook/react';
      const meta = {
        parameters: ({ sherlo: { mocks: { 'a-mod': {} } } } satisfies Record<string, unknown>),
      } as Meta;
      export const S = {
        parameters: { sherlo: { mocks: { 'b-mod': {} } as any } },
      };
    `;
    expect(mockScan.collectMockKeysFromSource(src).sort()).toEqual(['a-mod', 'b-mod']);
  });

  it('extracts KEYS only - never touches mock values (no value extraction)', () => {
    const src = `
      export const S = {
        parameters: { sherlo: { mocks: {
          'with-factory': (real) => ({ ...real, foo: 1 }),
          'with-object': { bar: someRuntimeValue() },
        } } },
      };
    `;
    expect(mockScan.collectMockKeysFromSource(src).sort()).toEqual(['with-factory', 'with-object']);
  });

  it('ignores non-string-literal keys (identifier / computed)', () => {
    const src = `
      const dynamicKey = 'runtime';
      export const S = {
        parameters: { sherlo: { mocks: { 'quoted-key': {}, [dynamicKey]: {}, bareIdent: {} } } },
      };
    `;
    expect(mockScan.collectMockKeysFromSource(src)).toEqual(['quoted-key']);
  });

  it('returns nothing for files without sherlo mocks', () => {
    expect(mockScan.collectMockKeysFromSource('export const x = 1;')).toEqual([]);
    expect(mockScan.collectMockKeysFromSource('this is not valid <<< js')).toEqual([]);
  });
});

describe('mockScan.findScanFiles / scanProjectForMockKeys (MK-09 discovery)', () => {
  it('finds *.stories.* and preview.* files, skipping node_modules', () => {
    const root = mkProject('sherlo-scan-find-');
    writeFile(root, 'src/Button.stories.tsx', 'export const A = {};');
    writeFile(root, '.storybook/preview.ts', 'export const parameters = {};');
    writeFile(root, 'src/Button.tsx', 'export default 1;');
    writeFile(root, 'node_modules/dep/thing.stories.js', 'export const B = {};');

    const files = mockScan
      .findScanFiles(root)
      .map((f: string) => path.relative(root, f))
      .sort();
    cleanup(root);

    expect(files).toContain('src/Button.stories.tsx');
    expect(files).toContain(path.join('.storybook', 'preview.ts'));
    expect(files).not.toContain('src/Button.tsx');
    expect(files.some((f: string) => f.indexOf('node_modules') !== -1)).toBe(false);
  });

  it('scanProjectForMockKeys maps each key to its declaring file', () => {
    const root = mkProject('sherlo-scan-project-');
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );
    const map = mockScan.scanProjectForMockKeys(root);
    cleanup(root);

    expect(map.get('expo-localization')).toContain('Comp.stories.tsx');
  });
});

// ---------------------------------------------------------------------------
// Deny list (FG-02) + sync with the TS source of truth
// ---------------------------------------------------------------------------

describe('mockShims deny list (FG-02)', () => {
  it('the JS deny list mirrors src/mocking/denyList.ts', () => {
    expect(mockShims.MOCK_DENY_LIST).toEqual([...MOCK_DENY_LIST]);
  });

  it('denies exact and scope-glob entries', () => {
    expect(mockShims.isDeniedKey('react')).toBe(true);
    expect(mockShims.isDeniedKey('react-native')).toBe(true);
    expect(mockShims.isDeniedKey('@storybook/react-native')).toBe(true);
    expect(mockShims.isDeniedKey('@sherlo/react-native-storybook')).toBe(true);
    expect(mockShims.isDeniedKey('expo-localization')).toBe(false);
    expect(mockShims.isDeniedKey('react-native-svg')).toBe(false);
  });

  it('denies subpaths of exact deny entries (FG-02), not lookalikes', () => {
    // Exact entries deny their subpaths too, so Storybook-critical internals
    // can't slip through under a deeper specifier.
    expect(mockShims.isDeniedKey('react/jsx-runtime')).toBe(true);
    expect(mockShims.isDeniedKey('react-native/Libraries/Core/InitializeCore')).toBe(true);
    // A distinct package that merely shares a prefix is still mockable - the '/'
    // boundary keeps 'react-native-svg' from matching the 'react-native' entry.
    expect(mockShims.isDeniedKey('react-native-svg')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canonicalizeModulePath - platform/extension identity (supports MK-06)
// ---------------------------------------------------------------------------

describe('mockShims.canonicalizeModulePath', () => {
  it('strips extension and platform suffix so all platform variants collapse', () => {
    expect(mockShims.canonicalizeModulePath('/a/b/Button.tsx')).toBe('/a/b/Button');
    expect(mockShims.canonicalizeModulePath('/a/b/Button.ios.tsx')).toBe('/a/b/Button');
    expect(mockShims.canonicalizeModulePath('/a/b/Button.android.js')).toBe('/a/b/Button');
    expect(mockShims.canonicalizeModulePath('/a/b/index.native.ts')).toBe('/a/b/index');
  });
});

// ---------------------------------------------------------------------------
// Shim emission + content
// ---------------------------------------------------------------------------

describe('mockShims.generateShimContent + shimFileName', () => {
  it('emits exactly one createMockable call requiring the real module', () => {
    const content = mockShims.generateShimContent('expo-localization', 'expo-localization');
    expect(content).toContain('@sherlo/react-native-storybook/mocking');
    expect(content).toContain('.createMockable("expo-localization", require("expo-localization"))');
    // exactly one createMockable call
    expect(content.match(/createMockable/g)?.length).toBe(1);
  });

  it('shim filenames are deterministic per key', () => {
    expect(mockShims.shimFileName('expo-localization')).toBe(
      mockShims.shimFileName('expo-localization')
    );
    expect(mockShims.shimFileName('a')).not.toBe(mockShims.shimFileName('b'));
  });

  it('shim content changes only when the key set changes', () => {
    const root = mkProject('sherlo-shim-determinism-');
    writePackage(root, 'alpha', 'index.js', { 'index.js': 'module.exports = {};' });
    writePackage(root, 'beta', 'index.js', { 'index.js': 'module.exports = {};' });
    const cacheDir = path.join(root, 'node_modules', '.cache', 'sherlo');
    fs.mkdirSync(cacheDir, { recursive: true });
    const alphaShim = path.join(cacheDir, 'mocks', mockShims.shimFileName('alpha'));

    // First run with {alpha}.
    mockShims.setupMocks({ projectRoot: root, cacheDir, mockModules: ['alpha'] });
    const firstAlpha = fs.readFileSync(alphaShim, 'utf8');

    // Re-run with the SAME key set -> byte-identical shim.
    mockShims.setupMocks({ projectRoot: root, cacheDir, mockModules: ['alpha'] });
    expect(fs.readFileSync(alphaShim, 'utf8')).toBe(firstAlpha);

    // Adding a key leaves alpha's shim byte-identical and emits beta's shim.
    mockShims.setupMocks({ projectRoot: root, cacheDir, mockModules: ['alpha', 'beta'] });
    const betaShim = path.join(cacheDir, 'mocks', mockShims.shimFileName('beta'));
    expect(fs.readFileSync(alphaShim, 'utf8')).toBe(firstAlpha);
    expect(fs.existsSync(betaShim)).toBe(true);

    // Removing beta prunes its stale shim (fresh rewrite each run).
    mockShims.setupMocks({ projectRoot: root, cacheDir, mockModules: ['alpha'] });
    expect(fs.existsSync(betaShim)).toBe(false);
    cleanup(root);
  });
});

// ---------------------------------------------------------------------------
// Shim requires createMockable from the installed package export (proving it
// resolves against package.json exports).
// ---------------------------------------------------------------------------

describe('shim createMockable specifier maps to a real, built entry point', () => {
  // The shim requires createMockable from the package's `./mocking` export. This
  // proves that specifier is (a) the one the shim uses, (b) declared in exports,
  // and (c) that the source compiling to that export really exports createMockable.
  // The bundle lane (mockBundle.test.ts) proves it resolves through real Metro.
  it('generateShimContent uses the ./mocking package export specifier', () => {
    expect(mockShims.CREATE_MOCKABLE_SPECIFIER).toBe('@sherlo/react-native-storybook/mocking');
    const content = mockShims.generateShimContent('x', 'x');
    expect(content).toContain('require("@sherlo/react-native-storybook/mocking")');
  });

  it('package.json declares the ./mocking export -> dist/mocking/index.js', () => {
    const realPkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8')
    );
    expect(realPkg.exports['./mocking'].require).toBe('./dist/mocking/index.js');
    expect(realPkg.exports['./mocking']['react-native']).toBe('./dist/mocking/index.js');
  });

  it('src/mocking/index.ts (compiles to dist/mocking/index.js) exports createMockable', () => {
    const indexSrc = fs.readFileSync(path.join(__dirname, '../../mocking/index.ts'), 'utf8');
    expect(indexSrc).toMatch(/export\s+\{[^}]*createMockable/);
  });
});

// ---------------------------------------------------------------------------
// resolveMockKey - resolution + require specifier (FG-01, MK-06 unit level)
// ---------------------------------------------------------------------------

describe('mockShims.resolveMockKey', () => {
  it('MK-01: resolves a bare npm package; shim requires the bare specifier', () => {
    const root = mkProject('sherlo-resolvekey-npm-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    const realRoot = fs.realpathSync(root);

    const resolved = mockShims.resolveMockKey('expo-localization', root);
    cleanup(root);

    expect(resolved.requireSpecifier).toBe('expo-localization');
    // canonicalRealPath is realpath-normalised and extension-stripped.
    expect(resolved.canonicalRealPath).toBe(
      path.join(realRoot, 'node_modules', 'expo-localization', 'index')
    );
  });

  it('MK-04: resolves a project-root-relative app module; shim requires the extensionless path', () => {
    const root = mkProject('sherlo-resolvekey-app-');
    writeFile(root, 'src/utils/localization.ts', 'export default {};');
    const realRoot = fs.realpathSync(root);

    const resolved = mockShims.resolveMockKey('./src/utils/localization', root);
    cleanup(root);

    // For app modules the canonical identity and the shim's require specifier are
    // the same realpath-normalised, extensionless path.
    const expectedBase = path.join(realRoot, 'src', 'utils', 'localization');
    expect(resolved.canonicalRealPath).toBe(expectedBase);
    expect(resolved.requireSpecifier).toBe(expectedBase);
  });

  it('MK-04 (dotless): resolves a DOTLESS project-root-relative app module to the extensionless abs path', () => {
    const root = mkProject('sherlo-resolvekey-dotless-');
    writeFile(root, 'src/utils/localization.ts', 'export default {};');
    const realRoot = fs.realpathSync(root);

    // No './' prefix - the canonical app-module key form from the epic. It is
    // not an installed package, so require.resolve fails and we fall back to the
    // project-root-relative app-module file.
    const resolved = mockShims.resolveMockKey('src/utils/localization', root);
    cleanup(root);

    const expectedBase = path.join(realRoot, 'src', 'utils', 'localization');
    expect(resolved.canonicalRealPath).toBe(expectedBase);
    expect(resolved.requireSpecifier).toBe(expectedBase);
  });

  it('MK-03: a subpath package still resolves as a BARE package, not an app module', () => {
    const root = mkProject('sherlo-resolvekey-subpath-');
    writePackage(root, 'libpkg', 'index.js', {
      'index.js': 'module.exports = {};',
      'submodule.js': 'module.exports = {};',
    });
    const realRoot = fs.realpathSync(root);

    // require.resolve wins first, so the shim keeps the bare specifier and the
    // canonical identity points into node_modules (not a project-root file).
    const resolved = mockShims.resolveMockKey('libpkg/submodule', root);
    cleanup(root);

    expect(resolved.requireSpecifier).toBe('libpkg/submodule');
    expect(resolved.canonicalRealPath).toBe(
      path.join(realRoot, 'node_modules', 'libpkg', 'submodule')
    );
  });

  it('MK-06: platform-split app module resolves to one canonical identity + extensionless specifier', () => {
    const root = mkProject('sherlo-resolvekey-plat-');
    writeFile(root, 'src/Plat.ios.tsx', 'export default {};');
    writeFile(root, 'src/Plat.android.tsx', 'export default {};');
    const realRoot = fs.realpathSync(root);

    const resolved = mockShims.resolveMockKey('./src/Plat', root);
    cleanup(root);

    // One shim, one canonical identity; the require specifier is platform-free so
    // Metro re-resolves the correct .ios/.android file per platform at bundle time.
    const expectedBase = path.join(realRoot, 'src', 'Plat');
    expect(resolved.canonicalRealPath).toBe(expectedBase);
    expect(resolved.requireSpecifier).toBe(expectedBase);
    expect(resolved.requireSpecifier).not.toContain('.ios');
    expect(resolved.requireSpecifier).not.toContain('.android');
  });

  it('throws for an unresolvable key (drives FG-01)', () => {
    const root = mkProject('sherlo-resolvekey-fail-');
    expect(() => mockShims.resolveMockKey('totally-not-installed', root)).toThrow();
    cleanup(root);
  });

  it('MK-02: a scoped package ROOT whose react-native field diverges from main registers BOTH entries', () => {
    // require.resolve follows `main` (lib/commonjs/index.js); Metro follows the
    // `react-native` field (src/index.ts). The two canonical identities diverge,
    // so the config-time identity must ALSO include Metro's entry as an alternate.
    const root = mkProject('sherlo-resolvekey-scoped-root-');
    writePackageWithJson(
      root,
      '@react-native-async-storage/async-storage',
      { main: 'lib/commonjs/index.js', 'react-native': 'src/index.ts' },
      { 'lib/commonjs/index.js': 'module.exports = {};', 'src/index.ts': 'export default {};' }
    );
    const realRoot = fs.realpathSync(root);

    const resolved = mockShims.resolveMockKey('@react-native-async-storage/async-storage', root);
    cleanup(root);

    const mainCanonical = path.join(
      realRoot,
      'node_modules',
      '@react-native-async-storage',
      'async-storage',
      'lib',
      'commonjs',
      'index'
    );
    const rnCanonical = path.join(
      realRoot,
      'node_modules',
      '@react-native-async-storage',
      'async-storage',
      'src',
      'index'
    );

    // Primary is whatever Node picked (main); the react-native entry is registered
    // as an alternate so Metro's bundle-time resolution still matches.
    expect(resolved.canonicalRealPath).toBe(mainCanonical);
    expect(resolved.alternateCanonicalPaths).toContain(rnCanonical);
    expect(resolved.requireSpecifier).toBe('@react-native-async-storage/async-storage');
  });

  it('MK-02: an exports map whose react-native condition diverges from require is registered too', () => {
    const root = mkProject('sherlo-resolvekey-exports-');
    writePackageWithJson(
      root,
      '@react-native-community/slider',
      {
        main: 'lib/commonjs/index.js',
        exports: {
          '.': {
            'react-native': './src/index.ts',
            require: './lib/commonjs/index.js',
            default: './lib/module/index.js',
          },
        },
      },
      {
        'lib/commonjs/index.js': 'module.exports = {};',
        'lib/module/index.js': 'export default {};',
        'src/index.ts': 'export default {};',
      }
    );
    const realRoot = fs.realpathSync(root);
    const pkgRoot = path.join(realRoot, 'node_modules', '@react-native-community', 'slider');

    const resolved = mockShims.resolveMockKey('@react-native-community/slider', root);
    cleanup(root);

    // The react-native condition (src/index) is the one Metro follows - it must be
    // among the registered identities regardless of which entry Node picked.
    const allIdentities = [resolved.canonicalRealPath, ...resolved.alternateCanonicalPaths];
    expect(allIdentities).toContain(path.join(pkgRoot, 'src', 'index'));
  });

  it('subpath keys get no alternate root entries (require.resolve already matches Metro)', () => {
    const root = mkProject('sherlo-resolvekey-subpath-noalt-');
    writePackage(root, 'libpkg', 'index.js', {
      'index.js': 'module.exports = {};',
      'submodule.js': 'module.exports = {};',
    });

    const resolved = mockShims.resolveMockKey('libpkg/submodule', root);
    cleanup(root);

    expect(resolved.alternateCanonicalPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end resolver redirect via applySherloTransforms
// ---------------------------------------------------------------------------

describe('applySherloTransforms resolver redirect', () => {
  it('MK-01: redirects an npm-package import to its shim', () => {
    const root = mkProject('sherlo-redirect-npm-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const realPath = path.join(root, 'node_modules', 'expo-localization', 'index.js');
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), {
      'expo-localization': realPath,
    });

    const resolved = result.resolver.resolveRequest(ctx, 'expo-localization', 'ios');
    const shimExists = fs.existsSync(resolved.filePath);
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(shimExists).toBe(true);
  });

  it('MK-02 + MK-03: redirects scoped-package and subpath keys', () => {
    const root = mkProject('sherlo-redirect-scoped-');
    writePackage(root, '@scope/pkg', 'index.js', { 'index.js': 'module.exports = {};' });
    writePackage(root, 'libpkg', 'index.js', {
      'index.js': 'module.exports = {};',
      'submodule.js': 'module.exports = {};',
    });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { '@scope/pkg': {}, 'libpkg/submodule': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const scopedReal = path.join(root, 'node_modules', '@scope', 'pkg', 'index.js');
    const subReal = path.join(root, 'node_modules', 'libpkg', 'submodule.js');
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), {
      '@scope/pkg': scopedReal,
      'libpkg/submodule': subReal,
    });

    const scopedResolved = result.resolver.resolveRequest(ctx, '@scope/pkg', 'ios');
    const subResolved = result.resolver.resolveRequest(ctx, 'libpkg/submodule', 'ios');
    cleanup(root);

    expect(scopedResolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(subResolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(scopedResolved.filePath).not.toBe(subResolved.filePath);
  });

  it('MK-02: redirects a scoped package ROOT even when Metro resolves it to the react-native entry (not main)', () => {
    // The regression: config-time require.resolve lands on `main`
    // (lib/commonjs/index.js) while Metro's delegate resolver follows the
    // `react-native` field to src/index.ts. Before the alternate-identity fix the
    // resolver map lookup missed and the redirect silently no-op'd.
    const root = mkProject('sherlo-redirect-scoped-root-');
    writePackageWithJson(
      root,
      '@react-native-async-storage/async-storage',
      { main: 'lib/commonjs/index.js', 'react-native': 'src/index.ts' },
      { 'lib/commonjs/index.js': 'module.exports = {};', 'src/index.ts': 'export default {};' }
    );
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { '@react-native-async-storage/async-storage': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    // Metro resolves the import to the react-native entry, NOT the main entry.
    const metroEntry = path.join(
      root,
      'node_modules',
      '@react-native-async-storage',
      'async-storage',
      'src',
      'index.ts'
    );
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), {
      '@react-native-async-storage/async-storage': metroEntry,
    });

    const resolved = result.resolver.resolveRequest(
      ctx,
      '@react-native-async-storage/async-storage',
      'android'
    );
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
  });

  it('MK-04: redirects a project-relative app-module import', () => {
    const root = mkProject('sherlo-redirect-app-');
    writeFile(root, 'src/utils/localization.ts', 'export default {};');
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { './src/utils/localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const realPath = path.join(root, 'src', 'utils', 'localization.ts');
    // Importer uses a relative specifier that Metro resolves to the same file.
    const ctx = makeContext(path.join(root, 'src', 'screens', 'Home.tsx'), {
      '../utils/localization': realPath,
    });

    const resolved = result.resolver.resolveRequest(ctx, '../utils/localization', 'ios');
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
  });

  it('MK-04 (dotless): redirects a DOTLESS project-root-relative app-module import', () => {
    const root = mkProject('sherlo-redirect-app-dotless-');
    writeFile(root, 'src/utils/localization.ts', 'export default {};');
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'src/utils/localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const realPath = path.join(root, 'src', 'utils', 'localization.ts');
    // Importer uses a relative specifier that Metro resolves to the same file.
    const ctx = makeContext(path.join(root, 'src', 'screens', 'Home.tsx'), {
      '../utils/localization': realPath,
    });

    const resolved = result.resolver.resolveRequest(ctx, '../utils/localization', 'ios');
    // The dotless key also emitted a shim (scan-to-shim path).
    const shimPath = path.join(
      root,
      'node_modules',
      '.cache',
      'sherlo',
      'mocks',
      mockShims.shimFileName('src/utils/localization')
    );
    const shimExists = fs.existsSync(shimPath);
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(shimExists).toBe(true);
  });

  it('MK-06: both platform variants redirect to the SAME single shim', () => {
    const root = mkProject('sherlo-redirect-plat-');
    writeFile(root, 'src/Plat.ios.tsx', 'export default {};');
    writeFile(root, 'src/Plat.android.tsx', 'export default {};');
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { './src/Plat': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const iosCtx = makeContext(path.join(root, 'src', 'App.tsx'), {
      './Plat': path.join(root, 'src', 'Plat.ios.tsx'),
    });
    const androidCtx = makeContext(path.join(root, 'src', 'App.tsx'), {
      './Plat': path.join(root, 'src', 'Plat.android.tsx'),
    });

    const iosResolved = result.resolver.resolveRequest(iosCtx, './Plat', 'ios');
    const androidResolved = result.resolver.resolveRequest(androidCtx, './Plat', 'android');
    cleanup(root);

    expect(iosResolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
    expect(iosResolved.filePath).toBe(androidResolved.filePath);
  });

  it('MK-08: a transitive importer inside node_modules is redirected too', () => {
    const root = mkProject('sherlo-redirect-transitive-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const realPath = path.join(root, 'node_modules', 'expo-localization', 'index.js');
    // Origin is a file INSIDE node_modules (a transitive dependency).
    const ctx = makeContext(path.join(root, 'node_modules', 'some-lib', 'index.js'), {
      'expo-localization': realPath,
    });

    const resolved = result.resolver.resolveRequest(ctx, 'expo-localization', 'ios');
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
  });

  it('the shim itself is exempt (require inside a shim resolves to the real module)', () => {
    const root = mkProject('sherlo-shim-exempt-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const realPath = path.join(root, 'node_modules', 'expo-localization', 'index.js');
    const shimPath = path.join(
      root,
      'node_modules',
      '.cache',
      'sherlo',
      'mocks',
      mockShims.shimFileName('expo-localization')
    );
    const ctx = makeContext(shimPath, { 'expo-localization': realPath });

    const resolved = result.resolver.resolveRequest(ctx, 'expo-localization', 'ios');
    cleanup(root);

    // No redirect: the shim's own require(real) reaches the real module.
    expect(resolved.filePath).toBe(realPath);
  });

  it('MK-10: mockModules option registers a key static scan cannot see', () => {
    const root = mkProject('sherlo-mockmodules-');
    writePackage(root, 'native-only-lib', 'index.js', { 'index.js': 'module.exports = {};' });
    // No story declares it - only the escape hatch does.

    const result = applySherloTransforms(
      { projectRoot: root, resolver: {} },
      { enabled: true, mockModules: ['native-only-lib'] }
    );
    const realPath = path.join(root, 'node_modules', 'native-only-lib', 'index.js');
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), { 'native-only-lib': realPath });

    const resolved = result.resolver.resolveRequest(ctx, 'native-only-lib', 'ios');
    cleanup(root);

    expect(resolved.filePath).toContain(path.join('.cache', 'sherlo', 'mocks'));
  });

  it('FG-04: a mocked module no component imports is a harmless no-op', () => {
    const root = mkProject('sherlo-noop-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    const shimPath = path.join(
      root,
      'node_modules',
      '.cache',
      'sherlo',
      'mocks',
      mockShims.shimFileName('expo-localization')
    );
    const shimExists = fs.existsSync(shimPath);

    // Some other module is imported; it must pass through untouched.
    const otherReal = path.join(root, 'node_modules', 'other', 'index.js');
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), { other: otherReal });
    const resolved = result.resolver.resolveRequest(ctx, 'other', 'ios');
    cleanup(root);

    expect(shimExists).toBe(true); // shim generated
    expect(resolved.filePath).toBe(otherReal); // unrelated import untouched
  });

  it('FG-01: an unresolvable mock key fails config naming the story file AND key', () => {
    const root = mkProject('sherlo-fg01-');
    writeFile(
      root,
      'src/Broken.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'not-installed-pkg': {} } } } };`
    );

    let error: Error | null = null;
    try {
      applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    } catch (e) {
      error = e as Error;
    }
    cleanup(root);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('not-installed-pkg');
    expect(error!.message).toContain('Broken.stories.tsx');
  });

  it('FG-02: a deny-listed key fails with guidance to mock a wrapper module', () => {
    const root = mkProject('sherlo-fg02-');
    writeFile(
      root,
      'src/Bad.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'react-native': {} } } } };`
    );

    let error: Error | null = null;
    try {
      applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: true });
    } catch (e) {
      error = e as Error;
    }
    cleanup(root);

    expect(error).not.toBeNull();
    expect(error!.message).toContain('react-native');
    expect(error!.message.toLowerCase()).toContain('wrapper');
  });
});

// ---------------------------------------------------------------------------
// EB-01 - enabled:false contributes nothing
// ---------------------------------------------------------------------------

describe('EB-01: enabled:false disables the mocking system entirely', () => {
  it('emits no shims and installs no resolver redirect', () => {
    const root = mkProject('sherlo-eb01-');
    writePackage(root, 'expo-localization', 'index.js', { 'index.js': 'module.exports = {};' });
    writeFile(
      root,
      'src/Comp.stories.tsx',
      `export const S = { parameters: { sherlo: { mocks: { 'expo-localization': {} } } } };`
    );

    const result = applySherloTransforms({ projectRoot: root, resolver: {} }, { enabled: false });

    const mocksDir = path.join(root, 'node_modules', '.cache', 'sherlo', 'mocks');
    const mocksDirExists = fs.existsSync(mocksDir);

    const realPath = path.join(root, 'node_modules', 'expo-localization', 'index.js');
    const ctx = makeContext(path.join(root, 'src', 'Screen.tsx'), {
      'expo-localization': realPath,
    });
    const resolved = result.resolver.resolveRequest(ctx, 'expo-localization', 'ios');
    cleanup(root);

    expect(mocksDirExists).toBe(false); // no shims emitted
    expect(resolved.filePath).toBe(realPath); // no redirect - reaches the real module
  });
});
