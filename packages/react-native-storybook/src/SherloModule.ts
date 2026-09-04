import base64 from 'base-64';
import utf8 from 'utf8';
import isExpoGo from './helpers/isExpoGo';
import { StorybookViewMode } from './types/types';
import { Config, LastState } from './helpers/config';
import TurboModule, { Spec } from './specs/NativeSherloModule';
import * as constants from './constants';

interface SherloConstants {
  mode: StorybookViewMode;
  config: string;
  lastState: string;
  nativeVersion: string | null;
}

type SherloModule = {
  isTurboModule: boolean;
  getMode: () => StorybookViewMode;
  getConfig: () => Config;
  getLastState: () => LastState | undefined;
  getNativeVersion: () => string | null;
  appendFile: (path: string, base64: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  openStorybook: () => void;
  toggleStorybook: () => void;
  notifyGetStorybookCalled: () => void;
  /**
   * THE GENERIC TRANSPORT for every capability beyond this frozen list -
   * screenshots, settle, scroll, inspector data, sendNativeError, and
   * whatever is invented later. This wrapper ships in the customer's bundle
   * and is frozen at their build, so a NAMED method here (`stabilize(...)`,
   * `getInspectorData()`, ...) would freeze that call's signature forever -
   * exactly the tax the six-method spec exists to remove. The private
   * runtime is the only caller, reused through the seam's `host.module`; it
   * calls capabilities by name, never through a method this file grows.
   */
  invoke: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<T>;
  invokeSync: <T = unknown>(name: string, args?: Record<string, unknown>) => T | undefined;
  /**
   * Re-exported so the seam (src/seam.js, resolved from `dist/SherloModule.js`
   * - an already-frozen export path) can reach the protocol file names
   * without a new subpath of its own.
   */
  constants: typeof constants;
};

let SherloModule: SherloModule;

if (TurboModule !== null) {
  SherloModule = createSherloModule(TurboModule);
} else {
  SherloModule = createDummySherloModule();

  if (!isExpoGo) {
    console.warn(
      '@sherlo/react-native-storybook: Sherlo native module is not accessible. Rebuild the app to link it on the native side.'
    );
  }
}

export default SherloModule;

/* ========================================================================== */

/**
 * Everything beyond the four dedicated methods (getSherloConstants,
 * reportEarlyJsError, appendFile, readFile) goes through invoke/invokeSync -
 * see specs/NativeSherloModule.ts. This wrapper keeps the same call shape
 * every other file in the package already uses; only the plumbing under each
 * method changed.
 */
function createSherloModule(module: Spec): SherloModule {
  const getConstants = (): SherloConstants => module.getSherloConstants() as SherloConstants;

  async function invoke<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const raw = await module.invoke(name, JSON.stringify(args));
    return raw ? (JSON.parse(raw) as T) : (undefined as T);
  }

  /** Result envelope of invokeSync: `{"ok":true,"value":T}` or `{"ok":false,...}`. */
  function invokeSync<T>(name: string, args: Record<string, unknown> = {}): T | undefined {
    const raw = module.invokeSync(name, JSON.stringify(args));
    const envelope = JSON.parse(raw) as { ok: boolean; value?: T };
    return envelope.ok ? envelope.value : undefined;
  }

  const sherloModule: SherloModule = {
    isTurboModule: !!TurboModule,
    invoke,
    invokeSync,
    getMode: () => {
      return getConstants().mode;
    },
    getNativeVersion: () => {
      return getConstants().nativeVersion ?? null;
    },
    getConfig: () => {
      const configString = getConstants().config;
      const config = JSON.parse(configString) as Config | undefined;
      if (!config) {
        throw new Error('Config is undefined');
      }
      return config;
    },
    getLastState: () => {
      const lastState = getConstants().lastState;
      const parsedLastState = lastState ? JSON.parse(lastState) : undefined;

      if (parsedLastState && Object.keys(parsedLastState).length === 0) {
        return undefined;
      }

      return parsedLastState;
    },
    appendFile: (filename: string, data: string) => {
      const encodedData = base64.encode(utf8.encode(data));
      return module.appendFile(filename, encodedData);
    },
    readFile: (filename: string) => {
      const decodeData = (data: string) => utf8.decode(base64.decode(data));
      return module.readFile(filename).then(decodeData);
    },
    openStorybook: () => {
      invokeSync('setMode', { mode: 'storybook', reload: true });
    },
    toggleStorybook: () => {
      invokeSync('setMode', { mode: 'toggle', reload: true });
    },
    notifyGetStorybookCalled: () => {
      invoke('notifyGetStorybookCalled').catch(() => {
        /* nothing to notify when nothing is injected */
      });
    },
    constants,
  };

  return sherloModule;
}

function createDummySherloModule(): SherloModule {
  return {
    isTurboModule: false,
    // Nothing to transport when there is no native module at all - matches
    // every other graceful-absence path below.
    invoke: async <T = unknown>(): Promise<T> => undefined as T,
    invokeSync: <T = unknown>(): T | undefined => undefined,
    // IMPORTANT: We should make sure that the mode is always 'default'
    // because if user doesn't want to supply native library in their production
    // build, this will be the value returned.
    getMode: () => 'default',
    getNativeVersion: () => null,
    getLastState: () => undefined,
    getConfig: () => ({
      stabilization: {
        requiredMatches: 3,
        minScreenshotsCount: 3,
        intervalMs: 500,
        timeoutMs: 5_000,
        saveScreenshots: true,
        threshold: 0.0,
        includeAA: true,
      },
      // Readiness knobs - represented here so the dummy config shape
      // matches the real one.
      scrollableFallbackDelayMs: 3000,
      storyRenderedTimeoutMs: 5000,
      paintBarrierTimeoutMs: 1000,
      paintBarrierPerScrollPart: true,
    }),
    appendFile: async () => {},
    readFile: async () => '',
    openStorybook: () => {},
    toggleStorybook: () => {},
    notifyGetStorybookCalled: () => {},
    constants,
  };
}
