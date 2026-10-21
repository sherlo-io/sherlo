// Spike resolve-like-metro: the build-time manifest (story file -> the modules it declares a mock for
// by import) reaching run time, and the failure it lets name a module whose import reached no stand-in.

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode, getConfigOrDefault: () => ({}) },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vm from 'vm';

import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { mock } from '../../mocking/mockDeclaration';
import { activateMocksForStory, storyFailureOf } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { startStorybookHolding } from './storybookHolding';

const applySherloTransforms = require('../../../metro/applySherloTransforms');

function projectDeclaringAnImport(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-'));
  fs.mkdirSync(path.join(root, 'src', 'stories'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'whoAmI.js'), 'exports.whoAmI = () => "real";\n');
  fs.writeFileSync(
    path.join(root, 'src', 'stories', 'Chat.stories.tsx'),
    "import { mock } from '@sherlo/react-native-storybook/mocking';\n" +
      "export const Default = { parameters: { sherlo: { mocks: [mock(() => import('../whoAmI'), { whoAmI: () => 'mocked' })] } } };\n"
  );
  return root;
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
});

afterEach(() => {
  clearMocks();
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
  vi.restoreAllMocks();
});

describe('the declared-imports manifest', () => {
  it('the config writes it as a polyfill the bundle carries, keyed by the path Storybook knows the story file by', () => {
    const root = projectDeclaringAnImport();
    const result = applySherloTransforms({ projectRoot: root });
    const polyfills: string[] = result.serializer.getPolyfills({});
    const manifestPolyfill = polyfills.find((file) => file.endsWith('declared-imports.js'));
    const content = fs.readFileSync(manifestPolyfill as string, 'utf8');
    fs.rmSync(root, { recursive: true, force: true });

    expect(manifestPolyfill).toBeDefined();
    expect(content).toContain('"./src/stories/Chat.stories.tsx":["../whoAmI"]');
  });

  it('a project that declares no mock by import gets no polyfill for it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-'));
    const result = applySherloTransforms({ projectRoot: root });
    const polyfills: string[] = result.serializer.getPolyfills({});
    fs.rmSync(root, { recursive: true, force: true });

    expect(polyfills.some((file) => file.endsWith('declared-imports.js'))).toBe(false);
  });

  it('a list-form declaration whose import reached no stand-in fails the story, naming the module it imported', async () => {
    const root = projectDeclaringAnImport();
    const result = applySherloTransforms({ projectRoot: root });
    const polyfills: string[] = result.serializer.getPolyfills({});
    const manifestPolyfill = polyfills.find((file) => file.endsWith('declared-imports.js'));
    // The bundle runs the polyfill at start-up: here, in this global scope.
    vm.runInThisContext(fs.readFileSync(manifestPolyfill as string, 'utf8'));
    fs.rmSync(root, { recursive: true, force: true });

    // At run time the import came back as the real module, no stand-in: nothing redirected it.
    startStorybookHolding([
      {
        importPath: './src/stories/Chat.stories.tsx',
        title: 'Chat',
        fileExports: {
          default: { title: 'Chat' },
          Default: {
            parameters: {
              sherlo: {
                mocks: [mock(() => Promise.resolve({ whoAmI: () => 'real' }), { whoAmI: () => 'x' })],
              },
            },
          },
        },
        stories: [{ id: 'chat--default', name: 'Default' }],
      },
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await activateMocksForStory('chat--default');
    const failure = storyFailureOf('chat--default');

    expect(failure?.name).toBe('UnreachedMockError');
    expect(failure?.message).toContain('the module imported as "../whoAmI" in ./src/stories/Chat.stories.tsx');
    expect(failure?.message).toContain('reached no stand-in');
  });

  it('without the manifest the failure still says the import reached no stand-in, and what it declared', async () => {
    startStorybookHolding([
      {
        importPath: './src/Chat.stories.tsx',
        title: 'Chat',
        fileExports: {
          default: { title: 'Chat' },
          Default: {
            parameters: {
              sherlo: {
                mocks: [mock(() => Promise.resolve({ whoAmI: () => 'real' }), { whoAmI: () => 'x' })],
              },
            },
          },
        },
        stories: [{ id: 'chat--default', name: 'Default' }],
      },
    ]);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await activateMocksForStory('chat--default');
    const failure = storyFailureOf('chat--default');

    expect(failure?.name).toBe('UnreachedMockError');
    expect(failure?.message).toContain("whose name Sherlo's build did not record (declaring whoAmI)");
  });
});
