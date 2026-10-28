/**
 * The types of a scene's `device` field, alone in a file that imports nothing, so the CLI (which
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
 * The phone a scene runs on: which permissions are granted or denied, and where the phone is.
 * It must be a plain literal in the scene file (no variable, spread or call), because the phone is
 * set before the app starts and Sherlo reads the file without running it.
 */
export type SceneDevice = {
  permissions?: Partial<Record<ScenePermission, 'granted' | 'denied'>>;
  location?: { latitude: number; longitude: number };
};
