/**
 * A mock is declared with the module it names as an import expression, never a string, so the
 * declaration is checked against the module's own types (sherlo-brain, books/sherlo/mocking-a-story.md).
 */
vi.mock('../../SherloModule', () => ({
  default: {
    getMode: vi.fn().mockReturnValue('testing'),
  },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

import createMockable from '../../mocking/createMockable';
import { declarationsOf, mock, resolveDeclarations } from '../../mocking/mockDeclaration';
import { mergeStoryMocks } from '../../mocking/mergeMocks';
import { activateStoryMocks } from '../../mocking';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';

const mockScan = require('../../../metro/mockScan');
const applySherloTransforms = require('../../../metro/applySherloTransforms');

const MOCKS_DIR_FRAGMENT = path.join('.cache', 'sherlo', 'mocks');

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Type checking: what the editor says about a declaration
// ---------------------------------------------------------------------------

// The real `mock`, reached the way a story reaches it - by importing the source below.
const MOCK_MODULE = path.resolve(__dirname, '../../mocking/mockDeclaration');

// The module a snippet's `import('./module')` names.
const MOCKED_MODULE_SOURCE = `
  export const whoAmI = (): string => 'real';
  export default { label: 'real' };
`;

/**
 * Type-check `storySource` as a story file sitting next to that module, and return what
 * TypeScript says about it. This is the editor's own answer - the place a wrong export name
 * or a wrong shape is meant to be refused, before anything runs.
 */
function typeErrorsIn(storySource: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-typed-declaration-'));
  const storyPath = path.join(root, 'story.ts');
  fs.writeFileSync(path.join(root, 'module.ts'), MOCKED_MODULE_SOURCE, 'utf8');
  fs.writeFileSync(storyPath, storySource, 'utf8');

  const program = ts.createProgram([storyPath], {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
    // No ambient @types: the snippet is checked against this package's own source alone.
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  fs.rmSync(root, { recursive: true, force: true });

  return diagnostics
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
    .join('\n');
}

function storyDeclaring(definition: string): string {
  return `
    import { mock } from '${MOCK_MODULE}';
    export const declaration = mock(() => import('./module'), ${definition});
  `;
}

// ---------------------------------------------------------------------------
// Metro scaffolding: a throwaway project whose imports one fake resolver answers
// ---------------------------------------------------------------------------

function makeProject(storySource: string | null): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-always-on-'));
  const packageDir = path.join(root, 'node_modules', 'expo-localization');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'expo-localization', version: '1.0.0', main: 'index.js' }),
    'utf8'
  );
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'module.exports = {};', 'utf8');

  if (storySource !== null) {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'Comp.stories.tsx'), storySource, 'utf8');
  }
  return root;
}

// Fake Metro resolver context: every import resolves to the real module's path.
function makeContext(root: string, realPath: string) {
  return {
    originModulePath: path.join(root, 'src', 'Screen.tsx'),
    resolveRequest: () => ({ type: 'sourceFile', filePath: realPath }),
  };
}

function realModulePathIn(root: string): string {
  return path.join(root, 'node_modules', 'expo-localization', 'index.js');
}

