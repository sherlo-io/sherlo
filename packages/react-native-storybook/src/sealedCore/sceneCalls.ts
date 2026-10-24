/**
 * THE SCENE CALLS OF THE HOST: what the sealed core asks of the app to capture a scene, as the seam
 * types them (./seam, SealedCoreHost). The functions behind them are the SDK's own - the play steps
 * (../playSteps), the ready rule (../storyReady), the route (../reachedScreen) and the clock the
 * clock mock cannot freeze (../settleClock) - and answer in their own words; this file turns those
 * into the seam's. None of the calls throws: a failure the core cannot read as an outcome is kept
 * as the scene's own error (../getStorybook/storyErrorRegistry), which the record reports.
 */
import bundledScenes from '../bundledScenes';
import { isBundlerAssetUrl } from '../bundlerOrigin';
import { causeOfCrash, recordStoryError, threwOf } from '../getStorybook/storyErrorRegistry';
import { SherloStepError, TAP_LOOKS_FOR_MS, playSteps } from '../playSteps';
import { reachedRoute } from '../reachedScreen';
import { rulesInstalledProof, rulesNeverMatched } from '../mocking/registry';
import { monotonicNow } from '../settleClock';
import type { PlayStep } from '../scenes';
import { asRule, awaitReady, sceneOf } from '../storyReady';
import type { ScenePlayOutcome, ScenePlayStep, SceneReadyOutcome, SealedCoreHost } from './seam';

type SceneCalls = Pick<
  SealedCoreHost,
  | 'scenes'
  | 'playSteps'
  | 'awaitReady'
  | 'reachedRoute'
  | 'monotonicNow'
  | 'rulesNeverMatched'
  | 'rulesInstalledProof'
  | 'threwOf'
  | 'causeOfCrash'
  | 'isBundlerAssetUrl'
>;

/** The scene calls the core is handed. */
export function sceneCallsForTheCore(): SceneCalls {
  return {
    scenes: () =>
      Object.entries(bundledScenes).map(([id, scene]) => ({ id, file: scene.filePath })),
    playSteps: playTheSteps,
    awaitReady: waitForReady,
    reachedRoute,
    monotonicNow,
    rulesNeverMatched,
    rulesInstalledProof,
    threwOf,
    causeOfCrash,
    isBundlerAssetUrl,
  };
}

/** The steps that name a view or a link, as the record names them; a ready step names neither. */
function recordedSteps(steps: PlayStep[]): ScenePlayStep[] {
  const recorded: ScenePlayStep[] = [];
  for (const step of steps) {
    if ('open' in step) recorded.push({ open: step.open });
    if ('tap' in step) {
      const { tap } = step;
      recorded.push({
        tap: typeof tap === 'string' ? tap : (tap.testID ?? tap.text ?? tap.label ?? ''),
      });
    }
  }
  return recorded;
}

/** Play the scene's steps; a tap whose view never showed is the outcome, any other failure the scene's error. */
async function playTheSteps(sceneId: string): Promise<ScenePlayOutcome> {
  const steps = sceneOf(sceneId)?.play ?? [];
  try {
    await playSteps(sceneId);
    return { played: recordedSteps(steps) };
  } catch (error) {
    const playedCount = error instanceof SherloStepError ? error.played.length : 0;
    const played = recordedSteps(steps.slice(0, playedCount));
    const [failed] = recordedSteps(steps.slice(playedCount, playedCount + 1));
    if (error instanceof SherloStepError && error.viewNeverShowed && failed && 'tap' in failed) {
      return { played, missing: { tap: failed.tap }, limitMs: TAP_LOOKS_FOR_MS };
    }
    keepAsTheScenesError(sceneId, error);
    return { played };
  }
}

/** Wait for the scene's own ready rule; the limit and an error the scene threw both end it. */
async function waitForReady(sceneId: string): Promise<SceneReadyOutcome> {
  const rule = asRule(sceneOf(sceneId)?.ready) ?? {};
  const ready = [rule.testID ?? []].flat().join(', ');
  try {
    const ended = await awaitReady(rule);
    if (ended.outcome === 'shown') return { outcome: 'shown', ready };
    if (ended.outcome === 'gone') return { outcome: 'gone', gone: [rule.gone ?? []].flat() };
    return { outcome: 'timed-out', ready, stayedOn: ended.route };
  } catch (_) {
    // What the app threw while the wait ran is already the scene's error (./storyReady keeps it),
    // and the record reports that in place of the ready failure.
    return { outcome: 'timed-out', ready, stayedOn: reachedRoute() };
  }
}

function keepAsTheScenesError(sceneId: string, error: unknown): void {
  const thrown = error instanceof Error ? error : new Error(String(error));
  recordStoryError(sceneId, {
    name: thrown.name,
    message: thrown.message,
    stack: thrown.stack ?? '',
    componentStack: '',
  });
}
