/** A LOOK AT THE PHONE'S SCREEN (../screenLook) - what a dump of the screen says is on it. */
import { afterEach, describe, expect, it } from 'vitest';
import { installDeviceState, posedDeviceState } from '../deviceState';
import { lookAtScreen, readUiDump } from '../screenLook';

const nodeOf = (attributes: Record<string, string>) =>
  `<node ${Object.entries({
    class: 'android.widget.TextView',
    package: 'com.example.chat',
    ...attributes,
  })
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')} />`;

const dumpOf = (...nodes: string[]) => `<hierarchy rotation="0">${nodes.join('')}</hierarchy>`;

describe('what a dump of the screen says is on it', () => {
  it('lists the words, counts the views that draw and sees a progress indicator', () => {
    const look = readUiDump(
      dumpOf(
        nodeOf({ class: 'android.view.ViewGroup' }),
        nodeOf({ text: 'Inbox' }),
        nodeOf({ class: 'android.widget.ProgressBar' })
      )
    );

    expect(look).toEqual({ words: ['Inbox'], views: 2, loading: true });
  });

  it('a screen that draws no views is a look with no words and no views', () => {
    expect(readUiDump(dumpOf(nodeOf({ class: 'android.view.ViewGroup' })))).toEqual({
      words: [],
      views: 0,
      loading: false,
    });
  });

  it('a system permission dialog names the permission it asks for', () => {
    const look = readUiDump(
      dumpOf(
        nodeOf({
          text: 'Allow Chat to access your location?',
          package: 'com.google.android.permissioncontroller',
        })
      )
    );

    expect(look?.permission).toBe('location');
  });

  it('a dump with no screen in it is no look', () => {
    expect(readUiDump('ERROR: could not get idle state.')).toBeUndefined();
  });
});

describe('looking at a phone', () => {
  let uninstall = () => {};
  afterEach(() => uninstall());

  it('an iOS simulator gives no look and is not asked', async () => {
    const ran: string[] = [];
    uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool) => {
        ran.push(tool);
        return '';
      },
    });

    expect(await lookAtScreen({ platform: 'ios', udid: 'SIM-1' })).toBeUndefined();
    expect(ran).toEqual([]);
  });

  it('an Android phone is asked for its dump', async () => {
    const asked: string[] = [];
    uninstall = installDeviceState({
      ...posedDeviceState(),
      run: async (tool, args) => {
        asked.push(`${tool} ${args.join(' ')}`);
        return dumpOf(nodeOf({ text: 'Inbox' }));
      },
    });

    const look = await lookAtScreen({ platform: 'android', serial: 'emulator-5554' });

    expect(look?.words).toEqual(['Inbox']);
    expect(asked).toEqual(['adb -s emulator-5554 shell uiautomator dump /dev/tty']);
  });
});
