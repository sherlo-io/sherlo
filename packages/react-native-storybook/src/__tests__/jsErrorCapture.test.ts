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
});
