// A factory mock over a module that throws as it loads, run inside Metro's own module runtime. On
// the phone, a module first required outside any other module's evaluation - by the story's import
// of it, or by its render under inlineRequires - goes through Metro's guardedLoadModule: what the
// module threw is handed to ErrorUtils.reportFatalError (LogBox's "Uncaught Error") and the require
// answers undefined instead of throwing.

const { mockGetMode } = vi.hoisted(() => ({ mockGetMode: vi.fn() }));

vi.mock('../../SherloModule', () => ({
  default: { getMode: mockGetMode, getConfigOrDefault: () => ({}) },
}));

vi.mock('../../helpers/RunnerBridge', () => ({
  default: { log: vi.fn(), send: vi.fn() },
}));

import * as fs from 'fs';
import { createLazyMockable } from '../../mocking/createMockable';
import { mock } from '../../mocking/mockDeclaration';
import { clearMocks, __resetShimmedKeysForTests } from '../../mocking/registry';
import { activateMocksForStory } from '../../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../../getStorybook/storybookFacts';
import { clearStoryError, readStoryError } from '../../getStorybook/storyErrorRegistry';
import { startStorybookHolding } from './storybookHolding';

const STORY_FILE = './src/Chat.stories.tsx';
const STORY_ID = 'chat--default';
const PUSH = 'components/provider/Chat/push';
const SHIM_ID = 0;
const PUSH_ID = 1;

type MetroGlobal = typeof globalThis & {
  __r: ((moduleId: number) => Record<string, unknown>) & {
    importAll: (moduleId: number) => Record<string, unknown>;
  };
  __d: (factory: (...args: never[]) => void, moduleId: number, dependencyMap: number[]) => void;
  ErrorUtils?: { reportFatalError: (error: unknown) => void };
  __sherloDeclaredImports?: unknown;
};
const metro = globalThis as MetroGlobal;

const metroRuntimeSource = fs.readFileSync(
  require.resolve('metro-runtime/src/polyfills/require.js'),
  'utf8'
);

// A bundle holding the push module's shim and the push module itself, under Metro's runtime as a
// release build runs it. What the runtime hands ErrorUtils is what LogBox would show as uncaught.
function bundleWithAThrowingPushModule(): { reportedAsUncaught: unknown[] } {
  const reportedAsUncaught: unknown[] = [];
  metro.ErrorUtils = { reportFatalError: (error) => reportedAsUncaught.push(error) };
  // eslint-disable-next-line no-new-func
  new Function('global', '__DEV__', '__METRO_GLOBAL_PREFIX__', metroRuntimeSource)(
    metro,
    false,
    ''
  );

  // The shim metro/mockShims.js writes: a stand-in that requires the real module on first use.
  metro.__d(
    (_global: unknown, require: (id: number) => unknown, ...rest: unknown[]) => {
      const [, , module, , dependencyMap] = rest as [
        unknown,
        unknown,
        { exports: unknown },
        unknown,
        number[],
      ];
      module.exports = createLazyMockable(PUSH, () => require(dependencyMap[0]) as never);
    },
    SHIM_ID,
    [PUSH_ID]
  );
  // push.ts: a native module the build did not link, read at module scope.
  metro.__d(
    () => {
      throw new Error('push native module is not linked');
    },
    PUSH_ID,
    []
  );
  return { reportedAsUncaught };
}

// The fixture story: a factory mock over the push module, imported the way Metro bundles import().
function storyMockingPush(): string {
  metro.__sherloDeclaredImports = { storyFiles: { [STORY_FILE]: [] }, mockedModules: [PUSH] };
  const pushMock = mock(
    () => Promise.resolve().then(() => metro.__r.importAll(SHIM_ID)),
    (real: Record<string, unknown>) => ({ ...real, registerPush: () => 'mocked push' })
  );
  startStorybookHolding([
    {
      importPath: STORY_FILE,
      title: 'Chat',
      fileExports: {
        default: { title: 'Chat' },
        Default: { parameters: { sherlo: { mocks: [pushMock] } } },
      },
      stories: [{ id: STORY_ID, name: 'Default' }],
    },
  ]);
  return STORY_ID;
}

// The story renders: its component reads the push module, which the app catches if it throws.
function renderReadsPush(): unknown {
  try {
    return metro.__r(SHIM_ID).registerPush;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  mockGetMode.mockReturnValue('testing');
});

afterEach(() => {
  clearMocks();
  clearStoryError(STORY_ID);
  __resetShimmedKeysForTests();
  __resetStorybookFactsForTests();
  const bundleGlobals = ['__r', '__d', '__c', '__registerSegment', 'ErrorUtils'];
  [...bundleGlobals, '__sherloDeclaredImports'].forEach((name) => {
    delete (metro as unknown as Record<string, unknown>)[name];
  });
});

describe("a mocked module whose real import throws, in Metro's runtime", () => {
  it('a factory mock whose real import throws fails with a MockedModuleError naming the module and the real error', async () => {
    bundleWithAThrowingPushModule();
    const storyId = storyMockingPush();
    const expectedMessage = `${PUSH} could not be mocked: its real import threw "push native module is not linked"`;

    await activateMocksForStory(storyId);
    const thrown = renderReadsPush();

    expect(thrown).toMatchObject({ name: 'MockedModuleError', message: expectedMessage });
    expect((thrown as { cause?: unknown }).cause).toMatchObject({
      message: 'push native module is not linked',
    });
    expect(readStoryError(storyId)).toMatchObject({
      name: 'MockedModuleError',
      message: expectedMessage,
    });
  });

  it("the real module's error does not escape uncaught", async () => {
    const { reportedAsUncaught } = bundleWithAThrowingPushModule();
    const storyId = storyMockingPush();

    await activateMocksForStory(storyId);
    renderReadsPush();

    expect(reportedAsUncaught).toEqual([]);
  });
});
