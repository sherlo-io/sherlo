// A scene reaches a screen with no address the way a member does: its steps tap a tab, then a row,
// or open the app's own link, each once its target is on screen and drawn. A step that cannot be
// played throws, naming the step. The app here is small: Discover with a tab bar, a chat list, a chat.

const { views, scene, nativeTree } = vi.hoisted(() => ({
  views: { now: undefined as unknown as () => any },
  scene: { play: [] as unknown[], ready: undefined as unknown },
  nativeTree: { readable: true },
}));

vi.mock('../SherloModule', () => ({
  default: {
    getMode: () => 'testing',
    getConfigOrDefault: () => ({}),
    getInspectorData: async () => {
      if (!nativeTree.readable) throw new Error('no view tree');
      return { viewHierarchy: nativeNodeOf(views.now()), density: 1, fontScale: 1 };
    },
    getViewVisibility: async (testIDs: string[]) => {
      const drawn = new Set<string>();
      const collect = (view: View) => {
        if (view.visible === false) return;
        if (view.props?.testID) drawn.add(view.props.testID);
        view.children?.forEach(collect);
      };
      collect(views.now());
      return Object.fromEntries(testIDs.map((id) => [id, drawn.has(id) ? 'visible' : 'absent']));
    },
  },
}));

vi.mock('../helpers/RunnerBridge', () => ({ default: { log: vi.fn(), send: vi.fn() } }));

vi.mock('../bundledScenes', () => ({
  default: {
    'chat--conversation': {
      filePath: './src/chat.scenes.tsx',
      sceneName: 'Conversation',
      loadFile: () => ({
        default: { scenes: { Conversation: { play: scene.play, ready: scene.ready } } },
      }),
    },
  },
}));

import SherloModule from '../SherloModule';
import { rememberStoryOfTheApp } from '../componentNames';
import { activateMocksForStory } from '../getStorybook/storyMockActivation';
import { __resetStorybookFactsForTests } from '../getStorybook/storybookFacts';
import createMockable from '../mocking/createMockable';
import { mock } from '../mocking/mockDeclaration';
import { startStorybookHolding } from './mocking/storybookHolding';
import { __resetRequestsInFlightForTests } from '../mocking/requestsInFlight';
import { clearMocks } from '../mocking/registry';
import { playSteps, SherloStepError, TAP_LOOKS_FOR_MS } from '../playSteps';
import { reachedRoute } from '../reachedScreen';
import type { InspectorDataNode, WalkedFiber } from '../sealedCore/seam';
import { stabilizeOnceReady, storyAboutToRender } from '../storyReady';
import { __setOpenURL } from './__mocks__/react-native';

const SCENE_ID = 'chat--conversation';

/** One view of the app: what React holds (props) and what native code draws (frame, visible). */
type View = {
  tag: number;
  type?: string;
  props?: Record<string, any>;
  text?: string;
  frame?: { x: number; y: number; width: number; height: number };
  visible?: boolean;
  children?: View[];
  /** A component between this view and its parent, with these props (a gesture-handler button). */
  composite?: Record<string, any>;
};

let screen: 'discover' | 'chatList' | 'chat' = 'discover';
const pressed: string[] = [];
const WINDOW = { x: 0, y: 0, width: 390, height: 844 };

/** What Pressability does with a responder's grant and release: `onPress` after a grant. */
function pressable(name: string, onPress: () => void, delayPressInMs = 0): Record<string, any> {
  let granted = false;
  let pressedIn = false;
  return {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (event: any) => {
      event.persist();
      if (event.currentTarget == null) throw new Error('no currentTarget to measure');
      granted = true;
      setTimeout(() => (pressedIn = true), delayPressInMs);
    },
    onResponderRelease: () => {
      if (!granted) throw new Error('Pressability: release without a grant');
      pressed.push(`${name}${pressedIn ? '' : ' (released before press-in)'}`);
      granted = false;
      onPress();
    },
  };
}

let rowsOnScreen: { name: string; y: number; visible?: boolean }[] = [];

