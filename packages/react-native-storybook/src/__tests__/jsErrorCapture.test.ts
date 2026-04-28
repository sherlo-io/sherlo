/**
 * Unit tests for JS error capture logic.
 *
 * Error capture is now exclusively via ErrorUtils.setGlobalHandler installed
 * early in metro/polyfill.js. The handler catches module-eval, async, and
 * event-handler errors uniformly — the previous __r wrap and
 * patchAppRegistryWithBoundary are gone.
 */
import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect } from 'vitest';
import { normalizeStack } from '../normalizeStack';

const POLYFILL_PATH = path.join(__dirname, '../../metro/polyfill.js');
const INDEX_PATH = path.join(__dirname, '../index.ts');
const polyfillSource = fs.readFileSync(POLYFILL_PATH, 'utf8');
const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

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
    ErrorUtils: {
      setGlobalHandler,
      getGlobalHandler: vi.fn(() => prevHandler ?? null),
    },
    __turboModuleProxy: nm ? vi.fn((name: string) => name === 'SherloModule' ? nm : null) : undefined,
    _setGlobalHandler: setGlobalHandler,
  };
}

function getInstalledHandler(fakeGlobal: Record<string, any>): (error: Error, isFatal: boolean) => void {
  const calls = fakeGlobal._setGlobalHandler.mock.calls;
  if (!calls.length) throw new Error('setGlobalHandler was never called');
  return calls[0][0];
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
// Tests: polyfill file structure
// ---------------------------------------------------------------------------

describe('polyfill - file structure', () => {
  it('contains temporary diagnostic console.warn markers', () => {
    expect(polyfillSource).toContain('console.warn');
  });

  it('uses ErrorUtils.setGlobalHandler as the sole error capture mechanism', () => {
    expect(polyfillSource).toContain('ErrorUtils.setGlobalHandler');
  });

  it('does not wrap global.__r (old mechanism removed)', () => {
    expect(polyfillSource).not.toContain('global.__r');
  });

  it('guards with __sherloGlobalHandlerInstalled for idempotency', () => {
    expect(polyfillSource).toContain('__sherloGlobalHandlerInstalled');
  });

  it('guards against cascade errors with __sherloFirstErrorReported flag', () => {
    expect(polyfillSource).toContain('__sherloFirstErrorReported');
  });

  it('calls reportEarlyJsError', () => {
    expect(polyfillSource).toContain('reportEarlyJsError');
  });
});

// ---------------------------------------------------------------------------
// Tests: index.ts — no error capture logic
// ---------------------------------------------------------------------------

describe('index.ts — no error capture logic', () => {
  it('does not install ErrorUtils.setGlobalHandler (moved to polyfill)', () => {
    expect(indexSource).not.toContain('setGlobalHandler');
  });

  it('does not contain patchAppRegistryWithBoundary', () => {
    expect(indexSource).not.toContain('patchAppRegistryWithBoundary');
  });

  it('does not contain SherloErrorBoundary', () => {
    expect(indexSource).not.toContain('SherloErrorBoundary');
  });

  it('does not contain writeJsErrorEntry', () => {
    expect(indexSource).not.toContain('writeJsErrorEntry');
  });

  it('still sends JS_EVAL_COMPLETE when in testing mode', () => {
    expect(indexSource).toContain('JS_EVAL_COMPLETE');
  });

  it('uses lazy require for SherloModule', () => {
    expect(indexSource).toContain("require('./SherloModule')");
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
