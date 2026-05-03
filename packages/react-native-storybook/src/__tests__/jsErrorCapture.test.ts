/**
 * Unit tests for JS error capture logic.
 *
 * Two complementary capture paths in metro/polyfill.js:
 * 1. ErrorUtils.setGlobalHandler — catches entry-module throws + async/event errors.
 * 2. __d wrap — wraps every module factory; catches nested module-eval throws that
 *    bypass ErrorUtils because Metro's _$$_REQUIRE local ref skips global.__r.
 *
 * Both paths share a reportToNative helper gated by __sherloFirstErrorReported.
 */
import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect } from 'vitest';
import { normalizeStack } from '../normalizeStack';

const POLYFILL_PATH = path.join(__dirname, '../../metro/polyfill.js');
const polyfillSource = fs.readFileSync(POLYFILL_PATH, 'utf8');

function runPolyfill(fakeGlobal: Record<string, any>) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('global', `"use strict";\n${polyfillSource}`);
  fn(fakeGlobal);
}

function makeNativeModule(reportEarlyJsError?: ReturnType<typeof vi.fn>) {
  return { reportEarlyJsError: reportEarlyJsError ?? vi.fn() };
}

function buildFakeGlobal(
  nm?: ReturnType<typeof makeNativeModule>,
  prevHandler?: (error: Error, isFatal: boolean) => void
): Record<string, any> {
  const setGlobalHandler = vi.fn();
  return {
    // Mode gate — polyfill returns early if this is not 'testing'
    __sherloRuntimeMode_v1: 'testing',
    ErrorUtils: {
      setGlobalHandler,
      getGlobalHandler: vi.fn(() => prevHandler ?? null),
    },
    __turboModuleProxy: nm ? vi.fn((name: string) => name === 'SherloModule' ? nm : null) : undefined,
    _setGlobalHandler: setGlobalHandler,
  };
}

function buildFakeGlobalWithD(
  nm?: ReturnType<typeof makeNativeModule>,
  prevHandler?: (error: Error, isFatal: boolean) => void
): Record<string, any> {
  const fakeGlobal = buildFakeGlobal(nm, prevHandler);
  const originalD = vi.fn();
  fakeGlobal.__d = originalD;
  fakeGlobal._originalD = originalD;
  return fakeGlobal;
}

function getInstalledHandler(fakeGlobal: Record<string, any>): (error: Error, isFatal: boolean) => void {
  const calls = fakeGlobal._setGlobalHandler.mock.calls;
  if (!calls.length) throw new Error('setGlobalHandler was never called');
  return calls[0][0];
}

function callWrappedFactory(
  fakeGlobal: Record<string, any>,
  callIndex = 0
): (...args: any[]) => any {
  const wrappedFactory = fakeGlobal._originalD.mock.calls[callIndex][0];
  return (...args: any[]) => wrappedFactory({}, () => {}, () => {}, () => {}, {}, {}, args[0] ?? []);
}

// ---------------------------------------------------------------------------
// Tests: metro/polyfill.js — ErrorUtils.setGlobalHandler
// ---------------------------------------------------------------------------

