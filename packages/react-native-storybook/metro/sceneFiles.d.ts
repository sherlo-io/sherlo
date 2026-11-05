/**
 * The types of ./sceneFiles.js, the reader of a project's scene files. The shapes of a scene's
 * phone settings are the SDK's own (src/sceneDeviceTypes.ts), never declared again here.
 */
import type {
  SceneDevice,
  SceneMember,
  ScenePermission,
  ScenePhone,
} from '../src/sceneDeviceTypes';

export type { SceneDevice, SceneMember, ScenePermission, ScenePhone };

/** One scene of the project: where its file is, how the file names it, and its phone. */
export type ProjectScene = {
  key: string;
  title: string;
  name: string;
  file: string;
  device: ScenePhone;
  /** Which entries of its `given` list a file other than the scene file built (SharedMark). */
  shared: boolean | unknown[];
  /** The files besides its own that its `given` list was worked out from. */
  reads: string[];
};

export function findSceneFiles(projectRoot: string): string[];
export function sceneIdsOfSource(fileName: string, source: string): string[];
/**
 * The phone settings and the member of each scene a file declares, by the scene's key in the file,
 * worked out from its `given` list while bundling. A full path as `fileName` lets the functions
 * the file imports from beside it be followed.
 */
export function sceneDevicesOf(fileName: string, source: string): Record<string, ScenePhone>;
/** Every scene in the project by its id; a scene two files declare keeps the first file's. */
export function scenesOfProject(projectRoot: string): Record<string, ProjectScene>;
export function readSceneIds(projectRoot: string): string[];
