/**
 * Minimal react-native stub for Vitest.
 * react-native/index.js uses Flow syntax (`import typeof`) that Vite/Rollup
 * cannot parse. This stub provides the subset of RN APIs used by SDK source files.
 *
 * __setNativeMode() / __resetNativeMode() allow tests to control the mode returned
 * by SherloModule.getMode() when the real SherloModule is loaded via require()
 * (not a vi.mock override).
 *
 * __appendFileCalls is a global accumulator used by installSherloIntegration tests
 * to capture protocol writes without needing to intercept vi.mock + require paths.
 */
import { fakeSealedCoreSource } from './fakeSealedCore';

export { fakeSealedCoreSource };

// Use globalThis so the accumulator persists across module resets
(globalThis as any).__sherloTestAppendFileCalls =
  (globalThis as any).__sherloTestAppendFileCalls || [];

function getMode(): string {
  return (globalThis as any).__sherloTestNativeMode || 'default';
}

function getNativeAppendFile() {
  return (path: string, content: string) => {
    (globalThis as any).__sherloTestAppendFileCalls.push([path, content]);
    return Promise.resolve();
  };
}

export function __setNativeMode(mode: string): void {
  (globalThis as any).__sherloTestNativeMode = mode;
}

export function __resetNativeMode(): void {
  (globalThis as any).__sherloTestNativeMode = 'default';
}

export function __getAppendFileCalls(): Array<[string, string]> {
  return (globalThis as any).__sherloTestAppendFileCalls;
}

export function __resetAppendFileCalls(): void {
  (globalThis as any).__sherloTestAppendFileCalls = [];
}

const _config = JSON.stringify({
  stabilization: {
    requiredMatches: 3,
    minScreenshotsCount: 3,
    intervalMs: 500,
    timeoutMs: 5000,
    threshold: 0,
    includeAA: true,
  },
});

/**
 * What native code's loadCore() answers when it picked `source` (null: it found no core), from
 * `origin`, naming `version` as the core's header does.
 */
export function nativePickOf(
  source: string | null,
  origin: 'shipped' | 'override' = 'shipped',
  version: string | null = null
): string {
  if (source === null) {
    return JSON.stringify({
      source: null,
      origin: 'none',
      version: null,
      reason: 'no shipped core in the SDK',
    });
  }
  return JSON.stringify({ source, origin, version, reason: null });
}

/**
 * The native side's loadCore for the next import: a function to answer with, or null for a
 * native build that has no loader at all. Kept on globalThis, like the mode, so it survives
 * vi.resetModules(). Unset, every suite runs against the fake core (./fakeSealedCore), shipped.
 */
export function __setNativeLoadCore(loadCore: (() => string) | null): void {
  (globalThis as any).__sherloTestNativeLoadCore = loadCore;
}

/** The native version the next import reports (unset: 2.0.0). */
export function __setNativeVersion(version: string): void {
  (globalThis as any).__sherloTestNativeVersion = version;
}

/** The C core's version native code reports (unset: none, as outside testing mode). */
export function __setNativeCompiledCoreVersion(version: string): void {
  (globalThis as any).__sherloTestNativeCompiledCoreVersion = version;
}

/** Every sendNativeError call, as [errorCode, message]. */
export function __getNativeErrors(): Array<[string, string]> {
  return (globalThis as any).__sherloTestNativeErrors ?? [];
}

export function __resetSealedCoreNative(): void {
  delete (globalThis as any).__sherloTestNativeLoadCore;
  delete (globalThis as any).__sherloTestNativeVersion;
  delete (globalThis as any).__sherloTestNativeCompiledCoreVersion;
  (globalThis as any).__sherloTestNativeErrors = [];
}

function defaultLoadCore(): string {
  return nativePickOf(fakeSealedCoreSource(1));
}

export const NativeModules: Record<string, any> = {
  SherloModule: {
    get loadCore() {
      const chosen = (globalThis as any).__sherloTestNativeLoadCore;
      if (chosen === null) return undefined;
      return chosen ?? defaultLoadCore;
    },
    getConstants: () => ({
      mode: getMode(),
      config: _config,
      lastState: '',
      nativeVersion: (globalThis as any).__sherloTestNativeVersion ?? '2.0.0',
      compiledCoreVersion: (globalThis as any).__sherloTestNativeCompiledCoreVersion ?? null,
    }),
    appendFile: getNativeAppendFile(),
    readFile: (_path: string) => Promise.resolve(''),
    sendNativeError: (errorCode: string, message: string) => {
      (globalThis as any).__sherloTestNativeErrors = [...__getNativeErrors(), [errorCode, message]];
    },
    openStorybook: () => {},
    closeStorybook: () => {},
    toggleStorybook: () => {},
    openTesting: () => {},
    isScrollable: () => Promise.resolve({ scrollable: false }),
    scrollToCheckpoint: () =>
      Promise.resolve({
        reachedBottom: true,
        appliedIndex: 0,
        appliedOffsetPx: 0,
        viewportPx: 0,
        contentPx: 0,
      }),
    stabilize: () => Promise.resolve(true),
    getInspectorData: () => Promise.resolve('{}'),
    notifyGetStorybookCalled: () => {},
  },
};

export const Platform = { OS: 'ios' };
export const DevSettings = {
  addMenuItem: (_label: string, _cb: () => void): void => {},
};
export const TurboModuleRegistry = {
  getEnforcing: <T>(_name: string): T | null => null,
};
