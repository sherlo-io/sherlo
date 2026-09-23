import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getInspectorData: () => Promise<string>;
  sendNativeError: (errorCode: string, message: string, dataJson: string) => void;
  reportEarlyJsError: (name: string, message: string, stack: string) => boolean;
  appendFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
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
}

let SherloModule: Spec | null = null;

try {
  SherloModule = TurboModuleRegistry.getEnforcing<Spec>('SherloModule') as Spec;
} catch (e) {}

export default SherloModule;