describe('a mock is declared by its import expression', () => {
  it('a mock is typed by the module its import expression names', () => {
    expect(typeErrorsIn(storyDeclaring(`{ whoAmI: () => 'Ada Lovelace' }`))).toBe('');

    // An export the module does not have, and an export of the wrong shape, are both refused.
    expect(typeErrorsIn(storyDeclaring(`{ whoAmIi: () => 'Ada Lovelace' }`))).toContain('whoAmIi');
    expect(typeErrorsIn(storyDeclaring(`{ whoAmI: 42 }`))).toContain(
      "Type 'number' is not assignable to type '() => string'"
    );
  });

  it('a mock declares a default export against the type of the module default', () => {
    expect(typeErrorsIn(storyDeclaring(`{ default: { label: 'Ada Lovelace' } }`))).toBe('');

    expect(typeErrorsIn(storyDeclaring(`{ default: { label: 42 } }`))).toContain(
      "Type 'number' is not assignable to type 'string'"
    );
  });

  it('a factory receives the real module typed as the module its import expression names', () => {
    expect(
      typeErrorsIn(storyDeclaring(`(original) => ({ whoAmI: () => original.whoAmI() + '!' })`))
    ).toBe('');

    expect(
      typeErrorsIn(storyDeclaring(`(original) => ({ whoAmI: () => original.whoIsIt() })`))
    ).toContain('whoIsIt');
  });

  it('the declaration resolves the module name at runtime through the shim, never by calling a string key', async () => {
    const shim = createMockable('pkg/who-am-i', { whoAmI: () => 'real' });

    // The importer's own text names a DIFFERENT module than the shim it hands back. The name
    // that survives is the shim's answer, so nothing here was read as a string.
    const declaration = mock(() => Promise.resolve(shim) /* import('a-module-nobody-mocked') */, {
      whoAmI: () => 'mocked',
    });

    const resolved = await resolveDeclarations([declaration]);

    expect(Object.keys(resolved)).toEqual(['pkg/who-am-i']);

    activateStoryMocks(resolved);
    expect(shim.whoAmI()).toBe('mocked');
  });

  it('reads the shim through the default export Babel interop hands a CommonJS module', async () => {
    const shim = createMockable('pkg/interop', { whoAmI: () => 'real' });

    // What `import('pkg/interop')` yields when the shim is CommonJS: a fresh namespace object
    // that keeps the module itself under `default`.
    const resolved = await resolveDeclarations([
      mock(() => Promise.resolve({ default: shim }), { default: { whoAmI: () => 'mocked' } }),
    ]);

    expect(Object.keys(resolved)).toEqual(['pkg/interop']);
  });

  it('warns about a declaration whose import reached no shim, like any unshimmed module', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Nothing redirected this import, so the module it yields answers with no name at all.
    const declaration = mock(() => Promise.resolve({ whoAmI: () => 'real' }), {
      whoAmI: () => 'mocked',
    });

    activateStoryMocks(await resolveDeclarations([declaration]));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('mock declared but unshimmed');
  });

  it('the object form keyed by strings is still accepted, untyped', async () => {
    // Any module name, any shape, and TypeScript says nothing about either.
    expect(
      typeErrorsIn(`
        import { StoryMocks } from '${MOCK_MODULE}';
        export const mocks: StoryMocks = { 'a-module-nobody-declared': { anything: 1 } };
      `)
    ).toBe('');

    const shim = createMockable('pkg/legacy', { label: 'real' });
    activateStoryMocks({ 'pkg/legacy': { label: 'from the object form' } });
    expect(shim.label).toBe('from the object form');

    // And it merges beside declarations, the later level still winning the module.
    const declaration = mock(() => Promise.resolve(shim), { label: 'from the declaration' });
    const merged = mergeStoryMocks({ 'pkg/legacy': { label: 'from the object form' } }, {}, [
      declaration,
    ]);

    activateStoryMocks(await resolveDeclarations(declarationsOf(merged)));
    expect(shim.label).toBe('from the declaration');
  });
});

