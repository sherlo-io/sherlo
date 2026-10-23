/**
 * A scene reaches a screen with no address the way a member does: its steps press a tab, then a
 * row, each once it is on screen and visible, and its `ready` ends the wait. A step that cannot be
 * played fails the story, naming the step.
 */
const { mockGetMode, mockLog } = vi.hoisted(() => ({ mockGetMode: vi.fn(), mockLog: vi.fn() }));

vi.mock('../SherloModule', () => ({
  default: { getMode: mockGetMode },
}));

vi.mock('../helpers/RunnerBridge', () => ({
  default: { log: mockLog, send: vi.fn() },
}));

import { rememberAppFiberRoots, rememberAppMetadataCollector } from '../appMetadata';
import { activateMocksForStory } from '../getStorybook/storyMockActivation';
import {
  clearStoryError,
  readStoryError,
  recordStoryError,
} from '../getStorybook/storyErrorRegistry';
import { __resetStorybookFactsForTests } from '../getStorybook/storybookFacts';
import { clearMocks } from '../mocking/registry';
import { __resetRequestsInFlightForTests } from '../mocking/requestsInFlight';
import type { InspectorDataNode, Metadata, WalkedFiber } from '../sealedCore/seam';
import { proveReadyAgain, stabilizeOnceReady } from '../storyReady';
import type { PlayStep } from '../types/types';
import { startStorybookHolding } from './mocking/storybookHolding';

const SCENE_ID = 'scenes-chat--signed-in';

/* ---- A small app: Discover with a tab bar, a chat list, a chat -------------------------------- */

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

/**
 * What Pressability does with a responder's grant and release: press in after its delay, and
 * `onPress` on a release that came after the grant.
 */
