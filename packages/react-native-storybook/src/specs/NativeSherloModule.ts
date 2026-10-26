import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getInspectorData: () => Promise<string>;
  /**
   * Whether each view the JSON list of testIDs names is drawn, read from the native view tree:
   * resolves a JSON object, `{ [testID]: 'visible' | 'invisible' | 'absent' | 'unreached' }`
   * (the states are named in src/types/types ViewVisibility).
   */
  getViewVisibility: (testIDsJson: string) => Promise<string>;
  sendNativeError: (errorCode: string, message: string, dataJson: string) => void;
  reportEarlyJsError: (name: string, message: string, stack: string) => boolean;
  openStorybook: () => void;
  closeStorybook: () => void;
  toggleStorybook: () => void;
  /**
   * Restart into testing mode. `storyId` is the story to land the restarted app on directly, or an
   * empty string when there is none to hand over - codegen has no optional-string shape here, so an
   * empty string is the sentinel, the same convention sendNativeError's dataJson already uses.
   * `config` is the JSON-encoded Config to carry across the restart, so the native side that comes
   * back can produce the same `config` shape a run's own config.sherlo would (see SherloModuleCore).
   */
  openTesting: (storyId: string, config: string) => void;
  stabilize: (
    requiredMatches: number,
    minScreenshotsCount: number,
    intervalMs: number,
    timeoutMs: number,
    saveScreenshots: boolean,
    threshold: number,
    includeAA: boolean
  ) => Promise<boolean>;
  isScrollable: () => Promise<{
    scrollable: boolean;
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
  }>;
  scrollToCheckpoint: (
    index: number,
    offset: number,
    maxIndex: number
  ) => Promise<{
    reachedBottom: boolean;
    appliedIndex: number;
    appliedOffsetPx: number;
    viewportPx: number;
    contentPx: number;
    scrollViewFrame?: { x: number; y: number; width: number; height: number };
  }>;
  getSherloConstants: () => {};
  notifyGetStorybookCalled: () => void;
  /**
   * Native paint barrier: force a redraw and resolve on the next
   * real frame commit (Android ViewTreeObserver.registerFrameCommitCallback /
   * iOS CADisplayLink), capped at timeoutMs. Resolves true if a frame commit was
   * observed, false if the cap elapsed first. Content-agnostic.
   */
  awaitFrameCommit: (timeoutMs: number) => Promise<boolean>;
  /**
   * The sealed JS core native code picked, as JSON `{source, origin, version, reason}` (see
   * SherloCoreLoader on each platform). Synchronous: the SDK evaluates it while it is imported.
   */
  loadCore: () => string;
  /**
   * Send one message over the app's connection, JSON-encoded (src/sealedCore/seam types it). Native
   * code keeps the messages sent while the socket is down and sends them, in order, once it is back.
   */
  sendMessage: (messageJson: string) => void;
  /**
   * Open the connection to `address`, the bundler's Sherlo address, when no address was handed at
   * launch. A launch that was handed one is already connected, and ignores this.
   */
  dialBundler: (address: string) => void;
  /**
   * The memory the app's process uses, in MB (iOS phys_footprint, Android total PSS), or -1 when
   * it cannot be measured - codegen has no nullable number to resolve with.
   */
  getMemoryMb: () => Promise<number>;
  /** Start the app's JavaScript again in the same process; the connection stays open. */
  reloadJavaScript: () => void;
  /**
   * Touch the app window (the first window of the first connected scene, where the inspector measures frames) at (x, y), in points, for holdMs, as a finger does (ios/TouchHelper, android
   * TouchHelper; a native build from before the touch lacks the method). Resolves once the touch
   * ended: whether a React Native or gesture-handler recognizer took it, the React tag of the view
   * it hit (-1 for none) and that view's class, and the private calls this iOS lacks (none touched
   * then; always empty on Android).
   */
  tap: (
    x: number,
    y: number,
    holdMs: number
  ) => Promise<{ reachedReact: boolean; hitTag: number; hitClass: string; missing: string[] }>;
  /**
   * NativeEventEmitter's two calls. Native code raises one `SherloMessage` event for each message
   * the connection brings, its argument the message's JSON (src/connection/appLine).
   */
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

let SherloModule: Spec | null = null;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec;
} catch (e) {}

export default SherloModule;
