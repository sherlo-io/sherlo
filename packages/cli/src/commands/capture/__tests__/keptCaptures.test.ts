/** EVERY LOCAL CAPTURE IS KEPT - the record, the picture and the device, under the captures folder. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import capture from '../capture';
import { ALL_SCENES_OPTION, DISCOVER_OPTION, SCENE_OPTION } from '../../../constants';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { installCaptureSocket } from '../../../seams/captureSocket';
import { installDeviceState } from '../../../seams/deviceState';
import { readKeptCaptures } from '../../../seams/localCaptures';
import { installProjectFiles } from '../../../seams/projectFiles';
import type { SceneCaptureResult } from '../../../seams/liveScene';

/** Thrown by the stubbed `process.exit`, so a case that ends in a refusal can still read what was kept. */
class LeftTheProcess extends Error {}

const A_SCENE: SceneCaptureResult = {
  kind: 'scene',
  sceneId: 'chat--open',
  bootMs: 1200,
  reached: { route: ['Chat'], ms: 900 },
  play: [],
  settled: { ms: 500, frames: 4 },
  tree: { primitive: 'View', components: ['Chat'], children: [] },
};

const NEVER_READY: SceneCaptureResult = {
  kind: 'never-reached',
  sceneId: 'chat--open',
  ready: 'chat.input',
  stayedOn: ['Home'],
};