function appViews(): View {
  const tabBar: View = {
    tag: 10,
    frame: { x: 0, y: 760, width: 390, height: 84 },
    children: [
      { tag: 11, props: { testID: 'Discover' }, frame: { x: 0, y: 760, width: 97, height: 84 } },
      {
        tag: 12,
        props: {
          testID: 'Connections',
          accessibilityLabel: 'Connections tab',
          ...pressable('Connections', () => (screen = 'chatList')),
        },
        frame: { x: 195, y: 760, width: 97, height: 84 },
      },
    ],
  };
  const rows: View[] = rowsOnScreen.map((row, index) => ({
    tag: 100 + index,
    props: {
      testID: 'connectionListItem',
      ...pressable(`row ${row.name}`, () => (screen = 'chat'), 80),
    },
    frame: { x: 0, y: row.y, width: 390, height: 96 },
    visible: row.visible,
    children: [
      {
        tag: 200 + index,
        type: 'RCTText',
        text: row.name,
        frame: { x: 80, y: row.y + 16, width: 200, height: 20 },
      },
    ],
  }));
  const body: Record<typeof screen, View[]> = {
    discover: [{ tag: 2, props: { testID: 'discover.card' } }, tabBar],
    chatList: [{ tag: 3, props: { testID: 'chatlist' }, children: rows }, tabBar],
    chat: [{ tag: 4, props: { testID: 'chat.input.message' } }],
  };
  return { tag: 1, frame: WINDOW, children: body[screen] };
}

/** The fibers React would hold for `view`: host fibers, with a composite where the view has one. */
function fiberOf(view: View, parent: WalkedFiber | null): WalkedFiber {
  const host: WalkedFiber = {
    type: view.type ?? 'RCTView',
    pendingProps: view.props ?? {},
    memoizedProps: view.props ?? {},
    stateNode: { canonical: { nativeTag: view.tag, publicInstance: { tag: view.tag } } },
    return: parent,
  };
  let top = host;
  if (view.composite) {
    top = { type: () => null, pendingProps: view.composite, memoizedProps: view.composite };
    top.return = parent;
    top.child = host;
    host.return = top;
  }
  let previous: WalkedFiber | undefined;
  for (const child of view.children ?? []) {
    const fiber = fiberOf(child, host);
    if (previous) previous.sibling = fiber;
    else host.child = fiber;
    previous = fiber;
  }
  if (view.text !== undefined) {
    host.child = { type: null, pendingProps: view.text, memoizedProps: view.text, return: host };
  }
  return top;
}

function nativeNodeOf(view: View, parentFrame = WINDOW): InspectorDataNode {
  const frame = view.frame ?? parentFrame;
  return {
    id: view.tag,
    className: 'RCTViewComponentView',
    isVisible: view.visible !== false,
    ...frame,
    children: (view.children ?? []).map((child) => nativeNodeOf(child, frame)),
  };
}

/** The app: a navigation container's provider over the views of the screen now on. */
function appRoot(): WalkedFiber {
  const stateOf = {
    discover: { index: 0, routes: [{ name: 'Discover' }] },
    chatList: {
      index: 0,
      routes: [{ name: 'Chats', state: { index: 0, routes: [{ name: 'List' }] } }],
    },
    chat: {
      index: 0,
      routes: [
        { name: 'Chats', state: { index: 1, routes: [{ name: 'List' }, { name: 'Chat' }] } },
      ],
    },
  };
  const props = { value: { getRootState: () => stateOf[screen] } };
  const root: WalkedFiber = { type: () => null, pendingProps: props, memoizedProps: props };
  // The views are built when asked, so they are always those of the screen now on.
  Object.defineProperty(root, 'child', { get: () => fiberOf(views.now(), root) });
  return root;
}

const nativeStabilize = vi.fn(async () => true);
const native = { stabilize: nativeStabilize, getViewVisibility: SherloModule.getViewVisibility };

function stabilize(): Promise<boolean> {
  return stabilizeOnceReady(native).stabilize(3, 6, 500, 20_000, false, 0.02, true);
}

