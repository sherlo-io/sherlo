/**
 * WHERE A SCENE THAT NEVER GOT READY STOPPED, as the capture record carries it: covered by a
 * screen the scene does not answer, blank, or on another screen of the app. A record with no stop
 * says the app's screen was not read.
 *
 * Types only: the record (./capturedScene) holds the union, and the lines under the ending of the
 * scene (./sceneDiagnosis) read it by its kind.
 */

/** The words on the app's screen when the capture stopped, and how many views it drew. */
export type SceneScreen = { words: string[]; views: number };

/** The capture gave up `afterMs` in, because the app was still on a consent or sign-in screen. */
export type SceneEndedEarly = { afterMs: number; stuckOn: 'consent' | 'sign-in'; button?: string };

export type SceneStop =
  /** The capture gave up early: a sign-in or consent screen covered the app. */
  | { kind: 'covered'; early: SceneEndedEarly; screen?: SceneScreen }
  /** The app is on its route and drew no views. */
  | { kind: 'blank'; screen: SceneScreen }
  /** The app drew views, and they are not the ready view. */
  | { kind: 'on-another-screen'; screen: SceneScreen };
