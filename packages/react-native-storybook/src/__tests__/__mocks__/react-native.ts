/**
 * Minimal react-native stub for Vitest.
 * react-native/index.js uses Flow syntax (`import typeof`) that Vite/Rollup
 * cannot parse. This stub provides the subset of RN APIs used by SDK source files.
 *
 * __setNativeMode() / __resetNativeMode() allow tests to control the mode returned
 * by SherloModule.getMode() when the real SherloModule is loaded via require()
 * (not a vi.mock override).
 *
 * The app's connection is native code's: sendMessage keeps every message the JavaScript sends, and
 * dialBundler every address it asks native code to dial, on globalThis so they persist across
 * module resets (__getSentMessages, __getDialedAddresses). __emitMessageFromTheConnection plays a
 * message the connection brings, to whoever listens through NativeEventEmitter.
 */
import { createElement, type ReactNode } from 'react';
import { fakeSealedCoreSource, seamThisSdkSpeaks } from './fakeSealedCore';

/** A View that draws as a host element named View, keeping its props for a test to read. */
export function View(props: { children?: ReactNode } & Record<string, unknown>) {
  return createElement('View', props);
}

export { fakeSealedCoreSource };

function getMode(): string {
  return (globalThis as any).__sherloTestNativeMode || 'default';
}

/** Every message the JavaScript sent over the connection, as sent (parsed from its JSON). */
export function __getSentMessages(): Array<Record<string, any>> {
  return ((globalThis as any).__sherloTestSentMessages ?? []).map((json: string) =>
    JSON.parse(json)
  );
}

/** Every address the JavaScript asked native code to dial. */
export function __getDialedAddresses(): string[] {
  return (globalThis as any).__sherloTestDialedAddresses ?? [];
}

export function __resetConnection(): void {
  (globalThis as any).__sherloTestSentMessages = [];
  (globalThis as any).__sherloTestDialedAddresses = [];
  (globalThis as any).__sherloTestMessageListeners = [];
}

/** Bring one message over the connection, as native code raises its `SherloMessage` event. */
export function __emitMessageFromTheConnection(message: Record<string, unknown>): void {
  const listeners: Array<(messageJson: string) => void> =
    (globalThis as any).__sherloTestMessageListeners ?? [];
  listeners.forEach((listener) => listener(JSON.stringify(message)));
}

export class NativeEventEmitter {
  constructor(_nativeModule?: unknown) {}

  addListener(_eventName: string, listener: (messageJson: string) => void) {
    const listeners: Array<(messageJson: string) => void> = ((
      globalThis as any
    ).__sherloTestMessageListeners ??= []);
    listeners.push(listener);
    return {
      remove: () => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
    };
  }
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
  return nativePickOf(fakeSealedCoreSource(seamThisSdkSpeaks()));
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
    sendMessage: (messageJson: string) => {
      const sent: string[] = ((globalThis as any).__sherloTestSentMessages ??= []);
      sent.push(messageJson);
    },
    dialBundler: (address: string) => {
      const dialed: string[] = ((globalThis as any).__sherloTestDialedAddresses ??= []);
      dialed.push(address);
    },
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

/** Every Alert.alert call, as [title, message]. */
export function __getAlerts(): Array<[string, string | undefined]> {
  return (globalThis as any).__sherloTestAlerts ?? [];
}

export function __resetAlerts(): void {
  (globalThis as any).__sherloTestAlerts = [];
}

export const Alert = {
  alert: (title: string, message?: string): void => {
    (globalThis as any).__sherloTestAlerts = [...__getAlerts(), [title, message]];
  },
};

/** AppRegistry: the wrapper component provider a test reads back with __getWrapperComponentProvider. */
let wrapperComponentProvider: (() => unknown) | undefined;
export const AppRegistry = {
  setWrapperComponentProvider: (provider: () => unknown): void => {
    wrapperComponentProvider = provider;
  },
};
export function __getWrapperComponentProvider(): (() => unknown) | undefined {
  return wrapperComponentProvider;
}
export function __resetWrapperComponentProvider(): void {
  wrapperComponentProvider = undefined;
}

export const Platform = { OS: 'ios' };

/** Linking.openURL: what a test makes of the link (reject for one no app takes). */
let openURLImplementation: (url: string) => Promise<void> = async () => {};
export function __setOpenURL(implementation: (url: string) => Promise<void>): void {
  openURLImplementation = implementation;
}
export const Linking = { openURL: (url: string) => openURLImplementation(url) };
export const DevSettings = {
  addMenuItem: (_label: string, _cb: () => void): void => {},
};
export const TurboModuleRegistry = {
  getEnforcing: <T>(_name: string): T | null => null,
  /** A module a test laid in NativeModules, as React Native's registry falls back to them. */
  get: <T>(name: string): T | null => NativeModules[name] ?? null,
};
export type TurboModule = Record<string, unknown>;

type DeviceListener = (event: any) => void;
const deviceListeners = new Map<string, Set<DeviceListener>>();

/** React Native's RCTDeviceEventEmitter: one listener set per event name. */
export const DeviceEventEmitter = {
  addListener(eventName: string, listener: DeviceListener) {
    if (!deviceListeners.has(eventName)) deviceListeners.set(eventName, new Set());
    deviceListeners.get(eventName)!.add(listener);
    return { remove: () => deviceListeners.get(eventName)?.delete(listener) };
  },
  emit(eventName: string, event: unknown): void {
    deviceListeners.get(eventName)?.forEach((listener) => listener(event));
  },
};
