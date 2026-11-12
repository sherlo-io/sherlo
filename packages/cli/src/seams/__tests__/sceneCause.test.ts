import { describe, expect, it } from 'vitest';
import { sceneCauseOf } from '../sceneCause';

describe('a failed scene is keyed by its cause', () => {
  it('the cause key is the cover, else the first error line, else the failed step, else the route never reached', () => {
    const covered = {
      kind: 'never-reached',
      stop: { kind: 'covered' as const, early: { afterMs: 10_000, stuckOn: 'sign-in' as const } },
      threw: { message: 'boom' },
      stayedOn: ['Auth'],
    };
    expect(sceneCauseOf(covered)).toBe('covered by a sign-in screen');
    expect(sceneCauseOf({ ...covered, permission: 'camera' })).toBe(
      'covered by the camera permission dialog'
    );

    const threw = {
      kind: 'never-reached',
      threw: { message: 'boom\n  at line 3' },
      stayedOn: ['A'],
    };
    expect(sceneCauseOf(threw)).toBe('boom');

    const missing = { kind: 'play-target-missing', missing: { tap: 'send' }, route: ['Chat'] };
    expect(sceneCauseOf(missing)).toBe('tap send found no view');

    expect(sceneCauseOf({ kind: 'never-reached', stayedOn: ['AuthStack', 'SignIn'] })).toBe(
      'ready view never showed on AuthStack › SignIn'
    );
  });

  it('a scene that came up or ended another way has no cause to repeat', () => {
    expect(sceneCauseOf({ kind: 'scene', threw: { message: 'a fake threw' } })).toBeUndefined();
    expect(sceneCauseOf({ kind: 'never-settled' })).toBeUndefined();
    expect(sceneCauseOf({ kind: 'no-app' })).toBeUndefined();
  });
});
