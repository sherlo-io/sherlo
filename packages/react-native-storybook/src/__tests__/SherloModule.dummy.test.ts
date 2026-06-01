/**
 * Tests for the dummy SherloModule fallback.
 * When the native module is absent (TurboModule=null, NativeModules.SherloModule=undefined),
 * the SDK must not crash and must return safe defaults so customer apps stay functional.
 */

vi.mock('../specs/NativeSherloModule', () => ({ default: null }));
vi.mock('react-native', () => ({
  // SherloModule: null ensures createDummySherloModule() is used
  // (null || null = null satisfies the `module !== null` falsy check in SherloModule.ts)
  NativeModules: { SherloModule: null },
  Platform: { OS: 'ios' },
}));
vi.mock('../helpers/isExpoGo', () => ({ default: true }));

import SherloModule from '../SherloModule';

describe('SherloModule dummy (no native module)', () => {
  it('getMode() returns "default"', () => {
    expect(SherloModule.getMode()).toBe('default');
  });

  it('getNativeVersion() returns null', () => {
    expect(SherloModule.getNativeVersion()).toBeNull();
  });

  it('getLastState() returns undefined', () => {
    expect(SherloModule.getLastState()).toBeUndefined();
  });

  it('getConfig() returns an object with stabilization defaults', () => {
    const config = SherloModule.getConfig();
    expect(config).toBeDefined();
    expect(config.stabilization).toBeDefined();
    expect(typeof config.stabilization.requiredMatches).toBe('number');
  });

  it('sendNativeError() does not throw', () => {
    expect(() => SherloModule.sendNativeError('ERROR_CODE', 'message')).not.toThrow();
  });

  it('appendFile() resolves without throwing', async () => {
    await expect(SherloModule.appendFile('foo.txt', 'data')).resolves.not.toThrow();
  });

  it('readFile() resolves to an empty string', async () => {
    await expect(SherloModule.readFile('foo.txt')).resolves.toBe('');
  });

  it('openStorybook() does not throw', () => {
    expect(() => SherloModule.openStorybook()).not.toThrow();
  });

  it('toggleStorybook() does not throw', () => {
    expect(() => SherloModule.toggleStorybook()).not.toThrow();
  });

  it('isScrollable() resolves to non-scrollable', async () => {
    const result = await SherloModule.isScrollable();
    expect(result.scrollable).toBe(false);
  });

  it('scrollToCheckpoint() resolves with reachedBottom=true', async () => {
    const result = await SherloModule.scrollToCheckpoint(0, 0, 10);
    expect(result.reachedBottom).toBe(true);
  });

  it('stabilize() resolves to true', async () => {
    const result = await SherloModule.stabilize(3, 3, 500, 5000, true, 0.0, true);
    expect(result).toBe(true);
  });

  it('notifyGetStorybookCalled() does not throw', () => {
    expect(() => SherloModule.notifyGetStorybookCalled()).not.toThrow();
  });

  it('isTurboModule is false', () => {
    expect(SherloModule.isTurboModule).toBe(false);
  });
});
