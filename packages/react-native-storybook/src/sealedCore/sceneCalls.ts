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
import { logTheLine } from '../connection/appLine';
import { causeOfCrash, recordStoryError, threwOf } from '../getStorybook/storyErrorRegistry';
import {
  SherloStepError,
  TAP_LOOKS_FOR_MS,
  nameOf,
  playSteps,
  targetOf,
  testIDsOnScreen,
} from '../playSteps';
import { reachedRoute } from '../reachedScreen';
import { rulesInstalledProof, rulesNeverMatched } from '../mocking/registry';
import { monotonicNow } from '../settleClock';
import type { PlayStep } from '../scenes';
import { awaitReady, readyRuleOf, sceneOf } from '../storyReady';
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
      Object.entries(bundledScenes).map(([id, scene]) => ({
        id,
        file: scene.filePath,
        title: scene.title,
        name: scene.name,
      })),
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
  playUnfinished.add(sceneId);
  try {
    await playSteps(sceneId);
    playUnfinished.delete(sceneId);
    return { played: recordedSteps(steps) };
  } catch (error) {
    const playedCount = error instanceof SherloStepError ? error.played.length : 0;
    const played = recordedSteps(steps.slice(0, playedCount));
    const [failed] = recordedSteps(steps.slice(playedCount, playedCount + 1));
    if (error instanceof SherloStepError && error.viewNeverShowed && failed && 'tap' in failed) {
      // The first tap found nothing: the ready wait decides what that means. If the ready view
      // never shows either, the app never got to the screen the scene meant (a sign-in, say) and
      // the scene ends as never-reached, the ready wait's answer kept for the core's own ask. If
      // the view shows, the tap is what failed, and nothing is captured.
      if (playedCount === 0) {
        const ended = await waitOnReadyRule(sceneId);
        if (ended.outcome === 'timed-out') {
          readyEndedDuringPlay.set(sceneId, ended);
          return { played };
        }
      }
      return {
        played,
        missing: { tap: missedTapName(steps[playedCount]) },
        limitMs: TAP_LOOKS_FOR_MS,
      };
    }
    keepAsTheScenesError(sceneId, error);
    return { played };
  }
}

/** The scenes whose steps began and did not all play (lost, missed or still running): none is captured. */
const playUnfinished = new Set<string>();

/** The ready wait that already ended while a scene's first tap was missing, by scene; the core's ask takes it. */
const readyEndedDuringPlay = new Map<string, SceneReadyOutcome>();

/** A missed tap as the CLI names it: a testID bare, a text or label as `text "Row"` (./playSteps). */
function missedTapName(step: PlayStep | undefined): string {
  if (!step || !('tap' in step)) return '';
  const target = targetOf(step.tap);
  return target.testID ?? nameOf(target);
}

/** The core's ask for the ready view: a scene whose steps did not all play is never ready. */
async function waitForReady(sceneId: string): Promise<SceneReadyOutcome> {
  const alreadyEnded = readyEndedDuringPlay.get(sceneId);
  if (alreadyEnded) {
    readyEndedDuringPlay.delete(sceneId);
    playUnfinished.delete(sceneId);
    return alreadyEnded;
  }
  if (playUnfinished.delete(sceneId)) {
    // A ready view met before every step played (a tab button every tab draws, say) is no capture.
    return neverReached(sceneId, reachedRoute());
  }
  return waitOnReadyRule(sceneId);
}

/** The scene's ready rule and the names of the views it waits for, joined for the record. */
function ruleAndReadyNames(sceneId: string) {
  const rule = readyRuleOf(sceneId) ?? {};
  return { rule, ready: [rule.testID ?? []].flat().join(', ') };
}

/** The scene's ready view never showed: the ready names, where the app stayed and what was on screen. */
async function neverReached(sceneId: string, stayedOn: string[]): Promise<SceneReadyOutcome> {
  const { ready } = ruleAndReadyNames(sceneId);
  return { outcome: 'timed-out', ready, stayedOn, seen: await viewsSeen() };
}

/** Wait for the scene's own ready rule; the limit and an error the scene threw both end it. */
async function waitOnReadyRule(sceneId: string): Promise<SceneReadyOutcome> {
  const { rule, ready } = ruleAndReadyNames(sceneId);
  try {
    logTheLine(`scene ${sceneId} ready rule waited`);
    const ended = await awaitReady(rule);
    const ending = ended.outcome === 'timed-out' ? 'timed out' : 'met';
    logTheLine(`scene ${sceneId} ready rule ${ending}`);
    if (ended.outcome === 'shown') return { outcome: 'shown', ready };
    if (ended.outcome === 'gone') return { outcome: 'gone', gone: [rule.gone ?? []].flat() };
    return neverReached(sceneId, ended.route);
  } catch (_) {
    // What the app threw while the wait ran is already the scene's error (./storyReady keeps it),
    // and the record reports that in place of the ready failure.
    return neverReached(sceneId, reachedRoute());
  }
}

/** The most test ids a never-reached ending lists; the rest are only counted. */
const SEEN_LIMIT = 50;

/** The test ids on screen as the wait gave up; none listed when the screen cannot be read. */
async function viewsSeen(): Promise<Awaited<ReturnType<typeof testIDsOnScreen>>> {
  try {
    return await testIDsOnScreen(SEEN_LIMIT);
  } catch (_) {
    // The list only helps the developer: a screen that cannot be read must not hide the ending.
    return { testIDs: [], more: 0 };
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
