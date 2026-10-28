/**
 * The types of ./sceneFiles.js, the reader of a project's scene files. The shapes of a scene's
 * `device` field are the SDK's own (src/sceneDeviceTypes.ts), never declared again here.
 */
import type { SceneDevice, ScenePermission } from '../src/sceneDeviceTypes';

export type { SceneDevice, ScenePermission };

/** One scene of the project: where its file is and how the file names it. */
export type ProjectScene = { key: string; title: string; name: string; file: string };

export function findSceneFiles(projectRoot: string): string[];
export function sceneIdsOfSource(fileName: string, source: string): string[];
/** The phone setup of each scene a file declares, by the scene's key in the file. */
export function sceneDevicesOf(fileName: string, source: string): Record<string, SceneDevice>;
/** Every scene in the project by its id; a scene two files declare keeps the first file's. */
export function scenesOfProject(projectRoot: string): Record<string, ProjectScene>;
export function readSceneIds(projectRoot: string): string[];