describe('the bundler scan reads the import expression', () => {
  it('collects the module named by an import expression under sherlo mocks', () => {
    const source = `
      export const Basic = {
        parameters: {
          sherlo: {
            mocks: [mock(() => import('expo-localization'), { getLocales: () => [] })],
          },
        },
      };
    `;

    expect(mockScan.collectMockKeysFromSource(source)).toEqual(['expo-localization']);
  });

  it('collects the import expression from every level: preview, meta and story', () => {
    const source = `
      const preview = {
        parameters: { sherlo: { mocks: [mock(() => import('./src/clock'), {})] } },
      };
      export default preview;

      const meta = {
        title: 'Button',
        parameters: { sherlo: { mocks: [mock(() => import('expo-localization'), {})] } },
      };

      export const Basic = {
        parameters: { sherlo: { mocks: [mock(() => import('@scope/pkg'), {})] } },
      };
    `;

    expect(mockScan.collectMockKeysFromSource(source).sort()).toEqual([
      './src/clock',
      '@scope/pkg',
      'expo-localization',
    ]);
  });

  it('ignores an import whose specifier is not a string literal', () => {
    const source = `
      const composedName = 'expo-' + 'localization';
      export const Basic = {
        parameters: {
          sherlo: {
            mocks: [mock(() => import(composedName), {}), mock(() => import('@scope/pkg'), {})],
          },
        },
      };
    `;

    // Only the literal is a module the build can see; the composed name is left to mockModules.
    expect(mockScan.collectMockKeysFromSource(source)).toEqual(['@scope/pkg']);
  });
});

describe('a library that wraps a native module', () => {
  it('a library that wraps a native module is mocked like any module', async () => {
    const realStorage = {
      __esModule: true,
      default: { getItem: async () => 'real', setItem: async () => undefined },
    };
    const shim = createMockable('@react-native-async-storage/async-storage', realStorage) as {
      default: { getItem: () => Promise<string>; setItem: () => Promise<void> };
    };

    const declaration = mock(
      () => Promise.resolve(shim) /* import('@react-native-async-storage/async-storage') */,
      (original) => ({
        default: { ...original.default, getItem: async () => 'Hello from the mock' },
      })
    );

    activateStoryMocks(await resolveDeclarations([declaration]));

    // The library's own default export answers with the mock, and the export the story left
    // alone is still the library's real one.
    await expect(shim.default.getItem()).resolves.toBe('Hello from the mock');
    expect(shim.default.setItem).toBe(realStorage.default.setItem);
  });
});

describe('the mock layer is always on', () => {
  it('the mock layer is installed with no option named', () => {
    const root = makeProject(
      `export const S = { parameters: { sherlo: { mocks: [mock(() => import('expo-localization'), {})] } } };`
    );

    // No second argument at all: nothing turns mocking on, because nothing turns it off.
    const config = applySherloTransforms({ projectRoot: root, resolver: {} });
    const resolved = config.resolver.resolveRequest(
      makeContext(root, realModulePathIn(root)),
      'expo-localization',
      'ios'
    );
    const isShim = fs.existsSync(resolved.filePath);
    fs.rmSync(root, { recursive: true, force: true });

    expect(resolved.filePath).toContain(MOCKS_DIR_FRAGMENT);
    expect(isShim).toBe(true);
  });

  it('mockModules still registers a key the scan cannot see', () => {
    // No story declares anything - the name is composed at runtime, so the config names it.
    const root = makeProject(null);

    const config = applySherloTransforms(
      { projectRoot: root, resolver: {} },
      { mockModules: ['expo-localization'] }
    );
    const resolved = config.resolver.resolveRequest(
      makeContext(root, realModulePathIn(root)),
      'expo-localization',
      'ios'
    );
    fs.rmSync(root, { recursive: true, force: true });

    expect(resolved.filePath).toContain(MOCKS_DIR_FRAGMENT);
  });

  it('a project with no mocks declared emits no shim and pays no bundle', () => {
    const root = makeProject(`export const S = { parameters: {} };`);

    const config = applySherloTransforms({ projectRoot: root, resolver: {} });
    const realPath = realModulePathIn(root);
    const resolved = config.resolver.resolveRequest(
      makeContext(root, realPath),
      'expo-localization',
      'ios'
    );
    const mocksDirExists = fs.existsSync(path.join(root, 'node_modules', MOCKS_DIR_FRAGMENT));
    fs.rmSync(root, { recursive: true, force: true });

    expect(mocksDirExists).toBe(false); // no shim emitted
    expect(resolved.filePath).toBe(realPath); // no redirect - the import reaches the real module
  });
});