beforeEach(() => {
  vi.useFakeTimers();
  screen = 'discover';
  pressed.length = 0;
  rowsOnScreen = [];
  views.now = appViews;
  nativeTree.readable = true;
  scene.play = [];
  scene.ready = undefined;
  rememberStoryOfTheApp(appRoot());
  __setOpenURL(async () => {});
  nativeStabilize.mockClear();
  __resetRequestsInFlightForTests();
  storyAboutToRender(SCENE_ID);
});

afterEach(() => {
  clearMocks();
  __resetStorybookFactsForTests();
  rememberStoryOfTheApp(undefined);
  vi.useRealTimers();
});

/** Run `playSteps` to its end, letting the fake clock run. */
async function played(): Promise<string[]> {
  const result = playSteps(SCENE_ID);
  const settled = result.then(
    (steps) => steps,
    (error) => error
  );
  await vi.advanceTimersByTimeAsync(15_000);
  const outcome = await settled;
  if (outcome instanceof Error) throw outcome;
  return outcome;
}

describe('a scene plays its steps', () => {
  it('presses the tab, waits for the rows, presses the first, and is photographed on the chat', async () => {
    scene.play = [{ tap: 'Connections' }, { tap: 'connectionListItem' }];
    scene.ready = { testID: 'chat.input.message', requestsIdle: false };

    const steps = playSteps(SCENE_ID);
    await vi.advanceTimersByTimeAsync(1_000);
    // On the chat list, still loading: the row tap waits for a row.
    expect(screen).toBe('chatList');
    rowsOnScreen = [
      { name: 'Ada', y: 100 },
      { name: 'Bo', y: 196 },
    ];
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await steps).toEqual(['tap testID "Connections"', 'tap testID "connectionListItem"']);
    // Each tap held past the row's 80 ms press-in delay, as a finger's tap does.
    expect(pressed).toEqual(['Connections', 'row Ada']);
    expect(screen).toBe('chat');
    expect(reachedRoute()).toEqual(['Chats', 'Chat']);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBe(true);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
  });

  it('taps the topmost visible match, the index-th one, a text and an accessibility label', async () => {
    rowsOnScreen = [
      { name: 'Hidden', y: 100, visible: false },
      { name: 'Below', y: 900 },
      { name: 'Cy', y: 300 },
      { name: 'Bo', y: 196 },
    ];
    scene.play = [{ tap: { label: 'Connections tab' } }, { tap: 'connectionListItem' }];
    await played();
    expect(pressed).toEqual(['Connections', 'row Bo']);

    screen = 'chatList';
    scene.play = [{ tap: { testID: 'connectionListItem', index: 1 } }];
    await played();
    expect(pressed.at(-1)).toBe('row Cy');

    screen = 'chatList';
    scene.play = [{ tap: { text: 'Bo' } }];
    await played();
    expect(pressed.at(-1)).toBe('row Bo');
  });

  it('taps a view no responder answers for through the onPress above it', async () => {
    const onPress = vi.fn();
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 5,
          props: { testID: 'gh.button' },
          frame: { x: 0, y: 0, width: 100, height: 40 },
          composite: { onPress },
        },
      ],
    });
    scene.play = [{ tap: 'gh.button' }];
    await played();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('a step that cannot be played', () => {
  it('a step whose target never shows throws, naming the step', async () => {
    scene.play = [{ tap: 'Connections' }, { tap: 'connectionListItem' }];

    const error = await played().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(SherloStepError);
    expect(error.name).toBe('SherloStepError');
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 2 of 2 (tap testID "connectionListItem"): ` +
        'no visible view with testID "connectionListItem" after 5 s'
    );
    // The steps that did play are carried, so the record says how far the scene got.
    expect(error.played).toEqual(['tap testID "Connections"']);
    expect(pressed).toEqual(['Connections']);
  });

  it('a tap whose test id is on no view gives up after 5 seconds and reports the limit it waited', async () => {
    scene.play = [{ tap: 'inbox-menu-button' }];
    let outcome: unknown;
    playSteps(SCENE_ID).then(
      () => (outcome = 'played'),
      (error) => (outcome = error)
    );

    await vi.advanceTimersByTimeAsync(4_800);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(400);

    expect((outcome as Error).message).toContain('after 5 s');
    expect(TAP_LOOKS_FOR_MS).toBe(5_000);
  });

  it('throws for a view nothing answers a tap for, naming the step', async () => {
    scene.play = [{ tap: 'Discover' }];
    const error = await played().catch((thrown) => thrown);
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (tap testID "Discover"): ` +
        'nothing at the view answers a tap (no responder and no onPress above it)'
    );
  });

  it('throws for a ready step that times out, with the line that says what was missing', async () => {
    scene.play = [{ ready: { testID: 'chatlist.header', timeoutMs: 2_000, requestsIdle: false } }];
    const error = await played().catch((thrown) => thrown);
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (ready): Story ${SCENE_ID} was not ready ` +
        'after 2 s: no view on screen has testID "chatlist.header".'
    );
  });
});

describe('a scene that opens one of the app links', () => {
  /** The app's linking: myapp://chat opens the chat, as its navigation's url listener would. */
  function appHandlesLinks(): string[] {
    const opened: string[] = [];
    __setOpenURL(async (url) => {
      opened.push(url);
      if (!url.startsWith('myapp://')) throw new Error('Unable to open URL: ' + url);
      if (url === 'myapp://chat') screen = 'chat';
    });
    return opened;
  }

  it('an open step needs a ready after it, and a link the app does not take throws', async () => {
    const opened = appHandlesLinks();

    scene.play = [{ open: 'myapp://chat' }];
    const unguarded = await played().catch((thrown) => thrown);
    expect(unguarded.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (open myapp://chat): ` +
        "needs a ready after it (a ready step, or the scene's ready)"
    );
    expect(opened).toEqual([]);

    scene.ready = { testID: 'chat.input.message', requestsIdle: false };
    scene.play = [{ open: 'nobody://chat' }];
    const foreign = await played().catch((thrown) => thrown);
    expect(foreign.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (open nobody://chat): ` +
        'no app takes nobody://chat: Unable to open URL: nobody://chat'
    );

    scene.play = [{ open: 'chat' }];
    expect((await played().catch((thrown) => thrown)).message).toContain('"chat" is not a link');

    scene.play = [{ open: 'myapp://chat' }];
    expect(await played()).toEqual(['open myapp://chat']);
    expect(screen).toBe('chat');
  });

  it('throws when the app takes the link but its navigation routes nowhere', async () => {
    appHandlesLinks();
    scene.play = [
      { open: 'myapp://no-such-screen' },
      { ready: { testID: 'chat.input.message', requestsIdle: false, timeoutMs: 1_000 } },
    ];
    const error = await played().catch((thrown) => thrown);
    expect(error.message).toContain('could not play step 2 of 2 (ready)');
    expect(screen).toBe('discover');
  });
});

