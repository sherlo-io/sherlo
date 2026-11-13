/**
 * The scene options (../sceneOptions): listed unless the service said scenes are off, and only a
 * line naming `open` or `capture` asks the service at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWorkstation, posedWorkstation } from '../../seams/workstation';
import { captureSceneOptions, decideScenesBeforeCommands, openSceneOptions } from '../sceneOptions';

let restore: () => void;

afterEach(() => restore());

const workstationSaying = (scenes: 'on' | 'off' | undefined) => {
  const posed = posedWorkstation({
    install: { package: '@sherlo/react-native-storybook@2.0.2' },
    enter: 'pressed',
    scenes,
  });
  const askScenesFlag = vi.spyOn(posed, 'askScenesFlag');
  restore = installWorkstation(posed);
  return askScenesFlag;
};

describe('the scene options', () => {
  it('are listed when the team has scenes on, and when nothing has been asked', () => {
    workstationSaying('on');
    expect(openSceneOptions()).toEqual(['scene']);
    expect(captureSceneOptions()).toEqual(
      expect.arrayContaining(['scene', 'allScenes', 'stopOnRepeat', 'discover', 'png'])
    );
    restore();

    workstationSaying(undefined);
    expect(openSceneOptions()).toEqual(['scene']);
  });

  it('are none when the team has scenes off', () => {
    workstationSaying('off');

    expect(openSceneOptions()).toEqual([]);
    expect(captureSceneOptions()).toEqual([]);
  });

  it('are asked for only by a line naming open or capture', async () => {
    const asked = workstationSaying('on');

    await decideScenesBeforeCommands(['node', 'sherlo', 'test']);
    expect(asked).not.toHaveBeenCalled();

    await decideScenesBeforeCommands(['node', 'sherlo', 'open', '--help']);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
