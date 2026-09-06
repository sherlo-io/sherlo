import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * THE FROZEN NATIVE INTERFACE. Codegen reads this at the CUSTOMER's build, so
 * every method here is fixed the moment they ship - widening it costs every
 * customer a rebuild. Four methods stay dedicated for reasons of timing or
 * hot-path cost; `invoke`/`invokeSync` are the generic transports every other
 * capability (screenshots, settle, scroll, inspector data, sendNativeError,
 * notifyGetStorybookCalled, setMode, and whatever is invented later) goes
 * through instead.
 */
export interface Spec extends TurboModule {
  /**
   * DEDICATED because of WHEN it is called: from the Metro polyfill's IIFE,
   * through the raw TurboModule proxy, before any wrapper or helper module
   * exists. Answered from the native pre-main read (SherloModuleCore), never
   * forwarded - a late-attached implementation reads these frozen values off
   * the shim and never re-derives them.
   *
   * Returns exactly four keys: mode, config, lastState, nativeVersion. config
   * and lastState are JSON strings (or null), re-parsed in JS.
   */
  getSherloConstants: () => {};

  /**
   * DEDICATED because of WHERE it is called: the error path, synchronously,
   * when nothing else is guaranteed to work. Must never throw.
   */
  reportEarlyJsError: (name: string, message: string, stack: string) => boolean;

  /**
   * DEDICATED because of COST: the protocol hot path - a 500ms ACK poll -
   * carrying base64 payloads. The shim writes nothing to protocol.sherlo on
   * its own; both forward to whatever implementation is registered.
   */
  appendFile: (path: string, base64Content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;

  /**
   * EVERYTHING ELSE, forever. `argsJson` is a JSON object; the resolved value
   * is a JSON string.
   *
   * THE CONTRACT THAT REMOVES THE REBUILD TAX: an unknown `name` rejects with
   * the stable code `UNKNOWN_METHOD` - never an unclassified throw - so a
   * NEWER implementation paired with an OLDER customer binary degrades
   * deliberately instead of crashing. It also replaces the old minimum-version
   * gate: capability negotiates per method, never a blanket refusal.
   */
  invoke: (name: string, argsJson: string) => Promise<string>;

  /**
   * The synchronous half of the same transport, for the one call that cannot
   * await: `setMode` during bundle evaluation. The shim answers `setMode`
   * itself when nothing is injected - the developer path, openStorybook() /
   * toggleStorybook() called with no runner attached.
   */
  invokeSync: (name: string, argsJson: string) => string;
}

let SherloModule: Spec | null = null;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec;
} catch (e) {}

export default SherloModule;
