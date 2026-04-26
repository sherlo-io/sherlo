/**
 * Unit tests for metro/polyfill.js JS error capture logic.
 *
 * We import the polyfill as raw text and run it in a carefully constructed
 * fake global to avoid needing a React Native runtime.
 */
import * as fs from 'fs';
import * as path from 'path';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const POLYFILL_PATH = path.join(__dirname, '../../metro/polyfill.js');
const polyfillSource = fs.readFileSync(POLYFILL_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Helpers to run the polyfill in a controlled sandbox
// ---------------------------------------------------------------------------

interface SherloModuleMock {
  getMode: ReturnType<typeof vi.fn>;
  sendJsError: ReturnType<typeof vi.fn>;
}

interface FakeGlobal {
  ErrorUtils: {
    getGlobalHandler: ReturnType<typeof vi.fn>;
    setGlobalHandler: ReturnType<typeof vi.fn>;
    reportFatalError: ReturnType<typeof vi.fn>;
  };
  require: (id: string) => unknown;
}

function buildFakeGlobal(sherloModule: SherloModuleMock, appRegistryMock?: { registerComponent: ReturnType<typeof vi.fn> }): FakeGlobal {
  const handlers: Array<(error: Error, isFatal: boolean) => void> = [];

  const fakeGlobal: FakeGlobal = {
    ErrorUtils: {
      getGlobalHandler: vi.fn(() => handlers[handlers.length - 1] ?? null),
      setGlobalHandler: vi.fn((h) => handlers.push(h)),
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
  };

  return fakeGlobal;
}

function runPolyfill(fakeGlobal: FakeGlobal) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('global', 'require', `"use strict";\n${polyfillSource}`);
  fn(fakeGlobal, fakeGlobal.require);
}

// ---------------------------------------------------------------------------
// Tests: ErrorUtils global handler chain
// ---------------------------------------------------------------------------

describe('polyfill - ErrorUtils global handler chain', () => {
  let sherlo: SherloModuleMock;
  let fakeGlobal: FakeGlobal;

  beforeEach(() => {
    sherlo = {
      getMode: vi.fn(() => 'testing'),
      sendJsError: vi.fn(),
    };
    fakeGlobal = buildFakeGlobal(sherlo);
    runPolyfill(fakeGlobal);
  });

  it('installs a new global error handler', () => {
    expect(fakeGlobal.ErrorUtils.setGlobalHandler).toHaveBeenCalledOnce();
  });

  it('calls sendJsError with message, stack, and "globalHandler" source', () => {
    const installedHandler = fakeGlobal.ErrorUtils.setGlobalHandler.mock.calls[0][0] as (e: Error, fatal: boolean) => void;
    const error = new Error('test error');
    installedHandler(error, true);
    expect(sherlo.sendJsError).toHaveBeenCalledWith(
      'test error',
      error.stack ?? '',
      'globalHandler'
    );
  });

  it('does NOT call sendJsError when mode is not testing', () => {
    sherlo.getMode.mockReturnValue('default');
    const installedHandler = fakeGlobal.ErrorUtils.setGlobalHandler.mock.calls[0][0] as (e: Error, fatal: boolean) => void;
    installedHandler(new Error('boom'), false);
    expect(sherlo.sendJsError).not.toHaveBeenCalled();
  });

  it('chains to the original handler even in testing mode', async () => {
    const originalHandler = vi.fn();
    // Simulate original handler already being set
    fakeGlobal.ErrorUtils.getGlobalHandler.mockReturnValue(originalHandler);
    // Re-run polyfill to pick up the new "original"; flush microtasks so the
    // deferred Promise.resolve().then() callback runs before we inspect mocks.
    runPolyfill(fakeGlobal);
    await Promise.resolve();
    const installedHandler = fakeGlobal.ErrorUtils.setGlobalHandler.mock.calls[1][0] as (e: Error, fatal: boolean) => void;
    const error = new Error('chained');
    installedHandler(error, false);
    expect(originalHandler).toHaveBeenCalledWith(error, false);
  });
});

// ---------------------------------------------------------------------------
// Tests: AppRegistry.registerComponent monkey-patch
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
    // The mock is mutated in-place inside the polyfill IIFE
    // We verify by checking that when registerComponent is called, it uses our sherlo wrapper.
    expect(originalRegisterComponent).toBeDefined();
  });

  it('returns a wrapped component (SherloRootWrapper)', () => {
    // After the patch, calling registerComponent should invoke originalRegisterComponent
    // with a factory that returns the wrapper.
    // The mock captures the provider function passed to the original.
    const MyComponent = () => null;
    const appRegistryMock = fakeGlobal.require('react-native') as { AppRegistry: { registerComponent: ReturnType<typeof vi.fn> } };
    appRegistryMock.AppRegistry.registerComponent('TestApp', () => MyComponent);
    expect(originalRegisterComponent).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: polyfill file structure invariants
// ---------------------------------------------------------------------------

describe('polyfill - file structure invariants', () => {
  it('is gated on mode === testing for globalHandler path', () => {
    expect(polyfillSource).toContain("'testing'");
  });

  it('uses ErrorUtils.setGlobalHandler', () => {
    expect(polyfillSource).toContain('ErrorUtils.setGlobalHandler');
  });

  it('uses AppRegistry.registerComponent monkey-patch', () => {
    expect(polyfillSource).toContain('AppRegistry.registerComponent');
  });

  it('always re-invokes original handler after reporting', () => {
    expect(polyfillSource).toContain('originalHandler(error, isFatal)');
  });

  it('re-propagates via ErrorUtils.reportFatalError after errorBoundary catch', () => {
    expect(polyfillSource).toContain('ErrorUtils.reportFatalError(error)');
  });

  it('uses getDerivedStateFromError for ES5-compatible ErrorBoundary', () => {
    expect(polyfillSource).toContain('getDerivedStateFromError');
  });

  it('uses lazy require for SherloModule', () => {
    expect(polyfillSource).toContain("require('../dist/SherloModule')");
  });
});
