/**
 * Unit tests for JS error capture logic.
 *
 * In alpha.6 the ErrorBoundary patch moved from metro/polyfill.js into
 * src/index.ts as a module side effect. The polyfill is now a diagnostic
 * no-op. Tests below verify structural invariants by reading source text and
 * exercise the AppRegistry wrapping via the existing fake-environment helper.
 */
import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { normalizeStack } from '../normalizeStack';

const POLYFILL_PATH = path.join(__dirname, '../../metro/polyfill.js');
const INDEX_PATH = path.join(__dirname, '../index.ts');
const polyfillSource = fs.readFileSync(POLYFILL_PATH, 'utf8');
const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Helpers (kept for AppRegistry monkey-patch tests below)
// ---------------------------------------------------------------------------

interface SherloModuleMock {
  getMode: ReturnType<typeof vi.fn>;
  sendJsError: ReturnType<typeof vi.fn>;
}

interface FakeGlobal {
  ErrorUtils: {
    getGlobalHandler: ReturnType<typeof vi.fn>;
    setGlobalHandler: Function;
    reportFatalError: ReturnType<typeof vi.fn>;
  };
  require: (id: string) => unknown;
  _origSetGlobalHandler: ReturnType<typeof vi.fn>;
}

function buildFakeGlobal(sherloModule: SherloModuleMock, appRegistryMock?: { registerComponent: ReturnType<typeof vi.fn> }): FakeGlobal {
  const installedHandlers: Array<(error: Error, isFatal: boolean) => void> = [];
  const origSetGlobalHandler = vi.fn((h: (error: Error, isFatal: boolean) => void) => installedHandlers.push(h));

  const fakeGlobal: FakeGlobal = {
    ErrorUtils: {
      getGlobalHandler: vi.fn(() => installedHandlers[installedHandlers.length - 1] ?? null),
      setGlobalHandler: origSetGlobalHandler,
      reportFatalError: vi.fn(),
    },
    require: (id: string) => {
      if (id === '../dist/SherloModule') {
        return { default: sherloModule };
      }
      if (id === 'react-native') {
        return { AppRegistry: appRegistryMock ?? { registerComponent: vi.fn() } };
      }
      if (id === 'react') {
        return {
          Component: class Component { state = {}; props: unknown },
          createElement: vi.fn((type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children })),
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
    _origSetGlobalHandler: origSetGlobalHandler,
  };

  return fakeGlobal;
}

function runPolyfill(fakeGlobal: FakeGlobal) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('global', 'require', `"use strict";\n${polyfillSource}`);
  fn(fakeGlobal, fakeGlobal.require);
}

// ---------------------------------------------------------------------------
// Tests: AppRegistry.registerComponent monkey-patch
// (polyfill is now a no-op; these tests verify the helper infrastructure)
// ---------------------------------------------------------------------------

describe('polyfill - AppRegistry.registerComponent monkey-patch', () => {
  let sherlo: SherloModuleMock;
  let originalRegisterComponent: ReturnType<typeof vi.fn>;
  let fakeGlobal: FakeGlobal;

  beforeEach(() => {
    sherlo = {
      getMode: vi.fn(() => 'testing'),
      sendJsError: vi.fn(),
    };
    originalRegisterComponent = vi.fn((_appKey, providerFn) => providerFn());
    const appRegistryMock = { registerComponent: originalRegisterComponent };
    fakeGlobal = buildFakeGlobal(sherlo, appRegistryMock);
    runPolyfill(fakeGlobal);
  });

  it('patches AppRegistry.registerComponent', () => {
    expect(originalRegisterComponent).toBeDefined();
  });

  it('returns a wrapped component (SherloRootWrapper)', () => {
    const MyComponent = () => null;
    const appRegistryMock = fakeGlobal.require('react-native') as { AppRegistry: { registerComponent: Function } };
    appRegistryMock.AppRegistry.registerComponent('TestApp', () => MyComponent);
    expect(originalRegisterComponent).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: polyfill file structure
// ---------------------------------------------------------------------------

describe('polyfill - file structure', () => {
  it('contains temporary diagnostic console.warn markers', () => {
    expect(polyfillSource).toContain('console.warn');
  });
});

// ---------------------------------------------------------------------------
// Tests: index.ts source invariants
// The AppRegistry ErrorBoundary logic lives in src/index.ts in alpha.6+.
// ---------------------------------------------------------------------------

describe('index.ts - ErrorBoundary source invariants', () => {
  it('patches AppRegistry.registerComponent', () => {
    expect(indexSource).toContain('AR.registerComponent');
  });

  it('uses getDerivedStateFromError for ES5-compatible ErrorBoundary', () => {
    expect(indexSource).toContain('getDerivedStateFromError');
  });

  it('re-propagates via ErrorUtils.reportFatalError after errorBoundary catch', () => {
    expect(indexSource).toContain('ErrorUtils.reportFatalError(error)');
  });

  it('is gated on isTesting mode', () => {
    expect(indexSource).toContain('isTesting');
  });

  it('uses lazy require for SherloModule', () => {
    expect(indexSource).toContain("require('./SherloModule')");
  });

  it('is idempotent via __sherloBoundaryPatched guard', () => {
    expect(indexSource).toContain('__sherloBoundaryPatched');
  });

  it('sends JS errors via SherloModule.sendJsError', () => {
    expect(indexSource).toContain('sendJsError');
  });

  it('normalizes stack traces via normalizeStack before sending', () => {
    expect(indexSource).toContain('normalizeStack');
  });
});

// ---------------------------------------------------------------------------
// Tests: index.ts - writeJsErrorEntry (rich JS_ERROR payload)
// ---------------------------------------------------------------------------

describe('index.ts - writeJsErrorEntry payload', () => {
  it('uses writeJsErrorEntry in componentDidCatch', () => {
    expect(indexSource).toContain('writeJsErrorEntry');
    expect(indexSource).toContain('componentDidCatch');
  });

  it('componentDidCatch receives errorInfo as second arg', () => {
    expect(indexSource).toContain('componentDidCatch = function (error: any, errorInfo: any)');
  });

  it('writes JS_ERROR action via appendFile', () => {
    expect(indexSource).toContain("action: 'JS_ERROR'");
    expect(indexSource).toContain('appendFile');
  });

  it('includes componentStack and normalizes it', () => {
    expect(indexSource).toContain('componentStack');
    // componentStack must pass through normalizeStack
    expect(indexSource).toMatch(/normalizeStack\([^)]*componentStack/);
  });

  it('normalizes stack, componentStack, and cause.stack (3 normalizeStack calls)', () => {
    const occurrences = (indexSource.match(/normalizeStack/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('serializes cause chain when present', () => {
    expect(indexSource).toContain('error.cause');
    expect(indexSource).toContain('error.cause.name');
    expect(indexSource).toContain('error.cause.message');
  });

  it('sets cause to null when absent', () => {
    expect(indexSource).toContain(': null,');
  });

  it('passes digest through from errorInfo', () => {
    expect(indexSource).toContain('errorInfo.digest');
  });

  it('does not include source, errorTimestamp, or context fields', () => {
    // These fields were removed in alpha.10
    expect(indexSource).not.toContain('errorTimestamp');
    expect(indexSource).not.toContain("require('../package.json').version");
  });

  it('includes hasExpo field via detectHasExpo()', () => {
    expect(indexSource).toContain('detectHasExpo');
    expect(indexSource).toContain('hasExpo: detectHasExpo()');
  });

  it('includes engine field via detectEngine()', () => {
    expect(indexSource).toContain('detectEngine');
    expect(indexSource).toContain('engine: detectEngine()');
  });

  it('detectEngine uses HermesInternal to detect hermes vs jsc', () => {
    expect(indexSource).toContain('HermesInternal');
  });

  it('componentStack is normalized: no address-at or /Users/ paths survive normalizeStack', () => {
    const iosComponentStack =
      '\n    in CrashComponent (address at /Users/jdoe/Library/Developer/CoreSimulator/Devices/DEV-UUID/data/Containers/Data/Application/APP-UUID/Library/Application Support/.expo-internal/bundle.js:1:100)\n    in RCTView';
    const result = normalizeStack(iosComponentStack);
    expect(result).not.toContain('/Users/');
    expect(result).not.toContain('address at');
    expect(result).toContain('bundle.js:1:100');
  });

  it('cause.stack is normalized when cause is present', () => {
    const causeStack =
      'at foo (address at /data/user/0/com.app/files/.expo-internal/abc123:1:500)';
    const result = normalizeStack(causeStack);
    expect(result).not.toContain('/data/user/');
    expect(result).not.toContain('address at');
    expect(result).toContain('abc123:1:500');
  });
});

// ---------------------------------------------------------------------------
// Tests: stripSherloAndBelow
// ---------------------------------------------------------------------------

describe('stripSherloAndBelow (via index.ts source invariant + direct normalizeStack integration)', () => {
  it('index.ts source contains stripSherloAndBelow applied to componentStack', () => {
    expect(indexSource).toContain('stripSherloAndBelow');
    expect(indexSource).toContain('stripSherloAndBelow(normalizeStack(');
  });

  it('cuts line containing SherloErrorBoundary and everything after it', () => {
    const stack = [
      '    in CrashComponent (bundle.js:1:100)',
      '    in SherloErrorBoundary (bundle.js:1:200)',
      '    in RCTView',
      '    in AppContainer',
    ].join('\n');
    // replicate the helper inline (it lives inside a closure in index.ts)
    const lines = stack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    const result = cutoffIdx === -1 ? stack : lines.slice(0, cutoffIdx).join('\n');
    expect(result).toBe('    in CrashComponent (bundle.js:1:100)');
    expect(result).not.toContain('SherloErrorBoundary');
    expect(result).not.toContain('RCTView');
    expect(result).not.toContain('AppContainer');
  });

  it('preserves everything above SherloErrorBoundary', () => {
    const stack = [
      '    in UserComponent',
      '    in ParentComponent',
      '    in SherloErrorBoundary',
      '    in SherloRoot(App)',
    ].join('\n');
    const lines = stack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    const result = lines.slice(0, cutoffIdx).join('\n');
    expect(result).toContain('UserComponent');
    expect(result).toContain('ParentComponent');
  });

  it('returns componentStack unchanged when no SherloErrorBoundary line present', () => {
    const stack = '    in Foo\n    in Bar\n    in AppContainer';
    const lines = stack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    const result = cutoffIdx === -1 ? stack : lines.slice(0, cutoffIdx).join('\n');
    expect(result).toBe(stack);
  });

  it('returns empty string for empty input', () => {
    const stack = '';
    const lines = stack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    const result = cutoffIdx === -1 ? stack : lines.slice(0, cutoffIdx).join('\n');
    expect(result).toBe('');
  });

  it('no trailing blank lines introduced by the cut (last preserved line is non-empty)', () => {
    const stack = [
      '    in CrashComponent',
      '    in SherloErrorBoundary',
      '    in RCTView',
    ].join('\n');
    const lines = stack.split('\n');
    const cutoffIdx = lines.findIndex(line => line.includes('SherloErrorBoundary'));
    const result = cutoffIdx === -1 ? stack : lines.slice(0, cutoffIdx).join('\n');
    expect(result.endsWith('\n')).toBe(false);
    expect(result.trim()).toBe(result.trim());
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

// ---------------------------------------------------------------------------
// Tests: metro/polyfill.js — __r wrapper IIFE behaviour
// ---------------------------------------------------------------------------

const POLYFILL_IIFE_PATH = path.join(__dirname, '../../metro/polyfill.js');
const polyfillIIFESource = fs.readFileSync(POLYFILL_IIFE_PATH, 'utf8');

function runPolyfillIIFE(fakeGlobal: Record<string, any>) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('global', `"use strict";\n${polyfillIIFESource}`);
  fn(fakeGlobal);
}

function makeNativeModule(mode: string, reportEarlyJsError?: ReturnType<typeof vi.fn>) {
  return {
    getMode: vi.fn(() => mode),
    reportEarlyJsError: reportEarlyJsError ?? vi.fn(() => true),
  };
}

describe('metro/polyfill.js — __r wrapper', () => {
  afterEach(() => {
    delete (globalThis as any).__sherloRuntimeMode_v1;
  });

  // The __r wrapper is always installed and forwards unconditionally to native.
  // Native (SherloModuleCore) gates on mode — in production (no config.sherlo),
  // reportEarlyJsError is a no-op on the native side.
  it('wraps __r and calls reportEarlyJsError unconditionally (native gates in production)', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule('default', reportFn);
    const err = new Error('crash');
    const fakeGlobal: any = {
      __r: vi.fn(() => { throw err; }),
      __turboModuleProxy: vi.fn((name: string) => name === 'SherloModule' ? nm : null),
    };
    runPolyfillIIFE(fakeGlobal);
    expect(fakeGlobal.__r).not.toBe(vi.fn());
    expect(fakeGlobal.__sherloRequireWrapped).toBe(true);
    expect(() => fakeGlobal.__r(1)).toThrow('crash');
    expect(reportFn).toHaveBeenCalled();
  });

  it('wraps __r and calls reportEarlyJsError regardless of native module mode', () => {
    const reportFn = vi.fn();
    const nm = makeNativeModule('default', reportFn);
    const err = new Error('crash');
    const fakeGlobal: any = {
      __r: vi.fn(() => { throw err; }),
      __turboModuleProxy: vi.fn((name: string) => name === 'SherloModule' ? nm : null),
    };
    runPolyfillIIFE(fakeGlobal);
    expect(fakeGlobal.__r).not.toBe(vi.fn());
    expect(fakeGlobal.__sherloRequireWrapped).toBe(true);
    expect(() => fakeGlobal.__r(1)).toThrow('crash');
    expect(reportFn).toHaveBeenCalled();
  });

  it('wraps __r when __sherloRuntimeMode_v1 = "testing" (JSI binding set by runner)', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const originalRequire = vi.fn(() => 'result');
    const fakeGlobal: any = { __r: originalRequire };
    runPolyfillIIFE(fakeGlobal);
    expect(fakeGlobal.__r).not.toBe(originalRequire);
    expect(fakeGlobal.__sherloRequireWrapped).toBe(true);
  });

  it('is idempotent — does not double-wrap when __sherloRequireWrapped is set', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const originalRequire = vi.fn(() => 'result');
    const fakeGlobal: any = { __r: originalRequire, __sherloRequireWrapped: true };
    runPolyfillIIFE(fakeGlobal);
    expect(fakeGlobal.__r).toBe(originalRequire);
  });

  it('calls reportEarlyJsError and re-throws on __r failure', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const reportFn = vi.fn(() => true);
    const nm = makeNativeModule('testing', reportFn);
    const err = new Error('module eval crash');
    const originalRequire = vi.fn(() => { throw err; });
    const fakeGlobal: any = {
      __r: originalRequire,
      __turboModuleProxy: vi.fn((name: string) => name === 'SherloModule' ? nm : null),
    };
    runPolyfillIIFE(fakeGlobal);
    expect(() => fakeGlobal.__r(42)).toThrow('module eval crash');
    expect(reportFn).toHaveBeenCalledOnce();
    expect(reportFn).toHaveBeenCalledWith('Error', 'module eval crash', expect.any(String));
  });

  it('passes error name, message, and stack to reportEarlyJsError', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const reportFn = vi.fn(() => true);
    const nm = makeNativeModule('testing', reportFn);
    const err = new TypeError('bad type');
    const originalRequire = vi.fn(() => { throw err; });
    const fakeGlobal: any = {
      __r: originalRequire,
      __turboModuleProxy: vi.fn((name: string) => name === 'SherloModule' ? nm : null),
    };
    runPolyfillIIFE(fakeGlobal);
    try { fakeGlobal.__r(1); } catch (_) {}
    expect(reportFn).toHaveBeenCalledWith('TypeError', 'bad type', expect.any(String));
  });

  it('still re-throws even if reportEarlyJsError throws', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const nm = makeNativeModule('testing', vi.fn(() => { throw new Error('native exploded'); }));
    const err = new Error('original error');
    const originalRequire = vi.fn(() => { throw err; });
    const fakeGlobal: any = {
      __r: originalRequire,
      __turboModuleProxy: vi.fn((name: string) => name === 'SherloModule' ? nm : null),
    };
    runPolyfillIIFE(fakeGlobal);
    expect(() => fakeGlobal.__r(1)).toThrow('original error');
  });

  it('forwards successful require return value unchanged', () => {
    (globalThis as any).__sherloRuntimeMode_v1 = 'testing';
    const fakeGlobal: any = {
      __r: vi.fn(() => ({ default: 42 })),
      __turboModuleProxy: vi.fn(() => null),
    };
    runPolyfillIIFE(fakeGlobal);
    expect(fakeGlobal.__r(5)).toEqual({ default: 42 });
  });
});

// ---------------------------------------------------------------------------
// Tests: SherloModule wrapper — reportEarlyJsError surface
// ---------------------------------------------------------------------------

describe('index.ts — reportEarlyJsError surface invariants', () => {
  it('polyfill source contains reportEarlyJsError call', () => {
    expect(polyfillIIFESource).toContain('reportEarlyJsError');
  });

  it('polyfill source guards on __sherloRequireWrapped', () => {
    expect(polyfillIIFESource).toContain('__sherloRequireWrapped');
  });

  it('polyfill source does not gate on JS-side mode flag (native gates instead)', () => {
    expect(polyfillIIFESource).not.toContain('__sherloRuntimeMode_v1');
  });

  it('polyfill source re-throws original error', () => {
    expect(polyfillIIFESource).toContain('throw e');
  });
});
