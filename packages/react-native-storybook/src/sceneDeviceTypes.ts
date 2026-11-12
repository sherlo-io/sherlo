/**
 * The types of a scene's phone settings, alone in a file that imports nothing, so the CLI (which
 * reads them through metro/sceneFiles.d.ts) takes no app type along with them.
 */

/** A phone permission a scene can grant or deny; the set the runner can set on both platforms. */
export type ScenePermission =
  | 'camera'
  | 'microphone'
  | 'photos'
  | 'contacts'
  | 'location'
  | 'notifications'
  | 'calendar';

/**
 * The phone-settings part of a precondition: which permissions are granted or denied, and where the
 * phone is. The phone is set before the app starts, so Sherlo works these out while it bundles
 * (metro/givenReader.js) from plain values and the team's own functions that return them.
 */
export type SceneDevice = {
  permissions?: Partial<Record<ScenePermission, 'granted' | 'denied'>>;
  location?: { latitude: number; longitude: number };
};

/** Who the app starts for when no one is signed in: signed out, or on a fresh install. */
export type SceneMember = 'signed-out' | 'fresh-install';

/** What Sherlo reads of a scene's phone before it launches: its settings and its member. */
export type ScenePhone = SceneDevice & { member?: SceneMember };
