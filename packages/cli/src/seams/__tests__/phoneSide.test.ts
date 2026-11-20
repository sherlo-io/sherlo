import { describe, expect, it } from 'vitest';
import { buildPhoneSide, PHONE_SIDE_VERSION } from '../phoneSide';

describe('the phone side file describes the native app', () => {
  it("the phone side holds the app identity and the SDK's core file for one platform", () => {
    const phoneSide = buildPhoneSide({
      platform: 'android',
      appIdentity: 'io.example.app',
      coreSource: 'var core = 1;',
    });

    expect(phoneSide).toEqual({
      version: PHONE_SIDE_VERSION,
      platform: 'android',
      app: { packageName: 'io.example.app' },
      core: { fileName: 'sherlo-core.js', source: 'var core = 1;' },
    });
    expect(
      buildPhoneSide({
        platform: 'ios',
        appIdentity: 'io.example.app',
        coreSource: '',
      }).app
    ).toEqual({ bundleIdentifier: 'io.example.app' });
  });

  it('the phone side holds no app source and no secret', () => {
    const phoneSide = buildPhoneSide({
      platform: 'ios',
      appIdentity: 'io.example.app',
      coreSource: 'core',
    });

    // Only these keys exist: nothing else can carry app source or a secret into the file.
    expect(Object.keys(phoneSide).sort()).toEqual(['app', 'core', 'platform', 'version']);
    expect(Object.keys(phoneSide.core).sort()).toEqual(['fileName', 'source']);
  });
});

describe('the phone side file names no native library', () => {
  it('the phone-side file the CLI uploads names no native library', () => {
    const phoneSide = buildPhoneSide({ platform: 'android', appIdentity: 'a.b', coreSource: '' });

    expect(phoneSide).not.toHaveProperty('linkedModules');
    expect(JSON.stringify(phoneSide)).not.toMatch(/linkedModules|autolinkedModules/);
  });
});
