// visibleViews.ts finds the views a tap or a ready rule names: by testID, by the text a Text view
// shows, or by accessibility label. The text match is the whole trimmed string, with typed and
// typographic quote marks the same.

vi.mock('../SherloModule', () => ({ default: { getInspectorData: vi.fn() } }));

import type { WalkedFiber } from '../sealedCore/seam';
import { isTarget } from '../visibleViews';

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
});

describe('a view named by its label or testID', () => {
  it('matches the accessibility label exactly', () => {
    const view = { type: 'RCTView', memoizedProps: { accessibilityLabel: 'Back' } } as WalkedFiber;
    expect(isTarget(view, { label: 'Back' })).toBe(true);
    expect(isTarget(view, { label: 'back' })).toBe(false);
  });
});
