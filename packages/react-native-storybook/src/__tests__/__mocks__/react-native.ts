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

// Use globalThis so the accumulator persists across module resets
(globalThis as any).__sherloTestAppendFileCalls = (globalThis as any).__sherloTestAppendFileCalls || [];

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
  stabilization: { requiredMatches: 3, minScreenshotsCount: 3, intervalMs: 500, timeoutMs: 5000, threshold: 0, includeAA: true },
});

export const NativeModules: Record<string, any> = {
  SherloModule: {
    getConstants: () => ({
      mode: getMode(),
      config: _config,
      lastState: '',
      nativeVersion: '2.0.0',
    }),
    appendFile: getNativeAppendFile(),
    readFile: (_path: string) => Promise.resolve(''),
    sendNativeError: () => {},
    openStorybook: () => {},
    closeStorybook: () => {},
    toggleStorybook: () => {},
    isScrollable: () => Promise.resolve({ scrollable: false }),
    scrollToCheckpoint: () => Promise.resolve({ reachedBottom: true, appliedIndex: 0, appliedOffsetPx: 0, viewportPx: 0, contentPx: 0 }),
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
