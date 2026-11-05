/**
 * Tests for phoneSidesOf: the phone sides a push uploads, built from the project's own files and
 * its installed SDK package, and left out - never failing the push - when an input is missing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { phoneSidesOf } from '../phoneSidesOf';

const FINGERPRINTS: any = {
  android: { hash: 'a', preimage: { autolinkedModules: ['react-native-svg@15.0.0'] } },
  ios: { hash: 'i', preimage: { autolinkedModules: ['@sherlo/react-native-storybook@3.6.0'] } },
};

let projectRoot: string;

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, file), content);
}

/** An app that names both ids, with the SDK installed and carrying its core file. */
function layProject({ withCore }: { withCore: boolean }): void {
  write(
    'app.json',
    JSON.stringify({
      expo: { ios: { bundleIdentifier: 'io.acme.app' }, android: { package: 'io.acme.app' } },
    })
  );
  const sdk = 'node_modules/@sherlo/react-native-storybook';
  write(
    `${sdk}/package.json`,
    JSON.stringify({ name: '@sherlo/react-native-storybook', version: '3.6.0', main: 'index.js' })
  );
  write(`${sdk}/index.js`, '');
  if (withCore) {
    write(`${sdk}/ios/Resources/assets/sherlo-core.js`, '// sherlo-core ios');
    write(`${sdk}/android/src/main/assets/sherlo-core.js`, '// sherlo-core android');
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-sides-'));
});

afterEach(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

describe('the phone sides of a push', () => {
  it('a push passes a phone side for each platform it uploads', () => {
    layProject({ withCore: true });

    const phoneSides = phoneSidesOf(projectRoot, ['android', 'ios'], FINGERPRINTS);

    expect(phoneSides.ios).toMatchObject({
      platform: 'ios',
      linkedModules: ['@sherlo/react-native-storybook'],
      app: { bundleIdentifier: 'io.acme.app' },
      core: { fileName: 'sherlo-core.js', source: '// sherlo-core ios' },
    });
    expect(phoneSides.android).toMatchObject({
      platform: 'android',
      linkedModules: ['react-native-svg'],
      app: { packageName: 'io.acme.app' },
      core: { source: '// sherlo-core android' },
    });
  });

  it('a push whose SDK core file is missing still pushes, with no phone side', () => {
    layProject({ withCore: false });

    expect(phoneSidesOf(projectRoot, ['android', 'ios'], FINGERPRINTS)).toEqual({});
  });

  it('a platform whose app id is unknown gets no phone side while the other keeps its own', () => {
    layProject({ withCore: true });
    write('app.json', JSON.stringify({ expo: { ios: { bundleIdentifier: 'io.acme.app' } } }));

    const phoneSides = phoneSidesOf(projectRoot, ['android', 'ios'], FINGERPRINTS);

    expect(Object.keys(phoneSides)).toEqual(['ios']);
  });
});
