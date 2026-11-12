// The screen a scene reached is named from the app's own tree: React Navigation's container
// publishes getRootState through a context provider fiber, and the focused route is followed down
// the nested navigators. No handle from the app.
import { rememberStoryOfTheApp } from '../componentNames';
import { isOnFocusedRoute, reachedRoute } from '../reachedScreen';
import type { WalkedFiber } from '../sealedCore/seam';

function fiber(props: any, child?: WalkedFiber): WalkedFiber {
  return { type: () => null, pendingProps: props, memoizedProps: props, child };
}

function appWithState(state: unknown): WalkedFiber {
  const provider = fiber({ value: { getRootState: () => state } }, fiber({}));
  return fiber({}, fiber({ value: { unrelated: true } }, provider));
}

afterEach(() => rememberStoryOfTheApp(undefined));

describe('the route a scene reached is named', () => {
  it('names the focused route in every nested navigator, outermost first', () => {
    rememberStoryOfTheApp(
      appWithState({
        index: 1,
        routes: [
          { name: 'DiscoverStack' },
          {
            name: 'ChatStack',
            state: { index: 1, routes: [{ name: 'ChatList' }, { name: 'Chat' }] },
          },
        ],
      })
    );
    expect(reachedRoute()).toEqual(['ChatStack', 'Chat']);
  });

  it('the current route is read through nested stack, tab and modal navigators', () => {
    rememberStoryOfTheApp(
      appWithState({
        type: 'stack',
        index: 1,
        routes: [
          { name: 'Main' },
          {
            name: 'Modal',
            state: { type: 'tab', routes: [{ name: 'First' }, { name: 'Second' }] },
          },
        ],
      })
    );
    // A tab state with no index is on its first tab.
    expect(reachedRoute()).toEqual(['Modal', 'First']);

    // A deep link behind a modal: the screen waits in the params of a navigator not yet mounted.
    rememberStoryOfTheApp(
      appWithState({
        index: 0,
        routes: [
          { name: 'Modal', params: { screen: 'Tabs', params: { screen: 'Chat', params: {} } } },
        ],
      })
    );
    expect(reachedRoute()).toEqual(['Modal', 'Tabs', 'Chat']);
  });

  it('a scene whose ready view shows on another route is not reached', () => {
    const viewOn = (key: string): WalkedFiber => {
      const screen = fiber({ value: { name: key.split('-')[0], key } });
      const inner = fiber({});
      inner.return = screen;
      return inner;
    };
    rememberStoryOfTheApp(
      appWithState({
        index: 1,
        routes: [
          { name: 'List', key: 'List-1' },
          { name: 'Chat', key: 'Chat-2' },
        ],
      })
    );

    expect(isOnFocusedRoute(viewOn('Chat-2'))).toBe(true);
    expect(isOnFocusedRoute(viewOn('List-1'))).toBe(false);
    // A view outside every screen is not judged.
    expect(isOnFocusedRoute(fiber({}))).toBe(true);
  });

  it('is empty for an app with no React Navigation container', () => {
    rememberStoryOfTheApp(fiber({}, fiber({ value: 3 })));
    expect(reachedRoute()).toEqual([]);
  });

  it('is empty before the app has rendered', () => {
    expect(reachedRoute()).toEqual([]);
  });

  it('is empty when the navigation state cannot be read', () => {
    rememberStoryOfTheApp(
      fiber({
        value: {
          getRootState: () => {
            throw new Error('no state');
          },
        },
      })
    );
    expect(reachedRoute()).toEqual([]);
  });
});
