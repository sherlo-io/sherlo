/**
 * The options `sherlo capture` takes, read by the command and by the run of one scene.
 */
import {
  ALL_SCENES_OPTION,
  DISCOVER_OPTION,
  JSON_OPTION,
  LIST_OPTION,
  LOGS_OPTION,
  PNG_OPTION,
  PORT_OPTION,
  SCENE_OPTION,
  STOP_ON_REPEAT_OPTION,
  STORY_OPTION,
  TREE_OPTION,
} from '../../constants';
import { captureSceneOptions } from '../../helpers/sceneOptions';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [LIST_OPTION]?: boolean;
  [SCENE_OPTION]?: string;
  [ALL_SCENES_OPTION]?: boolean;
  [STOP_ON_REPEAT_OPTION]?: boolean;
  [DISCOVER_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
  [LOGS_OPTION]?: boolean;
  [PNG_OPTION]?: string;
  [TREE_OPTION]?: boolean;
};

/** The flags `sherlo capture --help` lists, in order: the scene ones only for a team with scenes on. */
export function captureCommandOptions(): string[] {
  return [
    STORY_OPTION,
    LIST_OPTION,
    ...captureSceneOptions(),
    PORT_OPTION,
    JSON_OPTION,
    LOGS_OPTION,
    TREE_OPTION,
  ];
}