function pressable(name: string, onPress: () => void, delayPressInMs = 0): Record<string, any> {
  let granted = false;
  let pressedIn = false;
  return {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (event: any) => {
      event.persist();
      if (event.currentTarget == null) throw new Error('no currentTarget to measure');
      // TouchableOpacity's onPressIn reads the persisted grant event's phase (RN 0.77).
      if (event.dispatchConfig.registrationName !== 'onResponderGrant') {
        throw new Error('the grant event names another phase');
      }
      granted = true;
      setTimeout(() => (pressedIn = true), delayPressInMs);
    },
    onResponderRelease: (event: any) => {
      if (event.dispatchConfig.registrationName !== 'onResponderRelease') {
        throw new Error('the release event names another phase');
      }
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

function metadataOf(root: View): Metadata {
  const viewProps: Metadata['viewProps'] = {};
  const walk = (view: View) => {
    if (view.props?.testID) viewProps[view.tag] = { testID: view.props.testID };
    view.children?.forEach(walk);
  };
  walk(root);
  return { viewProps, texts: [], generations: [{ viewProps, texts: [] }] };
}

let views: () => View = appViews;

/* ---- The capture's side ------------------------------------------------------------------------ */

const nativeStabilize = vi.fn(async () => true);
const native = {
  getMode: () => 'testing' as const,
  stabilize: nativeStabilize,
  getInspectorData: vi.fn(async () => ({
    viewHierarchy: nativeNodeOf(views()),
    density: 1,
    fontScale: 1,
  })),
};

function stabilize(): Promise<boolean> {
  return stabilizeOnceReady(native).stabilize(3, 6, 500, 20_000, false, 0.02, true);
}

function holdScene(steps: PlayStep[], ready?: unknown): void {
  startStorybookHolding([
    {
      importPath: './src/Chat.stories.tsx',
      fileExports: {
        default: { title: 'scenes/Chat', parameters: { sherlo: { steps, ready } } },
        SignedIn: {},
      },
      stories: [{ id: SCENE_ID, name: 'Signed In' }],
    },
  ]);
}

const TO_THE_CHAT: PlayStep[] = [
  { press: 'Connections' },
  { press: 'connectionListItem' },
  { ready: { testID: 'chat.input.message', requestsIdle: false } },
];

beforeEach(() => {
  vi.useFakeTimers();
  mockGetMode.mockReturnValue('testing');
  screen = 'discover';
  pressed.length = 0;
  rowsOnScreen = [];
  views = appViews;
  rememberAppMetadataCollector(() => metadataOf(views()));
  rememberAppFiberRoots(() => [fiberOf(views(), null)]);
  nativeStabilize.mockClear();
  mockLog.mockClear();
  __resetRequestsInFlightForTests();
});

afterEach(() => {
  clearMocks();
  clearStoryError(SCENE_ID);
  rememberAppMetadataCollector(undefined);
  rememberAppFiberRoots(undefined);
  __resetStorybookFactsForTests();
  vi.useRealTimers();
});

describe('a scene that reaches the chat through the app', () => {
  it('presses the tab, waits for the rows, presses the first, and is photographed on the chat', async () => {
    holdScene(TO_THE_CHAT);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    // On the chat list, still loading: the row press waits for a row.
    expect(screen).toBe('chatList');
    expect(nativeStabilize).not.toHaveBeenCalled();

    rowsOnScreen = [
      { name: 'Ada', y: 100 },
      { name: 'Bo', y: 196 },
    ];
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toBe(true);
    expect(screen).toBe('chat');
    // Each press held past the row's 80 ms press-in delay, as a finger's tap does.
    expect(pressed).toEqual(['Connections', 'row Ada']);
    expect(nativeStabilize).toHaveBeenCalledTimes(1);
    expect(readStoryError(SCENE_ID)).toBeUndefined();
  });

  it('presses the topmost visible match, skipping one hidden or below the window', async () => {
    rowsOnScreen = [
      { name: 'Hidden', y: 100, visible: false },
      { name: 'Below', y: 900 },
      { name: 'Cy', y: 300 },
      { name: 'Bo', y: 196 },
    ];
    holdScene([{ press: 'Connections' }, { press: 'connectionListItem' }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await settled).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Bo']);
  });

  it('presses the index-th visible match from the top', async () => {
    rowsOnScreen = [
      { name: 'Cy', y: 300 },
      { name: 'Bo', y: 196 },
    ];
    holdScene([{ press: 'Connections' }, { press: { testID: 'connectionListItem', index: 1 } }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await settled).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Cy']);
  });

  it('presses a row by the name it shows, through the row that answers the touch', async () => {
    rowsOnScreen = [
      { name: 'Ada', y: 100 },
      { name: 'Bo', y: 196 },
    ];
    holdScene([{ press: 'Connections' }, { press: { text: 'Bo' } }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await settled).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Bo']);
  });

  it('plays the steps again on the next capture', async () => {
    rowsOnScreen = [{ name: 'Ada', y: 100 }];
    holdScene(TO_THE_CHAT);
    activateMocksForStory(SCENE_ID);
    const first = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await first).toBe(true);

    // The capture ends as the core ends one; the app was launched afresh for the next one.
    clearMocks();
    proveReadyAgain();
    screen = 'discover';
    const second = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await second).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Ada', 'Connections', 'row Ada']);
    expect(screen).toBe('chat');
  });
});

describe('a step that cannot be played', () => {
  it('fails the story naming the step and the view, and presses nothing after it', async () => {
    holdScene(TO_THE_CHAT);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(12_000);

    // The capture still runs its stillness check, and reports the story as one that threw.
    expect(await settled).toBe(true);
    expect(readStoryError(SCENE_ID)).toMatchObject({
      name: 'SherloStepError',
      message:
        `Story ${SCENE_ID} could not play step 2 of 3 (press testID "connectionListItem"): ` +
        'no visible view with testID "connectionListItem" after 10 s',
    });
    expect(pressed).toEqual(['Connections']);
  });

  it('names a ready step that times out', async () => {
    rowsOnScreen = [{ name: 'Ada', y: 100 }];
    holdScene([
      { press: 'Connections' },
      { ready: { testID: 'chatlist.header', timeoutMs: 2_000, requestsIdle: false } },
      { press: 'connectionListItem' },
    ]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await settled).toBe(true);
    expect(readStoryError(SCENE_ID)?.message).toBe(
      `Story ${SCENE_ID} could not play step 2 of 3 (ready): Story ${SCENE_ID} was not ready ` +
        'after 2 s: no view on screen has testID "chatlist.header".'
    );
    expect(pressed).toEqual(['Connections']);
  });

  it('fails a view nothing answers a press for', async () => {
    holdScene([{ press: 'Discover' }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBe(true);
    expect(readStoryError(SCENE_ID)?.message).toBe(
      `Story ${SCENE_ID} could not play step 1 of 1 (press testID "Discover"): ` +
        'nothing at the view answers a press (no responder and no onPress above it)'
    );
  });

  it('plays nothing for a story that already threw', async () => {
    holdScene(TO_THE_CHAT);
    activateMocksForStory(SCENE_ID);
    recordStoryError(SCENE_ID, { name: 'TypeError', message: 'x', stack: '', componentStack: '' });

    expect(await stabilize()).toBe(true);
    expect(pressed).toEqual([]);
    expect(readStoryError(SCENE_ID)?.name).toBe('TypeError');
  });
});

describe('a view no responder answers for', () => {
  it('is pressed through the nearest component above it that takes an onPress', async () => {
    const onPress = vi.fn();
    views = () => ({
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
    holdScene([{ press: 'gh.button' }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(500);
    expect(await settled).toBe(true);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(readStoryError(SCENE_ID)).toBeUndefined();
  });

  it('is pressed by the view that asks for the touch while it is captured, above the target', async () => {
    const captured = vi.fn();
    views = () => ({
      tag: 1,
      frame: WINDOW,
      props: {
        onStartShouldSetResponderCapture: () => true,
        onResponderGrant: captured,
        onResponderRelease: captured,
      },
      children: [
        {
          tag: 5,
          props: { testID: 'inner', ...pressable('inner', () => {}) },
          frame: { x: 0, y: 0, width: 100, height: 40 },
        },
      ],
    });
    holdScene([{ press: 'inner' }]);
    activateMocksForStory(SCENE_ID);

    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(500);
    expect(await settled).toBe(true);
    expect(captured).toHaveBeenCalledTimes(2);
    expect(pressed).toEqual([]);
  });
});