describe('the mocks of a scene are installing', () => {
  it('steps are never skipped while the mocks are still installing', async () => {
    // A mock declared by an import that resolves only later: the install is outstanding until then.
    const mockable = createMockable('pkg/late-install', { label: 'real' });
    let finishImport: (module: unknown) => void = () => {};
    const lateImport = new Promise((resolve) => (finishImport = resolve));
    startStorybookHolding([
      {
        importPath: './src/Chat.stories.tsx',
        fileExports: {
          default: { title: 'chat' },
          Conversation: {
            parameters: {
              sherlo: { mocks: [mock(() => lateImport as never, { label: 'm' } as never)] },
            },
          },
        },
        stories: [{ id: SCENE_ID, name: 'Conversation' }],
      },
    ]);
    // The path the core takes: activating the scene hands steps and stillness check the install.
    expect(activateMocksForStory(SCENE_ID)).toBeInstanceOf(Promise);
    scene.play = [{ tap: 'Connections' }];

    const steps = playSteps(SCENE_ID);
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(5_000);
    // Nothing tapped and nothing photographed while the install is outstanding.
    expect(pressed).toEqual([]);
    expect(nativeStabilize).not.toHaveBeenCalled();

    finishImport(mockable);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await steps).toEqual(['tap testID "Connections"']);
    expect(pressed).toEqual(['Connections']);
    expect(await settled).toBe(true);
  });
});