describe('kept captures', () => {
  let project: string;
  let uninstall: Array<() => void>;

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'kept-captures-'));
    uninstall = [installProjectFiles({ root: () => project })];
    uninstall.push(
      installDeviceState({
        sceneTarget: async () => ({
          device: { platform: 'ios', udid: 'SIM-1' },
          app: { id: 'com.example.app' },
        }),
        simulatorFolder: () => project,
        makeSaveFolder: () => fs.mkdtempSync(path.join(project, 'save-')),
        run: async (tool, args) => {
          const line = `${tool} ${args.join(' ')}`;
          if (line.includes('screenshot')) fs.writeFileSync(args[args.length - 1], 'picture');
          if (line.includes('get_app_container')) return `${project}\n`;
          if (line.includes('list devicetypes')) {
            return JSON.stringify({
              devicetypes: [{ identifier: 'type-1', name: 'iPhone 15 Pro' }],
            });
          }
          if (line.includes('list devices')) {
            return JSON.stringify({
              devices: {
                'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
                  { udid: 'SIM-1', deviceTypeIdentifier: 'type-1' },
                ],
              },
            });
          }
          return '';
        },
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    uninstall.reverse().forEach((undo) => undo());
    fs.rmSync(project, { recursive: true, force: true });
  });

  /** Run the command with the app answering `answers` in turn; a refusal's exit is swallowed. */
  async function captureWith(
    answers: SceneCaptureResult[],
    options: Record<string, string | boolean>
  ) {
    let asked = 0;
    const uninstallSocket = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async () => answers[asked++],
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new LeftTheProcess('process.exit');
    }) as never);
    try {
      return await captureTranscript(async () => {
        try {
          await capture(options);
        } catch (error) {
          if (!(error instanceof LeftTheProcess)) throw error;
        }
      });
    } finally {
      exit.mockRestore();
      uninstallSocket();
    }
  }

  it('a captured scene keeps its record and picture under the captures folder', async () => {
    await captureWith([A_SCENE], { [SCENE_OPTION]: 'chat--open' });

    const [kept, ...others] = readKeptCaptures(project);
    expect(others).toEqual([]);
    expect(kept.id).toBe('chat--open');
    expect(kept.record).toMatchObject({ kind: 'scene', sceneId: 'chat--open' });
    expect(kept.screenPath && fs.readFileSync(kept.screenPath, 'utf8')).toBe('picture');
    expect(kept.device).toEqual({ deviceId: 'iphone.15.pro', os: 'iOS 17.5' });
  });

  it('a scene that was not captured keeps its record and where the app ended up', async () => {
    const { stdout } = await captureWith([NEVER_READY], { [SCENE_OPTION]: 'chat--open' });

    const [kept] = readKeptCaptures(project);
    expect(kept.record).toMatchObject({ kind: 'never-reached', stayedOn: ['Home'] });
    expect(stdout).toContain('Kept in .sherlo/captures as chat--open');
  });

  it('a scene that never reached its screen keeps no picture and says so in its record, not on the screen', async () => {
    const { stdout } = await captureWith([NEVER_READY], { [SCENE_OPTION]: 'chat--open' });

    const [kept] = readKeptCaptures(project);
    expect(kept.screenPath).toBeUndefined();
    // The time it waited and the missing picture are kept beside the record; the printed ending is as it was.
    expect(kept.record).toMatchObject({
      kind: 'never-reached',
      waitedMs: expect.any(Number),
      noPicture: { ending: 'not-captured' },
    });
    expect(stdout).not.toContain('waitedMs');
    expect(stdout).not.toContain('No picture');
  });

  it('a capture of a scene with no device named keeps the device it ran on', async () => {
    // An emulator whose AVD lives under the Android user home, where the default folder has none.
    const userHome = path.join(project, 'android-user-home');
    fs.mkdirSync(path.join(userHome, 'avd', 'Pixel_XL_API_31.avd'), { recursive: true });
    fs.writeFileSync(
      path.join(userHome, 'avd', 'Pixel_XL_API_31.avd', 'config.ini'),
      'hw.device.name=pixel_xl\nimage.sysdir.1=system-images/android-31/google_apis/arm64-v8a/\n'
    );
    vi.stubEnv('ANDROID_USER_HOME', userHome);
    vi.stubEnv('ANDROID_AVD_HOME', '');
    uninstall.push(
      installDeviceState({
        sceneTarget: async () => ({
          device: { platform: 'android', serial: 'emulator-5554' },
          app: { id: 'com.example.app' },
        }),
        simulatorFolder: () => project,
        makeSaveFolder: () => fs.mkdtempSync(path.join(project, 'save-')),
        run: async (_tool, args, options) => {
          const line = args.join(' ');
          if (options?.stdoutTo) fs.writeFileSync(options.stdoutTo, 'picture');
          if (line.includes('emu avd name')) return 'Pixel_XL_API_31\nOK\n';
          if (line.includes('emu avd path')) throw new Error('unknown command');
          if (line.includes('pm path')) return 'package:/data/app/base.apk\n';
          return '';
        },
      })
    );

    await captureWith([A_SCENE], { [SCENE_OPTION]: 'chat--open' });

    const [kept] = readKeptCaptures(project);
    expect(kept.device).toEqual({ local: true, model: 'pixel_xl', os: 'Android 12' });
  });

  it('a scene that crashed at boot keeps no picture', async () => {
    const crashed = {
      kind: 'crashed-at-boot',
      sceneId: 'chat--open',
      error: { name: 'Error', message: 'boom', file: 'a.ts', line: 1 },
    } as unknown as SceneCaptureResult;

    await captureWith([crashed], { [SCENE_OPTION]: 'chat--open' });

    expect(readKeptCaptures(project)[0].screenPath).toBeUndefined();
  });

  it('a discover capture keeps no picture', async () => {
    await captureWith([NEVER_READY], { [SCENE_OPTION]: 'chat--open', [DISCOVER_OPTION]: true });

    expect(readKeptCaptures(project)[0].screenPath).toBeUndefined();
  });

  it('capturing every scene keeps one capture per scene', async () => {
    fs.writeFileSync(
      path.join(project, 'chat.scenes.tsx'),
      'export default scenes({ scenes: { Open: {}, Menu: {} } });\n'
    );

    // Each answer names the scene it was asked about, as the app's own does.
    const menuNeverReached = { ...NEVER_READY, sceneId: 'chat--menu' };
    const { stdout } = await captureWith([A_SCENE, menuNeverReached], {
      [ALL_SCENES_OPTION]: true,
    });

    expect(
      readKeptCaptures(project)
        .map((kept) => kept.id)
        .sort()
    ).toEqual(['chat--menu', 'chat--open']);
    expect(stdout).toContain('chat--open captured');
    expect(stdout).toContain('chat--menu never reached');
  });
});
