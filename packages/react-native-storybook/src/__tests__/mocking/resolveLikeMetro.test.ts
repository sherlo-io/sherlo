'use strict';

// A mocked name is resolved the way the app's bundler resolves it:
// extraNodeModules aliases included, and the stand-in requires the real file by absolute path.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const applySherloTransforms = require('../../../metro/applySherloTransforms');
const mockShims = require('../../../metro/mockShims');
const { createResolveLikeMetro } = require('../../../metro/resolveLikeMetro');

function mkProject(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  // The project's Metro brings metro-resolver; a temp project gets the repository's own copy.
  const installed = path.dirname(require.resolve('metro-resolver/package.json'));
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(installed, path.join(root, 'node_modules', 'metro-resolver'), 'dir');
  return root;
}

function writeFile(root: string, relPath: string, content: string): string {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

// A context whose delegate resolves as Metro does for the importer it is asked from.
function metroContext(root: string, originModulePath: string, resolverConfig: object) {
  const resolveLikeMetro = createResolveLikeMetro({ resolver: resolverConfig }, root);
  return {
    originModulePath,
    resolveRequest: (context: { originModulePath: string }, name: string) => ({
      type: 'sourceFile',
      filePath: resolveLikeMetro(name, context.originModulePath) ?? '/unresolved/' + name,
    }),
  };
}

function shimSource(root: string, moduleKey: string): string {
  return fs.readFileSync(
    path.join(root, 'node_modules', '.cache', 'sherlo', 'mocks', mockShims.shimFileName(moduleKey)),
    'utf8'
  );
}

// The module the shim's inner require() names (its last require).
function requiredByShim(source: string): string {
  const requires = [...source.matchAll(/require\(("[^"]+")\)/g)].map((m) => JSON.parse(m[1]));
  return requires[requires.length - 1];
}

function aliasProject(prefix: string) {
  const root = mkProject(prefix);
  const real = writeFile(root, 'src/components/Chat.js', 'module.exports = { Chat: 1 };');
  writeFile(
    root,
    'src/Chat.stories.tsx',
    "export const S = { parameters: { sherlo: { mocks: { 'components/Chat': {} } } } };"
  );
  const resolverConfig = { extraNodeModules: { components: path.join(root, 'src', 'components') } };
  return { root, real, resolverConfig };
}

const MOCKS_DIR = path.join('.cache', 'sherlo', 'mocks');

describe('the mock scan resolves a name like the app bundler (extraNodeModules included)', () => {
  it('a mocked name that is only a bundler alias registers the file the bundler uses', () => {
    const { root, real, resolverConfig } = aliasProject('sherlo-alias-only-');
    const result = applySherloTransforms({ projectRoot: root, resolver: resolverConfig });

    const redirected = result.resolver.resolveRequest(
      metroContext(root, path.join(root, 'src', 'App.js'), resolverConfig),
      'components/Chat',
      'ios'
    );
    const specifier = requiredByShim(shimSource(root, 'components/Chat'));
    const fromTheShim = result.resolver.resolveRequest(
      metroContext(root, redirected.filePath, resolverConfig),
      specifier,
      'ios'
    );
    const realFile = fs.realpathSync(real);
    cleanup(root);

    expect(redirected.filePath).toContain(MOCKS_DIR);
    expect(path.isAbsolute(specifier)).toBe(true);
    expect(fromTheShim.filePath).toBe(realFile);
  });

  it("a mocked name that is an alias Node can also resolve registers the bundler's file, not Node's", () => {
    const { root, real, resolverConfig } = aliasProject('sherlo-alias-node-');
    // A symlinked node_modules/components makes Node and Metro find the same name by the hierarchy
    // too, as a NODE_PATH-like setup does in a real app.
    fs.symlinkSync(
      path.join(root, 'src', 'components'),
      path.join(root, 'node_modules', 'components'),
      'dir'
    );
    const result = applySherloTransforms({ projectRoot: root, resolver: resolverConfig });

    const redirected = result.resolver.resolveRequest(
      metroContext(root, path.join(root, 'src', 'App.js'), resolverConfig),
      'components/Chat',
      'ios'
    );
    const specifier = requiredByShim(shimSource(root, 'components/Chat'));
    const fromTheShim = result.resolver.resolveRequest(
      metroContext(root, redirected.filePath, resolverConfig),
      specifier,
      'ios'
    );
    const realFile = fs.realpathSync(real);
    cleanup(root);

    expect(redirected.filePath).toContain(MOCKS_DIR);
    expect(specifier).not.toBe('components/Chat');
    expect(fromTheShim.filePath).toBe(realFile);
  });

  it('the stand-in requires the real module by its absolute path, never back through itself', () => {
    // A bare name can resolve to another file from the shim folder than from its importer, which
    // is why the stand-in must not require it bare.
    const root = mkProject('sherlo-alias-origin-');
    // A workspace package with its OWN node_modules copy of "components" - what its files see.
    const near = writeFile(
      root,
      'packages/app/node_modules/components/Chat.js',
      'module.exports = { Chat: "near" };'
    );
    writeFile(root, 'packages/app/App.js', 'module.exports = {};');
    writeFile(root, 'node_modules/components/Chat.js', 'module.exports = { Chat: "root" };');

    const resolveLikeMetro = createResolveLikeMetro({ resolver: {} }, root);
    const fromImporter = resolveLikeMetro(
      'components/Chat',
      path.join(root, 'packages/app/App.js')
    );
    const fromShimFolder = resolveLikeMetro(
      'components/Chat',
      path.join(root, 'node_modules/.cache/sherlo/mocks/mock-x.js')
    );
    const nearFile = fs.realpathSync(near);
    cleanup(root);

    expect(fromImporter).toBe(nearFile);
    expect(fromShimFolder).not.toBe(fromImporter);
  });

  // The three cases of one test: each kind of name registers the file the bundler uses.
  const relativeNameCase = () => {
    const root = mkProject('sherlo-relative-');
    writeFile(root, 'src/who/whoAmI.js', 'module.exports = {};');
    writeFile(
      root,
      'src/who/Who.stories.tsx',
      "export const S = { parameters: { sherlo: { mocks: [mock(() => import('./whoAmI'), {})] } } };"
    );
    const result = applySherloTransforms({ projectRoot: root, resolver: {} });

    const redirected = result.resolver.resolveRequest(
      metroContext(root, path.join(root, 'src', 'App.js'), {}),
      path.join(root, 'src', 'who', 'whoAmI'),
      'ios'
    );
    cleanup(root);

    expect(redirected.filePath).toContain(MOCKS_DIR);
  };

  // A package name keeps the bare specifier (Metro re-resolves it per platform).
  const packageNameCase = () => {
    const root = mkProject('sherlo-package-');
    writeFile(
      root,
      'node_modules/some-lib/package.json',
      JSON.stringify({ name: 'some-lib', main: 'index.js' })
    );
    writeFile(root, 'node_modules/some-lib/index.js', 'module.exports = {};');
    writeFile(
      root,
      'src/Lib.stories.tsx',
      "export const S = { parameters: { sherlo: { mocks: { 'some-lib': {} } } } };"
    );
    const result = applySherloTransforms({ projectRoot: root, resolver: {} });

    const redirected = result.resolver.resolveRequest(
      metroContext(root, path.join(root, 'src', 'App.js'), {}),
      'some-lib',
      'ios'
    );
    const specifier = requiredByShim(shimSource(root, 'some-lib'));
    cleanup(root);

    expect(redirected.filePath).toContain(MOCKS_DIR);
    expect(specifier).toBe('some-lib');
  };

  // A monorepo package through a symlink: the file Metro resolves is the one registered.
  const monorepoNameCase = () => {
    const root = mkProject('sherlo-monorepo-');
    writeFile(
      root,
      'packages/ui/package.json',
      JSON.stringify({ name: '@org/ui', main: 'index.js' })
    );
    writeFile(root, 'packages/ui/index.js', 'module.exports = {};');
    fs.mkdirSync(path.join(root, 'node_modules', '@org'), { recursive: true });
    fs.symlinkSync(
      path.join(root, 'packages', 'ui'),
      path.join(root, 'node_modules', '@org', 'ui'),
      'dir'
    );
    writeFile(
      root,
      'src/Ui.stories.tsx',
      "export const S = { parameters: { sherlo: { mocks: { '@org/ui': {} } } } };"
    );
    const result = applySherloTransforms({ projectRoot: root, resolver: {} });

    const redirected = result.resolver.resolveRequest(
      metroContext(root, path.join(root, 'src', 'App.js'), {}),
      '@org/ui',
      'ios'
    );
    cleanup(root);

    expect(redirected.filePath).toContain(MOCKS_DIR);
  };

  it('a relative, a package and a symlinked monorepo name each register the file the bundler uses', () => {
    relativeNameCase();
    packageNameCase();
    monorepoNameCase();
  });
});
