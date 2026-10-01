/**
 * THE DOOR TO THE SEALED CORE'S READINESS TRACKER, for the SDK code that still reaches it from
 * outside the core: getStorybook, the capture driver (../../../../captureTransport) and the
 * letterbox (../../../../openStoryChannel). The tracker itself - Storybook's rendered event, the
 * early buffer and every waiter - lives in the core (packages/sherlo-core/js/src).
 *
 * Every caller asks for the core before it gets here, so with no core these answer as if no channel
 * were reachable.
 */
import { getSealedCore } from '../../../../sealedCore/loadSealedCore';
import type { ReadinessResult, StorybookChannel } from '../../../../sealedCore/seam';

export { getStorybookChannel, type StorybookChannel } from '../../../storybookChannel';

export function startStoryRenderedTracking(channel: StorybookChannel | null): boolean {
  return getSealedCore()?.startStoryRenderedTracking(channel) ?? false;
}

export function waitForStoryRendered(wait: {
  storyId: string;
  timeoutMs: number;
  channel: StorybookChannel | null;
}): Promise<ReadinessResult> {
  const core = getSealedCore();
  if (!core) return Promise.resolve({ path: 'no-channel', rendered: false, waitedMs: 0 });
  return core.waitForStoryRendered(wait);
}

export function lastRenderedStory(): string | undefined {
  return getSealedCore()?.lastRenderedStory();
}

/** Test-only: reset the core's tracker between unit tests. */
export function __resetStoryRenderedTrackingForTests(): void {
  getSealedCore()?.__resetStoryRenderedTrackingForTests();
}
