import { describe, expect, it } from 'vitest';
import { buildPhoneSide, PHONE_SIDE_VERSION } from '../phoneSide';

describe('the phone side file describes the native app', () => {
  it("the phone side lists the linked native modules, the app identity and the SDK's core file for one platform", () => {
    const phoneSide = buildPhoneSide({
      platform: 'android',
      autolinkedModules: ['react-native-svg@15.0.0', '@react-native-community/slider@4.5.0'],
      appIdentity: 'io.example.app',
      coreSource: 'var core = 1;',
    });

    expect(phoneSide).toEqual({
      version: PHONE_SIDE_VERSION,
      platform: 'android',
      linkedModules: ['@react-native-community/slider', 'react-native-svg'],
      app: { packageName: 'io.example.app' },
      core: { fileName: 'sherlo-core.js', source: 'var core = 1;' },
    });
    expect(
      buildPhoneSide({
        platform: 'ios',
        autolinkedModules: [],
        appIdentity: 'io.example.app',
        coreSource: '',
      }).app
    ).toEqual({ bundleIdentifier: 'io.example.app' });
  });

  it('the phone side holds no app source and no secret', () => {
    const phoneSide = buildPhoneSide({
      platform: 'ios',
      autolinkedModules: ['react-native-svg@15.0.0'],
      appIdentity: 'io.example.app',
      coreSource: 'core',
    });

    // Only these keys exist: nothing else can carry app source or a secret into the file.
    expect(Object.keys(phoneSide).sort()).toEqual([
      'app',
      'core',
      'linkedModules',
      'platform',
      'version',
    ]);
    expect(Object.keys(phoneSide.core).sort()).toEqual(['fileName', 'source']);
  });
});
