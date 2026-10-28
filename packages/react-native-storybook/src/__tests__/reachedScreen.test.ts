// The screen a scene reached is named from the app's own tree: React Navigation's container
// publishes getRootState through a context provider fiber, and the focused route is followed down
// the nested navigators. No handle from the app.
import { rememberStoryOfTheApp } from '../componentNames';
import { reachedRoute } from '../reachedScreen';
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
