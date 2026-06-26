import { Snapshot } from '../../types';

export type RunnerState = {
  filteredViewIds: string[];
  snapshotIndex: number;
  updateTimestamp: number;
  retry?: boolean;
};

export type Config = {
  stabilization: {
    requiredMatches: number;
    minScreenshotsCount: number;
    intervalMs: number;
    timeoutMs: number;
    threshold: number;
    includeAA: boolean;
    saveScreenshots?: boolean;
  };
  easUpdateDeeplink?: string;
  initialStoryRenderDelayMs?: number;
  /**
   * Story-readiness + native-paint-barrier knobs (SHERLO-1497).
   *
   * All optional: an OLD runner that omits them, paired with this SDK, still
   * works because every value falls back to a SDK-side default (see
   * READINESS_DEFAULTS in useTestStory). They are consumed only when
   * `useStoryRenderedReadiness` is true; with the flag off the capture flow is
   * byte-for-byte the legacy substring-poll + grab-at-timeout behavior.
   */
  /**
   * Feature flag for the whole new readiness path (STORY_RENDERED subscription +
   * fallback delay + native paint barrier + re-seeded stabilize ordering +
   * hard-fail). DEFAULT-OFF. The runner enables/disables it via config without
   * needing an SDK rollback.
   */
  useStoryRenderedReadiness?: boolean;
  /**
   * When STORY_RENDERED is not received in time (or no Storybook channel is
   * reachable), wait this many ms before the first stabilize for SCROLLABLE
   * snapshots. Default 3000.
   */
  scrollableFallbackDelayMs?: number;
  /**
   * How long to wait for Storybook core's STORY_RENDERED event before giving up
   * and using the scrollable fallback. Default 5000.
   */
  storyRenderedTimeoutMs?: number;
  /**
   * Cap for the native paint barrier (awaitFrameCommit). On timeout the SDK
   * warns and proceeds (best-effort catch-up); the stability loop still runs
   * afterwards. Default 1000.
   */
  paintBarrierTimeoutMs?: number;
  /**
   * Re-run the paint barrier before each post-scroll stabilize, not just the
   * initial one. Default true.
   */
  paintBarrierPerScrollPart?: boolean;
  /**
   * When set, launches the app in interactive storybook-UI mode (not testing).
   * Used for manual inspection of stories. The runner never sets this; humans/devtools do.
   */
  inspect?: {
    initialStoryId?: string;
  };
  discoveryFilter?: {
    includeStoryIds?: string[];
  };
};

export type LastState = {
  nextSnapshot: Snapshot;
  requestId: string;
};

export type LogFn = (key: string, parameters?: Record<string, any>) => void;
export type SendFn = (protocolItem: AppProtocolItem) => Promise<RunnerProtocolItem>;

export type ProtocolItemMetadata = {
  timestamp: number;
  entity: 'app' | 'runner';
};

export type AppProtocolItem =
  | {
      action: 'NATIVE_INIT_STARTED';
    }
  | {
      action: 'JS_EVAL_COMPLETE';
    }
  | {
      action: 'STORYBOOK_LOADED';
    }
  | {
      action: 'STORYBOOK_RENDERED';
      requestId?: string;
    }
  | {
      action: 'JS_ERROR';
      data: {
        name: string;
        message: string;
        stack: string;
        componentStack: string;
      };
    }
  | {
      action: 'START';
      snapshots: Snapshot[];
    }
  | {
      action: 'REQUEST_SNAPSHOT';
      storyId: string;
      error?: {
        name: string;
        message: string;
        stack: string;
        componentStack: string;
      };
      hasError?: boolean;
      inspectorData?: string;
      isStable?: boolean;
      requestId: string;
      hasNetworkImage?: boolean;
      isScrollable?: boolean;
      isAtEnd?: boolean;
      scrollOffset?: number;
      scrollViewFrame?: { x: number; y: number; width: number; height: number };
      safeAreaMetadata?: {
        shouldAddSafeArea: boolean;
        insetBottom: number;
        insetTop: number;
      };
    };

export type AckStartProtocolItem = {
  action: 'ACK_START';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type AckRequestSnapshotProtocolItem = {
  action: 'ACK_REQUEST_SNAPSHOT';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type AckScrollRequestProtocolItem = {
  action: 'ACK_SCROLL_REQUEST';
  requestId: string;
  scrollIndex: number;
  offsetPx: number;
};

export type RunnerProtocolItem =
  | AckStartProtocolItem
  | AckRequestSnapshotProtocolItem
  | AckScrollRequestProtocolItem;
