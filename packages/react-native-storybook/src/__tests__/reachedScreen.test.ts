/**
 * The screen a scene reached is named from the app's own tree: React Navigation's container
 * publishes getRootState through a context provider fiber, and the focused route is followed
 * down the nested navigators. No handle from the app.
 */
import { rememberAppFiberRoots } from '../appMetadata';
import { reachedScreen } from '../reachedScreen';
import type { WalkedFiber } from '../sealedCore/seam';

function fiber(props: any, child?: WalkedFiber): WalkedFiber {
  return { type: () => null, pendingProps: props, memoizedProps: props, child };
}

function appWithState(state: unknown): WalkedFiber {
  const provider = fiber({ value: { getRootState: () => state } }, fiber({}));
  return fiber({}, fiber({ value: { unrelated: true } }, provider));
}

afterEach(() => rememberAppFiberRoots(undefined));

describe('the screen the app reached', () => {
  it('names the focused route in every nested navigator, outermost first', () => {
    const root = appWithState({
      index: 1,
      routes: [
        { name: 'DiscoverStack' },
        {
          name: 'ChatStack',
          state: { index: 1, routes: [{ name: 'ChatList' }, { name: 'Chat' }] },
        },
      ],
    });
    rememberAppFiberRoots(() => [root]);
    expect(reachedScreen()).toEqual(['ChatStack', 'Chat']);
  });

  it('is undefined for an app with no React Navigation container', () => {
    rememberAppFiberRoots(() => [fiber({}, fiber({ value: 3 }))]);
    expect(reachedScreen()).toBeUndefined();
  });

  it('is undefined when the state cannot be read', () => {
    const throwing = fiber({
      value: {
        getRootState: () => {
          throw new Error('no');
        },
      },
    });
    rememberAppFiberRoots(() => [throwing]);
    expect(reachedScreen()).toBeUndefined();
  });
});
