/**
 * The options `sherlo capture` takes, read by the command and by the run of one scene.
 */
import {
  ALL_SCENES_OPTION,
  DISCOVER_OPTION,
  JSON_OPTION,
  LOGS_OPTION,
  PNG_OPTION,
  PORT_OPTION,
  SCENE_OPTION,
  STOP_ON_REPEAT_OPTION,
  STORY_OPTION,
} from '../../constants';

export type CaptureOptions = {
  [STORY_OPTION]?: string;
  [SCENE_OPTION]?: string;
  [ALL_SCENES_OPTION]?: boolean;
  [STOP_ON_REPEAT_OPTION]?: boolean;
  [DISCOVER_OPTION]?: boolean;
  [PORT_OPTION]?: string;
  [JSON_OPTION]?: boolean;
  [LOGS_OPTION]?: boolean;
  [PNG_OPTION]?: string;
};
