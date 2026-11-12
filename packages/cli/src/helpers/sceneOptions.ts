/**
 * THE SCENE OPTIONS OF `open` AND `capture` - listed only for a team with the scenes flag on.
 *
 * `start()` decides before it builds the commands, because the list depends on the answer. Only a
 * line naming `open` or `capture` asks (through the workstation seam, which keeps the answer for
 * the run, ./scenesFlag); any other command lists no scene option, so it asks nothing. A run that
 * was never asked, as a pose states nothing about a team, lists today's options; a run the service
 * answered "no" for, or could not answer, lists none.
 */
import {
  ALL_SCENES_OPTION,
  CAPTURE_COMMAND,
  DEFAULT_CONFIG_FILENAME,
  DISCOVER_OPTION,
  OPEN_COMMAND,
  PNG_OPTION,
  SCENE_OPTION,
  STOP_ON_REPEAT_OPTION,
  SUGGEST_COMMAND,
} from '../constants';
import { projectFiles } from '../seams/projectFiles';
import { workstation } from '../seams/workstation';
import { readProjectJson } from './projectJson';

/** The scene options as `--help` words them; `start.ts` lists them only when scenes are on. */
export const SCENE_OPTION_DEFINITION: Record<string, [string, string]> = {
  [SCENE_OPTION]: [
    `--${SCENE_OPTION} <id>`,
    'The scene to boot the app fresh on, by its id (e.g. chat--conversation) - instead of --story',
  ],
  [ALL_SCENES_OPTION]: ['--all-scenes', 'Capture every scene the app declares, each one kept'],
  [STOP_ON_REPEAT_OPTION]: [
    '--stop-on-repeat',
    'Stop when 2 scenes in a row end for one cause, instead of warning once and carrying on. Needs --all-scenes.',
  ],
  [DISCOVER_OPTION]: [
    `--${DISCOVER_OPTION}`,
    'List the requests the scene makes that no mock answers, as rules to paste into the scene file. Writes no picture. Needs --scene.',
  ],
};

/** Whether scenes are on for this run: off only when the service answered "no" for the team. */
export function scenesOn(): boolean {
  return workstation().scenesFlag() !== 'off';
}

/** The scene options `open` takes: none for a team with scenes off. */
export function openSceneOptions(): string[] {
  return scenesOn() ? [SCENE_OPTION] : [];
}

/** The scene options `capture` takes (`--png` only goes with a scene): none with scenes off. */
export function captureSceneOptions(): string[] {
  return !scenesOn()
    ? []
    : [SCENE_OPTION, ALL_SCENES_OPTION, STOP_ON_REPEAT_OPTION, DISCOVER_OPTION, PNG_OPTION];
}

/** Ask for the team of the project the config in the working folder names, if a command needs it. */
export async function decideScenesBeforeCommands(args: string[]): Promise<void> {
  const asking = [OPEN_COMMAND, CAPTURE_COMMAND, SUGGEST_COMMAND];
  if (!args.some((arg) => asking.includes(arg))) return;

  const configProject = readProjectJson(projectFiles().root(), DEFAULT_CONFIG_FILENAME)?.project;
  await workstation().askScenesFlag(configProject);
}
