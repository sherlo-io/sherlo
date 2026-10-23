// What the bundler's mock scan saw reaches run time as a polyfill (metro/mockShims.js,
// writeDeclaredImportsPolyfill), and is what a failed mock is named by (src/mocking/declaredImports.ts):
// a declaration made by import names its module by a path the story never wrote.

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

import { createLazyMockable } from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, markStorySettled, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { readStoryError } from '../../getStorybook/storyErrorRegistry';
import { startStorybookHolding } from './storybookHolding';

const applySherloTransforms = require('../../../metro/applySherloTransforms');

type DeclaredImports = { storyFiles: Record<string, unknown>; mockedModules: string[] };

// A project whose story declares two mocks as a list: one module that exists, and one that did not
// exist yet when the bundler started.
function projectDeclaringTwoImports(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-declared-imports-'));
  fs.mkdirSync(path.join(root, 'src', 'stories'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'whoAmI.js'), 'exports.whoAmI = () => "real";\n');
  fs.writeFileSync(
    path.join(root, 'src', 'stories', 'Chat.stories.tsx'),
    "import { mock } from '@sherlo/react-native-storybook/mocking';\n" +
      'export const Default = { parameters: { sherlo: { mocks: [\n' +
      "  mock(() => import('../whoAmI'), { whoAmI: () => 'mocked' }),\n" +
      "  mock(() => import('../receipts'), { markRead: () => 'mocked' }),\n" +
      '] } } };\n'
  );
  return root;
}

// The bundle runs the polyfill as it starts: here, in this global scope.
function startTheBundleOf(root: string): DeclaredImports {
  const polyfills: string[] = applySherloTransforms({ projectRoot: root }).serializer.getPolyfills(
    {}
  );
  const declaredImportsPolyfill = polyfills.find((file) => file.endsWith('declared-imports.js'));
  vm.runInThisContext(fs.readFileSync(declaredImportsPolyfill as string, 'utf8'));
  return (globalThis as { __sherloDeclaredImports?: DeclaredImports })
    .__sherloDeclaredImports as DeclaredImports;
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  delete (globalThis as { __sherloDeclaredImports?: unknown }).__sherloDeclaredImports;
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  vi.restoreAllMocks();
});

describe("a story's declared mocks", () => {
  it('a story declaring its mocks as a list names each module as the story wrote it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const root = projectDeclaringTwoImports();
    const declaredImports = startTheBundleOf(root);
    fs.rmSync(root, { recursive: true, force: true });

    // The one module the bundler made a stand-in for is named by its path, not as the story wrote it.
    expect(declaredImports.mockedModules).toHaveLength(1);
    const whoAmIKey = declaredImports.mockedModules[0];
    expect(path.isAbsolute(whoAmIKey)).toBe(true);

    // At run time the first import reaches its stand-in, the second the real module; the story
    // renders without reading either.
    const whoAmI = createLazyMockable(whoAmIKey, () => ({ whoAmI: () => 'real' }));
    startStorybookHolding([
      {
        importPath: './src/stories/Chat.stories.tsx',
        title: 'Chat',
        fileExports: {
          default: { title: 'Chat' },
          Default: {
            parameters: {
              sherlo: {
                mocks: [
                  mock(() => Promise.resolve(whoAmI), { whoAmI: () => 'mocked' }),
                  mock(() => Promise.resolve({ markRead: () => 'real' }), { markRead: () => 'x' }),
                ],
              },
            },
          },
        },
        stories: [{ id: 'chat--default', name: 'Default' }],
      },
    ]);

    await activateMocksForStory('chat--default');
    // The story's stillness check ran: every read its render makes is in.
    markStorySettled();

    expect(readStoryError('chat--default')).toMatchObject({
      name: 'MockedModuleError',
      message:
        'the mock of ../whoAmI did not apply: nothing in the story imported it\n' +
        'the mock of ../receipts did not apply: the bundler had not seen this module when it started - restart the bundler',
    });
  });
});
