/**
 * The development launcher's link (developmentLauncher.ts): the one address a fresh launch of an
 * Expo development build is handed so it opens the bundler on this machine.
 */
import { describe, expect, it } from 'vitest';
import {
  androidDevelopmentLauncherLink,
  developmentLauncherLink,
  pointAndroidAppAtBundler,
  pointIosAppAtBundler,
  prepareAndroidDevMenuForCapture,
} from '../developmentLauncher';

describe('a plain React Native app on the default port', () => {
  it('a bundler on 8081 needs nothing new on either platform', async () => {
    const calls: string[][] = [];
    const run = async (_tool: string, args: string[]) => {
      calls.push(args);
      return '';
    };

    await pointIosAppAtBundler(run, 'UDID-1', 'com.example.chat', 8081);
    await pointAndroidAppAtBundler((...args) => run('adb', args), 'com.example.chat', 8081);

    expect(calls).toEqual([]);
  });
});

describe('the development launcher link of a fresh launch', () => {
  it('a listing with an exp+ scheme becomes the link that opens the bundler on that port', () => {
    const url = encodeURIComponent('http://localhost:8081');

    expect(developmentLauncherLink('scheme exp+chat here', 8081)).toBe(
      `exp+chat://expo-development-client/?url=${url}`
    );
  });

  it('a listing with no exp+ scheme has no link', () => {
    expect(developmentLauncherLink('scheme chat', 8081)).toBeUndefined();
  });

  it('an android app whose package listing has no development launcher has no link', async () => {
    const adb = async () => 'exp+chat but no launcher';

    expect(await androidDevelopmentLauncherLink(adb, 'com.example.chat', 8081)).toBeUndefined();
  });

  it('the Android dev menu prefs a scene launch writes switch the Tools button off', async () => {
    const calls: string[][] = [];
    const adb = async (...args: string[]) => {
      calls.push(args);
      return '';
    };

    await prepareAndroidDevMenuForCapture(adb, 'com.example.chat');

    const encoded = /echo (\S+) \| base64 -d/.exec(calls[0].join(' '))?.[1] ?? '';
    const xml = Buffer.from(encoded, 'base64').toString('utf-8');
    expect(xml).toContain('<boolean name="showFab" value="false" />');
  });
});
