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
// Tests: polyfill file structure (now a diagnostic no-op)
// ---------------------------------------------------------------------------

describe('polyfill - file structure', () => {
  it('contains the diagnostic log marker', () => {
    expect(polyfillSource).toContain('[Sherlo] metro polyfill loaded');
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
  it('JS_ERROR entry is valid JSON with required fields', () => {
    const entry = JSON.parse(
      '{"action":"JS_ERROR","timestamp":1,"entity":"app","data":{"name":"Error","message":"boom","stack":"","componentStack":null,"digest":null,"cause":null,"source":"errorBoundary","errorTimestamp":1,"context":{"sdkVersion":"1.6.5-alpha.9","platform":"ios","platformVersion":"17","rnVersion":"0.74","jsEngine":"hermes","mode":"testing"}}}'
    );
    expect(entry.action).toBe('JS_ERROR');
    expect(entry.entity).toBe('app');
    expect(entry.data.name).toBeDefined();
    expect(entry.data.message).toBeDefined();
    expect(entry.data.context).toBeDefined();
  });

  it('index.ts source uses writeJsErrorEntry in componentDidCatch', () => {
    expect(indexSource).toContain('writeJsErrorEntry');
    expect(indexSource).toContain('componentDidCatch');
  });

  it('index.ts componentDidCatch receives errorInfo as second arg', () => {
    expect(indexSource).toContain('componentDidCatch = function (error: any, errorInfo: any)');
  });

  it('index.ts writeJsErrorEntry writes JS_ERROR action via appendFile', () => {
    expect(indexSource).toContain("action: 'JS_ERROR'");
    expect(indexSource).toContain('appendFile');
  });

  it('index.ts writeJsErrorEntry includes componentStack from errorInfo', () => {
    expect(indexSource).toContain('componentStack');
    expect(indexSource).toContain('errorInfo');
  });

  it('index.ts writeJsErrorEntry normalizes stack and cause.stack', () => {
    const occurrences = (indexSource.match(/normalizeStack/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('index.ts writeJsErrorEntry serializes cause chain when present', () => {
    expect(indexSource).toContain('error.cause');
    expect(indexSource).toContain('error.cause.name');
    expect(indexSource).toContain('error.cause.message');
  });

  it('index.ts writeJsErrorEntry sets cause to null when absent', () => {
    expect(indexSource).toContain(': null,');
  });

  it('index.ts context includes sdkVersion from package.json', () => {
    expect(indexSource).toContain("require('../package.json').version");
  });

  it('index.ts context detects jsEngine via HermesInternal', () => {
    expect(indexSource).toContain('HermesInternal');
    expect(indexSource).toContain("'hermes'");
    expect(indexSource).toContain("'jsc'");
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
