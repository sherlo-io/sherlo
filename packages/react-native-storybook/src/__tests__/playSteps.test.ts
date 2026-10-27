// A scene reaches a screen with no address the way a member does: its steps tap a tab, then a row,
// or open the app's own link, each once its target is on screen and drawn. A step that cannot be
// played throws, naming the step. The app here is small: Discover with a tab bar, a chat list, a chat.

// The type step lives in typeInto.ts; its tests are here, with the rest of the steps.

const { views, scene, nativeTree, nativeTouch, textCommands } = vi.hoisted(() => ({
  /** The text input's own commands, as the new architecture has them: every call is kept. */
  textCommands: { calls: [] as unknown[][], available: true },
  views: { now: undefined as unknown as () => any },
  scene: { play: [] as unknown[], ready: undefined as unknown },
  nativeTree: { readable: true },
  /** The native module's touch: none (a native build without it) unless a test lays one. */
  nativeTouch: { tap: undefined as undefined | ((x: number, y: number, holdMs: number) => any) },
}));
/** The native module's swipe: none (a native build from before it) unless a test lays one. */
const nativeSwipe = vi.hoisted(() => ({
  swipe: undefined as undefined | ((...line: number[]) => any),
}));

vi.mock('../SherloModule', () => ({
  default: {
    holdAnimationsStill: async () => false,
    tap: async (x: number, y: number, holdMs: number) =>
      nativeTouch.tap ? nativeTouch.tap(x, y, holdMs) : null,
    swipe: async (...line: number[]) => (nativeSwipe.swipe ? nativeSwipe.swipe(...line) : null),
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

vi.mock('../textInputCommands', () => ({
  textInputCommandsFor: () =>
    textCommands.available
      ? { setTextAndSelection: (...call: unknown[]) => textCommands.calls.push(call) }
      : undefined,
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
import { playSteps, SherloStepError, TAP_LOOKS_FOR_MS, testIDsOnScreen } from '../playSteps';
import { reachedRoute } from '../reachedScreen';
import type { InspectorDataNode, WalkedFiber } from '../sealedCore/seam';
import { stabilizeOnceReady, storyAboutToRender } from '../storyReady';
import { __setOpenURL, Platform } from './__mocks__/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

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
  /** What the view's public instance can do besides being a tag (a text field's setNativeProps). */
  instance?: Record<string, any>;
};

let screen: 'discover' | 'chatList' | 'chat' = 'discover';
const pressed: string[] = [];
const WINDOW = { x: 0, y: 0, width: 390, height: 844 };
/** The context providers wrapping the fake app's views, outermost first; none by default. */
const safeArea: { providers: { context: unknown; value: object }[] } = { providers: [] };
const INSETS = { top: 47, right: 0, bottom: 84, left: 0 };
/** A spacing context of the same shape as the insets, which is not the safe area. */
const SPACING_CONTEXT = { Provider: {}, displayName: 'SpacingContext' };

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
    stateNode: {
      canonical: { nativeTag: view.tag, publicInstance: { tag: view.tag, ...view.instance } },
    },
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
  Object.defineProperty(root, 'child', {
    get: () => {
      // The providers wrap the views, the first outermost: a context fiber, as React 19 renders it.
      let parent = root;
      let top: WalkedFiber | undefined;
      for (const { context, value } of safeArea.providers) {
        const provider: WalkedFiber = {
          type: context,
          pendingProps: { value },
          memoizedProps: { value },
          return: parent,
        };
        if (parent === root) top = provider;
        else parent.child = provider;
        parent = provider;
      }
      const built = fiberOf(views.now(), parent);
      if (!top) return built;
      parent.child = built;
      return top;
    },
  });
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
  nativeTouch.tap = undefined;
  nativeSwipe.swipe = undefined;
  safeArea.providers = [];
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

  it("a tap presses through the native touch at the target's centre, and a covered target or a phone that lacks the touch ends the step with its line", async () => {
    const touches: number[][] = [];
    let answer = {
      reachedReact: true,
      hitTag: 13,
      hitClass: 'RCTParagraphComponentView',
      missing: [] as string[],
    };
    nativeTouch.tap = async (x, y, holdMs) => {
      touches.push([x, y, holdMs]);
      return answer;
    };
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 12,
          props: { testID: 'Connections', ...pressable('Connections', () => {}) },
          frame: { x: 195, y: 600, width: 97, height: 60 },
          children: [
            {
              tag: 13,
              type: 'RCTText',
              text: 'Connections',
              frame: { x: 205, y: 620, width: 77, height: 20 },
            },
          ],
        },
        {
          tag: 99,
          props: { testID: 'modal.backdrop' },
          frame: { x: 0, y: 0, width: 390, height: 300 },
        },
      ],
    });
    scene.play = [{ tap: 'Connections' }];

    // The touch lands on the label inside the target, held as a finger holds: the step is done,
    // and no synthetic press is made beside it.
    expect(await played()).toEqual(['tap testID "Connections"']);
    expect(touches).toEqual([[243.5, 630, 150]]);
    expect(pressed).toEqual([]);

    const failed = async () => (await played().catch((thrown) => thrown)).message;
    const frame = `Scene ${SCENE_ID} could not play step 1 of 1 (tap testID "Connections"): `;
    const covered = (by: string) =>
      `the target is covered by ${by}, so the tap never reached it. ` +
      'Wait for the cover to close, or close it with a tap step before this one';
    answer = { ...answer, hitTag: 99, hitClass: 'RCTViewComponentView' };
    expect(await failed()).toBe(frame + covered('testID "modal.backdrop"'));
    // A native view over the app (no React view, no React recognizer) is named by its class.
    answer = { reachedReact: false, hitTag: -1, hitClass: 'UITransitionView', missing: [] };
    expect(await failed()).toBe(frame + covered('UITransitionView'));
    answer = { reachedReact: false, hitTag: -1, hitClass: '', missing: ['UIEvent._setHIDEvent:'] };
    expect(await failed()).toBe(
      frame +
        'Sherlo cannot tap on iOS 26.2 yet. Update Sherlo, or report it to Sherlo if the newest Sherlo still says this'
    );
    expect(pressed).toEqual([]);
  });

  it('a touch inside the target that no React recognizer took is no cover: the synthetic press stands in', async () => {
    tabAt(600);
    nativeTouch.tap = async () => ({
      reachedReact: false,
      hitTag: 12,
      hitClass: 'RCTViewComponentView',
      missing: [],
    });
    scene.play = [{ tap: 'Connections' }];
    expect(await played()).toEqual(['tap testID "Connections"']);
    expect(pressed).toEqual(['Connections']);
  });

  it("a long-press holds the native touch on the target's centre for its hold time", async () => {
    tabAt(600);
    const touches: number[][] = [];
    nativeTouch.tap = async (x, y, holdMs) => {
      touches.push([x, y, holdMs]);
      return { reachedReact: true, hitTag: 12, hitClass: 'RCTViewComponentView', missing: [] };
    };
    scene.play = [{ longPress: 'Connections' }];

    expect(await played()).toEqual(['long-press testID "Connections"']);
    expect(touches).toHaveLength(1);
    expect(touches[0][2]).toBe(800);
    expect(pressed).toEqual([]);
  });

  it('a long-press with no native touch calls the nearest onLongPress, held 800 ms', async () => {
    const longPressed: string[] = [];
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 12,
          props: { testID: 'Row', onLongPress: () => longPressed.push('Row') },
          frame: { x: 195, y: 600, width: 97, height: 60 },
        },
      ],
    });
    scene.play = [{ longPress: 'Row' }];

    expect(await played()).toEqual(['long-press testID "Row"']);
    expect(longPressed).toEqual(['Row']);
  });

  it("typed text reaches the field's change handler and shows in the field", async () => {
    const changed: string[] = [];
    const shown: Record<string, unknown>[] = [];
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 30,
          type: 'RCTSinglelineTextInputView',
          props: {
            testID: 'chat.input.message',
            mostRecentEventCount: 4,
            onChange: (event: any) => changed.push(event.nativeEvent.text),
          },
          instance: { setNativeProps: (props: Record<string, unknown>) => shown.push(props) },
          frame: { x: 0, y: 700, width: 390, height: 44 },
        },
      ],
    });
    scene.play = [{ type: { testID: 'chat.input.message', text: 'On my way' } }];

    expect(await played()).toEqual(['type testID "chat.input.message"']);
    expect(changed).toEqual(['On my way']);
    expect(shown).toEqual([{ text: 'On my way' }]);
  });

  describe('on the new architecture', () => {
    const fabric = globalThis as { nativeFabricUIManager?: unknown };
    const field = (instance: Record<string, any>, changed: string[]) => {
      views.now = () => ({
        tag: 1,
        frame: WINDOW,
        children: [
          {
            tag: 30,
            type: 'RCTSinglelineTextInputView',
            props: {
              testID: 'chat.input.message',
              mostRecentEventCount: 4,
              onChange: (event: any) => changed.push(event.nativeEvent.text),
            },
            instance,
            frame: { x: 0, y: 700, width: 390, height: 44 },
          },
        ],
      });
      scene.play = [{ type: { testID: 'chat.input.message', text: 'On my way' } }];
    };

    beforeEach(() => {
      fabric.nativeFabricUIManager = {};
      textCommands.calls = [];
      textCommands.available = true;
    });
    afterEach(() => {
      delete fabric.nativeFabricUIManager;
    });

    it("a type step on the new architecture sets the field's text through the text input's own command", async () => {
      const changed: string[] = [];
      const shown: unknown[] = [];
      field({ setNativeProps: (props: unknown) => shown.push(props) }, changed);

      expect(await played()).toEqual(['type testID "chat.input.message"']);
      expect(textCommands.calls).toHaveLength(1);
      expect(textCommands.calls[0].slice(1)).toEqual([4, 'On my way', -1, -1]);
      expect(shown).toEqual([]);
      expect(changed).toEqual(['On my way']);
    });

    it('a type step with no command and no setNativeProps ends with its line, never the typed text', async () => {
      textCommands.available = false;
      field({}, []);
      const error = await played().catch((thrown) => thrown);
      expect(error.message).toBe(
        `Scene ${SCENE_ID} could not play step 1 of 1 (type testID "chat.input.message"): ` +
          'this text field takes no native text, so nothing could be typed. Update React Native or point the step at another field.'
      );
      expect(error.message).not.toContain('On my way');
    });
  });

  it('a type step aimed at a view that is no text field ends with its line', async () => {
    tabAt(600);
    scene.play = [{ type: { testID: 'Connections', text: 'secret words' } }];
    const error = await played().catch((thrown) => thrown);
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (type testID "Connections"): ` +
        "not a text field, so nothing could be typed. Point the step at the text field's testID."
    );
    expect(error.message).not.toContain('secret words');
  });

  it("an Android tap presses through the native touch at the target's centre, and a covered target ends the step with its line", async () => {
    const touches: number[][] = [];
    let answer = {
      reachedReact: true,
      hitTag: 12,
      hitClass: 'com.facebook.react.views.view.ReactViewGroup',
      missing: [] as string[],
    };
    nativeTouch.tap = async (x, y, holdMs) => {
      touches.push([x, y, holdMs]);
      return answer;
    };
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 12,
          props: { testID: 'Connections', ...pressable('Connections', () => {}) },
          frame: { x: 195, y: 600, width: 97, height: 60 },
        },
        {
          tag: 99,
          props: { testID: 'modal.backdrop' },
          frame: { x: 0, y: 0, width: 390, height: 300 },
        },
      ],
    });
    scene.play = [{ tap: 'Connections' }];
    Platform.OS = 'android';
    try {
      // The touch lands on the target and is held as a finger holds: no synthetic press beside it.
      expect(await played()).toEqual(['tap testID "Connections"']);
      expect(touches).toEqual([[243.5, 630, 150]]);
      expect(pressed).toEqual([]);

      const failed = async () => (await played().catch((thrown) => thrown)).message;
      const frame = `Scene ${SCENE_ID} could not play step 1 of 1 (tap testID "Connections"): `;
      const covered = (by: string) =>
        `the target is covered by ${by}, so the tap never reached it. ` +
        'Wait for the cover to close, or close it with a tap step before this one';
      answer = { ...answer, hitTag: 99 };
      expect(await failed()).toBe(frame + covered('testID "modal.backdrop"'));
      answer = {
        reachedReact: false,
        hitTag: -1,
        hitClass: 'android.widget.PopupWindow$PopupDecorView',
        missing: [],
      };
      expect(await failed()).toBe(frame + covered('android.widget.PopupWindow$PopupDecorView'));
      expect(pressed).toEqual([]);
    } finally {
      Platform.OS = 'ios';
    }
  });

  it('a tap step logs one line with how it pressed, the point and what the touch hit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tapLines = () =>
      log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes(' tap by '));
    scene.play = [{ tap: 'Connections' }];

    // The native touch reached React: one line with the point, the target and the answer.
    tabAt(600);
    nativeTouch.tap = async () => ({
      reachedReact: true,
      hitTag: 12,
      hitClass: 'RCTViewComponentView',
      missing: [],
    });
    await played();
    expect(tapLines()).toEqual([
      '@sherlo/react-native-storybook: the bundler line scene chat--conversation step 1 of 1 tap by native touch at 243.5,630 target 12 hitClass RCTViewComponentView hitTag 12 reachedReact true',
    ]);

    // The touch answered null: the synthetic press.
    log.mockClear();
    nativeTouch.tap = async () => null;
    await played();
    expect(tapLines()).toEqual([
      '@sherlo/react-native-storybook: the bundler line scene chat--conversation step 1 of 1 tap by synthetic press at 243.5,630 target 12',
    ]);

    // The touch landed inside the target and no recognizer took it, and no responder is on the
    // way up: the nearest onPress answers.
    log.mockClear();
    const onPress = vi.fn();
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        {
          tag: 12,
          props: { testID: 'Connections', onPress },
          frame: { x: 195, y: 600, width: 97, height: 60 },
        },
      ],
    });
    nativeTouch.tap = async () => ({
      reachedReact: false,
      hitTag: 12,
      hitClass: 'RCTViewComponentView',
      missing: [],
    });
    await played();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(tapLines()).toEqual([
      '@sherlo/react-native-storybook: the bundler line scene chat--conversation step 1 of 1 tap by the nearest onPress at 243.5,630 target 12 hitClass RCTViewComponentView hitTag 12 reachedReact false',
    ]);
    log.mockRestore();
  });

  it('a swipe drags the native touch across the target in its direction', async () => {
    swipeRows();
    const swipes: number[][] = [];
    nativeSwipe.swipe = async (...line: number[]) => {
      swipes.push(line);
      return {
        reachedReact: true,
        hitTag: line[1] < 300 ? 50 : 51,
        hitClass: 'RCTView',
        missing: [],
      };
    };
    scene.play = [
      { swipe: { testID: 'row', direction: 'left' } },
      { swipe: { testID: 'row', direction: 'right', index: 1 } },
      { swipe: { testID: 'row', direction: 'up' } },
      { swipe: { testID: 'row', direction: 'down', index: 1 } },
    ];

    expect(await played()).toEqual([
      'swipe left testID "row"',
      'swipe right testID "row" #1',
      'swipe up testID "row"',
      'swipe down testID "row" #1',
    ]);
    // From the row's middle most of the way to its edge, at a finger's pace.
    expect(swipes).toEqual([
      [195, 250, 19.5, 250, 300],
      [195, 350, 370.5, 350, 300],
      [195, 250, 195, 205, 300],
      [195, 350, 195, 395, 300],
    ]);
    expect(pressed).toEqual([]);
  });

  it('a swipe on a phone whose Sherlo has no swipe ends with its line', async () => {
    swipeRows();
    scene.play = [{ swipe: { testID: 'row', direction: 'left' } }];
    const failed = async () => (await played().catch((thrown) => thrown)).message;
    const frame = `Scene ${SCENE_ID} could not play step 1 of 1 (swipe left testID "row"): `;

    expect(await failed()).toBe(
      frame + 'this app was built before swipes existed. Rebuild it with the newest Sherlo.'
    );
    // An iOS that lacks the touch's private calls ends the step as a tap does.
    nativeSwipe.swipe = async () => ({
      reachedReact: false,
      hitTag: -1,
      hitClass: '',
      missing: ['UITouch.setPhase:'],
    });
    expect(await failed()).toBe(
      frame +
        'Sherlo cannot swipe on iOS 26.2 yet. Update Sherlo, or report it to Sherlo if the newest Sherlo still says this'
    );
  });

  it('a swipe whose target is covered, or whose place on screen cannot be read, ends with its line', async () => {
    swipeRows();
    scene.play = [{ swipe: { testID: 'row', direction: 'left' } }];
    nativeSwipe.swipe = async () => ({
      reachedReact: true,
      hitTag: 99,
      hitClass: 'RCTView',
      missing: [],
    });
    const failed = async () => (await played().catch((thrown) => thrown)).message;
    const frame = `Scene ${SCENE_ID} could not play step 1 of 1 (swipe left testID "row"): `;

    expect(await failed()).toBe(
      frame +
        'the target is covered by testID "toast", so the swipe never reached it. ' +
        'Wait for the cover to close, or close it with a tap step before this one'
    );
    nativeTree.readable = false;
    expect(await failed()).toBe(
      frame + 'Sherlo could not read where the view is on screen, so it could not swipe it'
    );
  });
});

/** The app is two rows `row`, 100 points high, at y 200 and 300, and a toast at the top. */
function swipeRows(): void {
  const row = (tag: number, y: number): View => ({
    tag,
    props: { testID: 'row' },
    frame: { x: 0, y, width: 390, height: 100 },
  });
  views.now = () => ({
    tag: 1,
    frame: WINDOW,
    children: [
      row(50, 200),
      row(51, 300),
      { tag: 99, props: { testID: 'toast' }, frame: { x: 0, y: 100, width: 390, height: 60 } },
    ],
  });
}

/** The app is the one tab `Connections`, its top at `y`, 60 points high. */
function tabAt(y: number): void {
  views.now = () => ({
    tag: 1,
    frame: WINDOW,
    children: [
      {
        tag: 12,
        props: { testID: 'Connections', ...pressable('Connections', () => {}) },
        frame: { x: 195, y, width: 97, height: 60 },
      },
    ],
  });
}

describe('the test ids on screen', () => {
  it('lists each id once in screen order, drops off-screen views, caps the list and counts the rest', async () => {
    const row = (tag: number, id: string, y = 100): View => ({
      tag,
      props: { testID: id },
      frame: { x: 0, y, width: 390, height: 20 },
    });
    const ids = Array.from({ length: 52 }, (_, index) => 'row-' + index);
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        ...ids.slice(0, 10).map((id, index) => row(10 + index, id)),
        row(80, 'row-0'),
        row(81, 'below-the-fold', 900),
        ...ids.slice(10).map((id, index) => row(100 + index, id)),
      ],
    });

    const seen = await testIDsOnScreen(50);

    expect(seen.testIDs).toEqual(ids.slice(0, 50));
    expect(seen.more).toBe(2);
  });

  it('answers every id and nothing more when the list is under the cap', async () => {
    views.now = () => ({
      tag: 1,
      frame: WINDOW,
      children: [
        { tag: 2, props: { testID: 'a' } },
        { tag: 3, props: { testID: 'b' } },
      ],
    });

    await expect(testIDsOnScreen(50)).resolves.toEqual({ testIDs: ['a', 'b'], more: 0 });
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

  it("a tap whose view lies under the phone's navigation bar fails the step and says the view is under the phone's bars", async () => {
    safeArea.providers = [{ context: SafeAreaInsetsContext, value: INSETS }];
    scene.play = [{ tap: 'Connections' }];

    const error = await played().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(SherloStepError);
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (tap testID "Connections"): ` +
        "the view is there but under the phone's bars or off screen, so a tap cannot reach it; keep it inside the safe area"
    );
    expect(pressed).toEqual([]);
  });

  it('a tap whose view lies inside the safe area still taps', async () => {
    safeArea.providers = [{ context: SafeAreaInsetsContext, value: INSETS }];
    tabAt(676);
    scene.play = [{ tap: 'Connections' }];

    await played();

    expect(pressed).toEqual(['Connections']);
  });

  it('a context of the same shape as the insets does not put a view under the bars', async () => {
    safeArea.providers = [{ context: SPACING_CONTEXT, value: INSETS }];
    tabAt(780);
    scene.play = [{ tap: 'Connections' }];

    await played();

    expect(pressed).toEqual(['Connections']);
  });

  it('the nearest safe-area provider above the view gives the insets, not an outer one', async () => {
    safeArea.providers = [
      { context: SafeAreaInsetsContext, value: INSETS },
      { context: SafeAreaInsetsContext, value: { top: 0, right: 0, bottom: 0, left: 0 } },
    ];
    tabAt(780);
    scene.play = [{ tap: 'Connections' }];

    await played();

    expect(pressed).toEqual(['Connections']);
  });

  it('a tap whose view lies off screen waits 5 seconds, then says the view is out of reach', async () => {
    tabAt(900);
    scene.play = [{ tap: 'Connections' }];
    let outcome: unknown;
    playSteps(SCENE_ID).then(
      () => (outcome = 'played'),
      (error) => (outcome = error)
    );

    await vi.advanceTimersByTimeAsync(4_800);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(400);

    expect((outcome as Error).message).toContain('a tap cannot reach it');
    expect((outcome as Error).message).not.toContain('no visible view');
    expect(pressed).toEqual([]);
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

describe('a scene in a test run', () => {
  it('a scene in a test run plays its steps once before its ready wait', async () => {
    scene.play = [{ tap: 'Connections' }, { tap: 'connectionListItem' }];
    scene.ready = { testID: 'chat.input.message', requestsIdle: false };
    rowsOnScreen = [{ name: 'Ada', y: 100 }];

    // The run's core never plays steps: only the stillness check is asked.
    const first = stabilize();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await first).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Ada']);
    expect(screen).toBe('chat');

    const second = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await second).toBe(true);
    expect(pressed).toEqual(['Connections', 'row Ada']);
  });

  it("a scene whose step misses in a test run fails with the step's line, not the ready timeout", async () => {
    scene.play = [{ tap: 'connectionListItem' }];
    scene.ready = { testID: 'chat.input.message', requestsIdle: false };

    const settled = stabilize().then(
      () => undefined,
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(40_000);
    const error = await settled;

    expect(error).toBeInstanceOf(SherloStepError);
    expect(error.message).toBe(
      `Scene ${SCENE_ID} could not play step 1 of 1 (tap testID "connectionListItem"): ` +
        'no visible view with testID "connectionListItem" after 5 s'
    );
    expect(nativeStabilize).not.toHaveBeenCalled();
  });

  it("a capture plays a scene's steps once, not again at the stillness check", async () => {
    scene.play = [{ tap: 'Connections' }];

    const steps = playSteps(SCENE_ID);
    await vi.advanceTimersByTimeAsync(1_000);
    await steps;
    const settled = stabilize();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toBe(true);
    expect(pressed).toEqual(['Connections']);
  });
});
