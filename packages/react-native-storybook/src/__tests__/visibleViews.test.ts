// visibleViews.ts finds the views a tap or a ready rule names: by testID, by the text a Text view
// shows, or by accessibility label. The text match is the whole trimmed string, with typed and
// typographic quote marks the same.

vi.mock('../SherloModule', () => ({ default: { getInspectorData: vi.fn() } }));

import SherloModule from '../SherloModule';
import { rememberStoryOfTheApp } from '../componentNames';
import type { WalkedFiber } from '../sealedCore/seam';
import { isTarget, lookAtViews, viewsThatChanged } from '../visibleViews';
import type { ViewLook } from '../visibleViews';

/** A fiber of a component: a function with this name, or a wrapper object when `wrapper` says so. */
function componentFiber(name: string, wrapper = false): WalkedFiber {
  const render = Object.defineProperty(() => null, 'name', { value: name });
  const type = wrapper ? { displayName: name, render: () => null } : render;
  return { type, memoizedProps: {}, pendingProps: {} } as unknown as WalkedFiber;
}

/** A host view the native tree draws under `tag`, with its props. */
function hostFiber(type: string, tag: number, props: Record<string, unknown> = {}): WalkedFiber {
  return {
    type,
    memoizedProps: props,
    pendingProps: props,
    stateNode: { canonical: { nativeTag: tag } },
  } as unknown as WalkedFiber;
}

/** `parent` with `children` under it, in order; answers the parent. */
function under(parent: WalkedFiber, ...children: WalkedFiber[]): WalkedFiber {
  children.forEach((child, place) => {
    child.return = parent;
    child.sibling = children[place + 1] ?? null;
  });
  parent.child = children[0] ?? null;
  return parent;
}

/** The native tree with every tag drawn at the same frame, but those `moved`, which sit lower. */
function nativeTreeOf(tags: number[], moved: number[] = []) {
  const node = (id: number) => ({
    id,
    isVisible: true,
    x: 0,
    y: moved.includes(id) ? 40 : 0,
    width: 100,
    height: 20,
    children: [],
  });
  return {
    density: 1,
    viewHierarchy: { ...node(0), width: 400, height: 800, children: tags.map(node) },
  };
}

describe('the views a never-settled screen names', () => {
  it('a view that kept changing is named by the nearest component of the app that draws it, never by a bare host view', async () => {
    const words = { memoizedProps: 'Hello', child: null, sibling: null } as unknown as WalkedFiber;
    // The fiber the app is rendered from names nothing, nor does anything above it.
    const appRoot = under(
      componentFiber('StoryOfTheApp'),
      under(
        componentFiber('LoadingSpinner'),
        under(
          componentFiber('Animated(View)', true),
          under(componentFiber('ActivityIndicator'), hostFiber('RCTActivityIndicatorView', 1))
        )
      ),
      under(
        componentFiber('Greeting'),
        under(
          componentFiber('View'),
          under(
            hostFiber('RCTView', 2),
            under(componentFiber('Text'), under(hostFiber('RCTText', 3), words))
          )
        )
      ),
      under(componentFiber('View'), hostFiber('RCTView', 4, { testID: 'banner' })),
      hostFiber('RCTView', 5)
    );
    under(componentFiber('SherloWrapper'), appRoot);
    rememberStoryOfTheApp(appRoot);
    try {
      vi.mocked(SherloModule.getInspectorData)
        .mockResolvedValueOnce(nativeTreeOf([1, 2, 3, 4, 5]) as never)
        .mockResolvedValueOnce(nativeTreeOf([1, 2, 3, 4, 5], [1, 4, 5]) as never);
      const before = await lookAtViews();
      (words as { memoizedProps: unknown }).memoizedProps = 'Hello again';
      const after = await lookAtViews();
      // A view drawn by no component of the app is named by its test id, or left out.
      expect(viewsThatChanged(before, after)).toEqual([
        'LoadingSpinner',
        'Greeting',
        'testID "banner"',
      ]);
    } finally {
      rememberStoryOfTheApp(undefined);
    }
  });
});

describe('two looks at the screen', () => {
  it('the views that changed between two looks are named by their component and test id', () => {
    const frame = { x: 0, y: 10, width: 100, height: 20 };
    const first: ViewLook[] = [
      { key: 'tag 1', component: 'Bubble', testID: 'msg-3', text: 'typing.', frame },
      { key: 'tag 2', component: 'Header', text: 'Chat', frame },
      { key: 'tag 3', component: 'Avatar', text: '', frame },
    ];
    const second: ViewLook[] = [
      { ...first[0], text: 'typing..' },
      { ...first[1], frame: { ...frame, y: 10.4 } },
      { ...first[2], frame: { ...frame, height: 40 } },
    ];
    expect(viewsThatChanged(first, second)).toEqual(['Bubble "msg-3"', 'Avatar']);
    expect(viewsThatChanged(first, first)).toEqual([]);
  });
});

function textView(text: string): WalkedFiber {
  return {
    type: 'RCTText',
    memoizedProps: {},
    child: { memoizedProps: text, child: null, sibling: null },
  } as unknown as WalkedFiber;
}

describe('a view named by its text', () => {
  it('matches the whole trimmed string and not a part of it', () => {
    expect(isTarget(textView('  Discover '), { text: 'Discover' })).toBe(true);
    expect(isTarget(textView('Nearby: 5 km'), { text: 'Nearby' })).toBe(false);
  });

  it('takes typed and typographic quote marks as the same on both sides', () => {
    expect(isTarget(textView('It’s ‘ok’'), { text: "It's 'ok'" })).toBe(true);
    expect(isTarget(textView('Say "hi"'), { text: 'Say “hi”' })).toBe(true);
    expect(isTarget(textView('It’s'), { text: 'It’s' })).toBe(true);
  });

  it('a ready text written on one line matches a view whose text breaks the line where a space reads', () => {
    const broken = textView('first line\nsecond line');
    expect(isTarget(broken, { text: 'first line second line' })).toBe(true);
    expect(isTarget(textView('first line second line'), { text: 'first line\nsecond line' })).toBe(
      true
    );
    expect(isTarget(textView('first line'), { text: 'first  line' })).toBe(true);
    expect(isTarget(textView('first line'), { text: 'first line' })).toBe(true);
    expect(isTarget(broken, { text: 'first line second lime' })).toBe(false);
  });
});

describe('a view named by its label or testID', () => {
  it('matches the accessibility label exactly', () => {
    const view = { type: 'RCTView', memoizedProps: { accessibilityLabel: 'Back' } } as WalkedFiber;
    expect(isTarget(view, { label: 'Back' })).toBe(true);
    expect(isTarget(view, { label: 'back' })).toBe(false);
  });
});
