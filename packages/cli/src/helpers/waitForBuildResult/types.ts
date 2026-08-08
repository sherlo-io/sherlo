/**
 * One poll result from a build status source. `terminal: false` means keep
 * polling; `terminal: true` carries the final outcome.
 */
export type BuildStatusPoll =
  | { terminal: false }
  | { terminal: true; hasChangesToReview: boolean };

/**
 * The narrow interface `runWaitLoop` polls against. Today's implementation
 * (`createPollingBuildStatusSource`) calls `getBuildStatus` on a fixed
 * interval; a future push source (e.g. a subscription) can satisfy this same
 * interface by resolving `poll()` as soon as a new status is pushed.
 */
export type BuildStatusSource = {
  poll: () => Promise<BuildStatusPoll>;
};
