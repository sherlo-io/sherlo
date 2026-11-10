/** LAUNCHING THE APP ON A SCENE (../launchScene) - what the phone is told to start the app with. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDeviceState, posedDeviceState } from '../deviceState';
import { launchFresh, relaunchWithNoScene } from '../launchScene';

describe('launching the app fresh on a scene', () => {
  let uninstall = () => {};
  afterEach(() => uninstall());

  const phoneRecording = (answers: Record<string, string> = {}) => {
    const ran: string[] = [];
    uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool, args) => {
        const command = `${tool} ${args.join(' ')}`;
        ran.push(command);
        const key = Object.keys(answers).find((part) => command.includes(part));
        return key ? answers[key] : '';
      },
    });
    return ran;
  };

  it('an iOS launch stops the app and starts it with the scene, and the discover flag when asked', async () => {
    const ran = phoneRecording();

    await launchFresh(
      { device: { platform: 'ios', udid: 'SIM-1' }, app: { id: 'com.example.app' } },
      'chat--open',
      8081,
      true
    );

    expect(ran[0]).toBe('xcrun simctl terminate SIM-1 com.example.app');
    expect(ran.at(-1)).toContain('-sherloCapture chat--open -sherloDiscover YES');
  });

  it('an Android launch starts the launcher activity with the scene, and answers when it started', async () => {
    const ran = phoneRecording({
      'resolve-activity': 'priority=0\ncom.example.app/.MainActivity\n',
    });
    const before = Date.now();

    const launchedAt = await launchFresh(
      { device: { platform: 'android', serial: 'emulator-5554' }, app: { id: 'com.example.app' } },
      'chat--open',
      8081
    );

    expect(launchedAt).toBeGreaterThanOrEqual(before);
    expect(ran.at(-1)).toContain('am start -n com.example.app/.MainActivity');
    expect(ran.at(-1)).toContain('--es sherloCapture chat--open');
    expect(ran.at(-1)).not.toContain('sherloDiscover');
  });

  it('an Android phone that names no launcher activity ends the launch with what it said', async () => {
    phoneRecording({ 'resolve-activity': 'No activity found' });

    await expect(
      launchFresh(
        {
          device: { platform: 'android', serial: 'emulator-5554' },
          app: { id: 'com.example.app' },
        },
        'chat--open',
        8081
      )
    ).rejects.toThrow('No activity found');
  });

  it('after a scene capture the app is relaunched with no scene named, so a reload starts in testing mode', async () => {
    const ios = phoneRecording({
      get_app_container: '/apps/Chat.app\n',
      plutil: '"CFBundleURLSchemes" => [ 0 => "exp+chat" ]',
    });
    await relaunchWithNoScene(
      { device: { platform: 'ios', udid: 'SIM-1' }, app: { id: 'com.example.app' } },
      8082
    );
    // The put-back already closed the app; the development launcher's menu is kept off the screen.
    expect(ios.filter((line) => line.includes('terminate'))).toEqual([]);
    expect(ios.filter((line) => line.includes('defaults write'))).toEqual([
      'xcrun simctl spawn SIM-1 defaults write com.example.app EXDevMenuIsOnboardingFinished -bool YES',
      'xcrun simctl spawn SIM-1 defaults write com.example.app EXDevMenuShowsAtLaunch -bool NO',
      'xcrun simctl spawn SIM-1 defaults write com.example.app EXDevMenuShowFloatingActionButton -bool NO',
    ]);
    expect(ios.at(-1)).toBe(
      'xcrun simctl launch SIM-1 com.example.app --initialUrl ' +
        'exp+chat://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082'
    );

    const android = phoneRecording({
      'resolve-activity': 'priority=0\ncom.example.app/.MainActivity\n',
    });
    await relaunchWithNoScene(
      { device: { platform: 'android', serial: 'emulator-5554' }, app: { id: 'com.example.app' } },
      8081
    );
    expect(android.filter((line) => /force-stop|run-as|reverse/.test(line))).toEqual([]);
    expect(android.at(-1)).toBe(
      'adb -s emulator-5554 shell am start -n com.example.app/.MainActivity ' +
        '-a android.intent.action.MAIN -c android.intent.category.LAUNCHER'
    );

    const launcher = phoneRecording({
      'resolve-activity': 'priority=0\ncom.example.app/.MainActivity\n',
      dumpsys: 'expo.modules.devlauncher.launcher.DevLauncherActivity\n  exp+chat\n',
    });
    await relaunchWithNoScene(
      { device: { platform: 'android', serial: 'emulator-5554' }, app: { id: 'com.example.app' } },
      8081
    );
    expect(launcher.filter((line) => line.includes('run-as'))).toHaveLength(1);
    expect(launcher.at(-1)).toContain('-a android.intent.action.VIEW -d');
    expect(launcher.at(-1)).not.toContain('sherloCapture');
  });

  it('a phone that refuses the relaunch leaves the scene capture as it ended, and says to start the app by hand', async () => {
    phoneRecording({ 'resolve-activity': 'No activity found' });
    const told = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await expect(
        relaunchWithNoScene(
          {
            device: { platform: 'android', serial: 'emulator-5554' },
            app: { id: 'com.example.app' },
          },
          8081
        )
      ).resolves.toBeUndefined();
      expect(told).toHaveBeenCalledWith(
        'Sherlo could not start the app again after the scene (No activity found). ' +
          'Start it by hand before you capture a story.\n'
      );
    } finally {
      told.mockRestore();
    }
  });
});
