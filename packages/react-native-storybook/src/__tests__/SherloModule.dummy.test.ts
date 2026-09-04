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

  it('invoke() rejects with a sherlo_no_native_module error - absence must never look like an empty answer', async () => {
    await expect(SherloModule.invoke('anyCapability')).rejects.toMatchObject({
      code: 'sherlo_no_native_module',
    });
  });

  it('invokeSync() returns the same ok:false envelope shape the shim uses when refusing', () => {
    expect(SherloModule.invokeSync('anyCapability')).toEqual({
      ok: false,
      code: 'sherlo_no_native_module',
      message: expect.any(String),
    });
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

  it('notifyGetStorybookCalled() does not throw', () => {
    expect(() => SherloModule.notifyGetStorybookCalled()).not.toThrow();
  });

  it('isTurboModule is false', () => {
    expect(SherloModule.isTurboModule).toBe(false);
  });
});
