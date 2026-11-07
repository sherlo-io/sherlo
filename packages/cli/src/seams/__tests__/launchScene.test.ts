/** LAUNCHING THE APP ON A SCENE (../launchScene) - what the phone is told to start the app with. */
import { afterEach, describe, expect, it } from 'vitest';
import { installDeviceState, posedDeviceState } from '../deviceState';
import { launchFresh } from '../launchScene';

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
});
