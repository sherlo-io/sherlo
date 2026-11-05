/**
 * THE NEWS A POSED SCENE TELLS BEYOND ITS ENDING, grouped by the ending it belongs to.
 *
 * What a scene that stopped or was captured carries (the error it threw, the module fakes that did
 * not apply, the requests let through, the phone settings not written, the findings and the logged
 * errors) is {@link PosedSceneNews}. What only a scene that never got ready carries - where the
 * app stopped, the shape a fake got wrong, the last run's ending - is {@link PosedStopNews}.
 * A pose states the screen and why the capture gave up as flat fields; the record carries them as
 * one stop (../render/sceneStop), so this module is where the two meet.
 */
import type { SceneLeft } from '../render/capturedScene';
import type { SceneEndedEarly, SceneScreen, SceneStop } from '../render/sceneStop';

/** What the app found beyond the ending of a scene that stopped or was captured. */
export type PosedSceneNews = Pick<
  SceneLeft,
  'threw' | 'mockNotApplied' | 'letThrough' | 'phoneNotApplied' | 'answerFindings' | 'loggedErrors'
>;

/** What only a scene that never got ready tells: the screen it stopped on, why the capture gave up, the shape a fake got wrong, the last run's ending. */
export type PosedStopNews = Pick<SceneLeft, 'crashCause' | 'lastRun'> & {
  /** The words on the app's screen when the capture stopped, and how many views it drew. */
  screen?: SceneScreen;
  /** The capture gave up `afterMs` in, because the app was still on a consent or sign-in screen. */
  endedEarly?: SceneEndedEarly;
};

/** The fields of a pose that tell the scene's news, kept when the pose states them. */
const NEWS_KEYS = [
  'threw',
  'mockNotApplied',
  'letThrough',
  'phoneNotApplied',
  'answerFindings',
  'loggedErrors',
] as const;

export function newsOf(posed: PosedSceneNews): PosedSceneNews {
  const news: PosedSceneNews = {};
  for (const key of NEWS_KEYS) {
    if (posed[key] !== undefined) Object.assign(news, { [key]: posed[key] });
  }
  return news;
}

/** The stop a pose's flat fields name: covered first, then a screen that drew nothing, then any other screen. */
function stopOfPosed({ screen, endedEarly }: PosedStopNews): SceneStop | undefined {
  if (endedEarly) return { kind: 'covered', early: endedEarly, ...(screen && { screen }) };
  if (screen?.views === 0) return { kind: 'blank', screen };
  if (screen) return { kind: 'on-another-screen', screen };
  return undefined;
}

/** The record's stop, the shape a fake got wrong and the last run, kept when the pose states them. */
export function stopNewsOf(posed: PosedStopNews): Pick<SceneLeft, 'crashCause' | 'lastRun'> & {
  stop?: SceneStop;
} {
  const stop = stopOfPosed(posed);
  return {
    ...(posed.crashCause !== undefined && { crashCause: posed.crashCause }),
    ...(posed.lastRun !== undefined && { lastRun: posed.lastRun }),
    ...(stop && { stop }),
  };
}