describe('metro/polyfill.js — ErrorUtils.setGlobalHandler', () => {
  it('installs handler when ErrorUtils is available', () => {
    const fakeGlobal = buildFakeGlobal();
    runPolyfill(fakeGlobal);
    expect(fakeGlobal._setGlobalHandler).toHaveBeenCalledOnce();
    expect(fakeGlobal.__sherloGlobalHandlerInstalled).toBe(true);
  });

  it('is idempotent — skips install when __sherloGlobalHandlerInstalled is already set', () => {
    const fakeGlobal = buildFakeGlobal();
    fakeGlobal.__sherloGlobalHandlerInstalled = true;
    runPolyfill(fakeGlobal);
    expect(fakeGlobal._setGlobalHandler).not.toHaveBeenCalled();
  });

  it('skips installation when ErrorUtils is absent', () => {
    const fakeGlobal: Record<string, any> = {};
    runPolyfill(fakeGlobal);
    expect(fakeGlobal.__sherloGlobalHandlerInstalled).toBeUndefined();
  });

  it('calls reportEarlyJsError on the turbo proxy when an error fires', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobal(nm);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    handler(new Error('boom'), true);
    expect(reportFn).toHaveBeenCalledOnce();
    expect(reportFn).toHaveBeenCalledWith('Error', 'boom', expect.any(String));
  });

  it('passes error name, message, and stack to reportEarlyJsError', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobal(nm);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    handler(new TypeError('bad type'), false);
    expect(reportFn).toHaveBeenCalledWith('TypeError', 'bad type', expect.any(String));
  });

  it('chains to previous handler after reporting', () => {
    const prevHandler = vi.fn();
    const nm = makeNativeModule();
    const fakeGlobal = buildFakeGlobal(nm, prevHandler);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    const err = new Error('test');
    handler(err, false);
    expect(prevHandler).toHaveBeenCalledOnce();
    expect(prevHandler).toHaveBeenCalledWith(err, false);
  });

  it('does not throw if SherloModule is unavailable', () => {
    const fakeGlobal = buildFakeGlobal(); // no nm, no __turboModuleProxy
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    expect(() => handler(new Error('test'), false)).not.toThrow();
  });

  it('does not throw if reportEarlyJsError itself throws', () => {
    const nm = makeNativeModule(vi.fn(() => { throw new Error('native exploded'); }));
    const fakeGlobal = buildFakeGlobal(nm);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    expect(() => handler(new Error('test'), false)).not.toThrow();
  });

  it('falls back to nativeModuleProxy when __turboModuleProxy is absent', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobal();
    delete fakeGlobal.__turboModuleProxy;
    fakeGlobal.nativeModuleProxy = { SherloModule: nm };
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    handler(new Error('native fallback'), false);
    expect(reportFn).toHaveBeenCalledOnce();
  });

  it('only reports the first error to native — subsequent calls skip reportEarlyJsError', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobal(nm);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    handler(new Error('first error'), true);
    handler(new Error('cascade error'), true);
    expect(reportFn).toHaveBeenCalledOnce();
  });

  it('chains to prevHandler for both first and cascade errors', () => {
    const prevHandler = vi.fn();
    const nm = makeNativeModule();
    const fakeGlobal = buildFakeGlobal(nm, prevHandler);
    runPolyfill(fakeGlobal);
    const handler = getInstalledHandler(fakeGlobal);
    handler(new Error('first'), false);
    handler(new Error('cascade'), false);
    expect(prevHandler).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: metro/polyfill.js — __d wrap
// ---------------------------------------------------------------------------

describe('metro/polyfill.js — __d wrap', () => {
  it('wraps __d when present', () => {
    const fakeGlobal = buildFakeGlobalWithD();
    const original = fakeGlobal.__d;
    runPolyfill(fakeGlobal);
    expect(fakeGlobal.__d).not.toBe(original);
    expect(fakeGlobal.__sherloDefineWrapped).toBe(true);
  });

  it('is idempotent — skips re-wrap when __sherloDefineWrapped is already set', () => {
    const fakeGlobal = buildFakeGlobalWithD();
    fakeGlobal.__sherloDefineWrapped = true;
    const original = fakeGlobal.__d;
    runPolyfill(fakeGlobal);
    expect(fakeGlobal.__d).toBe(original);
  });

  it('does not wrap when __d is absent', () => {
    const fakeGlobal = buildFakeGlobal();
    runPolyfill(fakeGlobal);
    expect(fakeGlobal.__sherloDefineWrapped).toBeUndefined();
  });

  it('wrapped factory passes through to original factory on success', () => {
    const fakeGlobal = buildFakeGlobalWithD();
    const factoryReturn = { foo: 'bar' };
    const factory = vi.fn(() => factoryReturn);
    runPolyfill(fakeGlobal);
    fakeGlobal.__d(factory, 1, []);
    expect(fakeGlobal._originalD).toHaveBeenCalledOnce();
    const invoke = callWrappedFactory(fakeGlobal);
    const result = invoke();
    expect(factory).toHaveBeenCalledOnce();
    expect(result).toBe(factoryReturn);
  });

  it('wrapped factory captures error, reports to native, and rethrows', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobalWithD(nm);
    const err = new Error('module crash');
    const factory = vi.fn(() => { throw err; });
    runPolyfill(fakeGlobal);
    fakeGlobal.__d(factory, 1, []);
    const invoke = callWrappedFactory(fakeGlobal);
    expect(() => invoke()).toThrow('module crash');
    expect(reportFn).toHaveBeenCalledOnce();
    expect(reportFn).toHaveBeenCalledWith('Error', 'module crash', expect.any(String));
  });

  it('only reports the first error — __sherloFirstErrorReported gates __d path', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobalWithD(nm);
    const factory = vi.fn(() => { throw new Error('boom'); });
    runPolyfill(fakeGlobal);
    fakeGlobal.__d(factory, 1, []);
    fakeGlobal.__d(factory, 2, []);
    const invoke1 = callWrappedFactory(fakeGlobal, 0);
    const invoke2 = callWrappedFactory(fakeGlobal, 1);
    expect(() => invoke1()).toThrow();
    expect(() => invoke2()).toThrow();
    expect(reportFn).toHaveBeenCalledOnce();
  });

  it('__sherloFirstErrorReported flag is shared — __d error prevents duplicate from ErrorUtils path', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule(reportFn);
    const fakeGlobal = buildFakeGlobalWithD(nm);
    const err = new Error('transitive crash');
    const factory = vi.fn(() => { throw err; });
    runPolyfill(fakeGlobal);
    fakeGlobal.__d(factory, 1, []);
    const invoke = callWrappedFactory(fakeGlobal);
    // __d fires first
    expect(() => invoke()).toThrow();
    expect(reportFn).toHaveBeenCalledOnce();
    // ErrorUtils path fires for same error (rethrown by __d)
    const handler = getInstalledHandler(fakeGlobal);
    handler(err, true);
    expect(reportFn).toHaveBeenCalledOnce(); // still once — flag blocks duplicate
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeStack - PII path stripping
// ---------------------------------------------------------------------------

describe('normalizeStack', () => {
  it('strips iOS dev path (address at + absolute path with spaces in dir name)', () => {
    const input =
      'at CrashComponent (address at /Users/jdoe/Library/Developer/CoreSimulator/Devices/DEV-UUID/data/Containers/Data/Application/APP-UUID/Library/Application Support/.expo-internal/725082b41d5a6cfa0709c88b3206c4cf.bundle:1:792150)';
    expect(normalizeStack(input)).toBe(
      'at CrashComponent (725082b41d5a6cfa0709c88b3206c4cf.bundle:1:792150)'
    );
  });

  it('strips iOS preview path (no address at, .jsbundle extension)', () => {
    const input =
      'at c (/Users/jdoe/Library/Developer/CoreSimulator/Devices/DEV-UUID/data/Containers/Data/Application/APP-UUID/Library/Application Support/.expo-internal/bundle-91d66976-9a30-47d9-b752-57c97ac593c7.jsbundle:633:288)';
    expect(normalizeStack(input)).toBe(
      'at c (bundle-91d66976-9a30-47d9-b752-57c97ac593c7.jsbundle:633:288)'
    );
  });

  it('strips Android path (address at + absolute path, no bundle extension)', () => {
    const input =
      'at CrashComponent (address at /data/user/0/com.sherlo.brain.tester/files/.expo-internal/253b9a00862a433a3d431bac5000eb82:1:794571)';
    expect(normalizeStack(input)).toBe(
      'at CrashComponent (253b9a00862a433a3d431bac5000eb82:1:794571)'
    );
  });

  it('leaves stack lines without filesystem paths unchanged', () => {
    const line = 'at Object.foo (<anonymous>)';
    expect(normalizeStack(line)).toBe(line);
  });

  it('returns empty string unchanged', () => {
    expect(normalizeStack('')).toBe('');
  });
});
