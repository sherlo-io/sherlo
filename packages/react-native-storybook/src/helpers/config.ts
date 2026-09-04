/**
 * The shapes SherloModule.ts's getConfig()/getLastState() return. Both moved
 * here from the (now private, moved to sherlo-runner) RunnerBridge protocol
 * types module: SherloModule.ts is public, so its return types must be too.
 */
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
   * Story-readiness + native-paint-barrier knobs, read by the private capture
   * loop (via SherloModule.getConfig(), reused through the seam). All
   * optional: an OLD runner that omits them, paired with this SDK, still
   * works because every value falls back to a runtime-side default.
   */
  scrollableFallbackDelayMs?: number;
  storyRenderedTimeoutMs?: number;
  paintBarrierTimeoutMs?: number;
  paintBarrierPerScrollPart?: boolean;
  /**
   * When set, launches the app in interactive storybook-UI mode (not
   * testing). Used for manual inspection of stories. The runner never sets
   * this; humans/devtools do. Read publicly - see getStorybook.tsx's
   * storybook-mode branch.
   */
  inspect?: {
    initialStoryId?: string;
  };
  discoveryFilter?: {
    includeStoryIds?: string[];
  };
};

/**
 * `nextSnapshot` is intentionally untyped here: its shape (Snapshot) is a
 * runner wire type with no public reader - only the private capture loop
 * interprets it, reused through the seam. Typing it fully would drag that
 * private shape back into the public surface for no public consumer.
 */
export type LastState = {
  nextSnapshot: unknown;
  requestId: string;
};
