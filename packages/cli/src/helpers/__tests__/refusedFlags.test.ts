/**
 * helpers/refusedFlags.ts - the three flags `sherlo test` and `sherlo view` refuse before anything runs.
 */
import { describe, expect, it } from 'vitest';
import { refuseBinaryPathFlags, refuseTokenFlag, refuseUnknownPlatformFlag } from '../refusedFlags';

describe('the flags refused before a command runs', () => {
  it('a token on the command line is refused and no token is let through', () => {
    expect(() => refuseTokenFlag('test', { token: 'abc' })).toThrow();
    expect(() => refuseTokenFlag('test', {})).not.toThrow();
  });

  it('a platform that is neither android nor ios is refused', () => {
    expect(() => refuseUnknownPlatformFlag({ platform: 'web' })).toThrow();
    expect(() => refuseUnknownPlatformFlag({ platform: 'ios' })).not.toThrow();
    expect(() => refuseUnknownPlatformFlag({})).not.toThrow();
  });

  it('a path to an android or ios build is refused', () => {
    expect(() => refuseBinaryPathFlags({ android: './app.apk' })).toThrow();
    expect(() => refuseBinaryPathFlags({ ios: './app.app' })).toThrow();
    expect(() => refuseBinaryPathFlags({})).not.toThrow();
  });
});
