/**
 * What the published SDK carries, and what the repository does not: each name is a rule the book
 * marks on "The sealed core" and "Working on the SDK". The bodies of the C-core, bundler-plugin and
 * release-key rules come with their own tasks; they stay empty shells here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SDK_ROOT, '..', '..');

const IOS_ASSET = 'ios/Resources/assets/sherlo-core.js';
const ANDROID_ASSET = 'android/src/main/assets/sherlo-core.js';

describe('what the published package carries', () => {
  describe('the published files carry the JS core as an asset for iOS and Android', () => {
    // npm pack runs the SDK's prepack, which builds the core and copies it into both asset folders,
    // so a dry-run pack lists exactly what a publish would upload. The build is the slow part.
    let packedFiles: string[];

    beforeAll(() => {
      // Build and copy the assets the way the SDK's prepack does, then ask npm what a pack would
      // carry - so this holds whether or not a dry-run pack runs the prepack lifecycle itself.
      execFileSync('node', ['scripts/packSealedCore.js'], {
        cwd: SDK_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: SDK_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      const [packed] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
      packedFiles = packed.files.map((file) => file.path);
    }, 120_000);

    it('the published files carry the JS core as an asset for iOS and Android', () => {
      expect(packedFiles).toContain(IOS_ASSET);
      expect(packedFiles).toContain(ANDROID_ASSET);
    });

    afterAll(() => {
      // The dry-run built the assets; clear them so a local run leaves no sealed part behind.
      for (const asset of [IOS_ASSET, ANDROID_ASSET]) {
        fs.rmSync(path.join(SDK_ROOT, asset), { force: true });
      }
    });
  });

  it('the podspec vendors the C core xcframework', () => {});

  it('the published files carry a C core library for every Android ABI', () => {});

  it('the published files carry no readable source of either core', () => {});

  it('the published bundler plugin is a minified bundle that requires no file of its own source', () => {});

  it('a pack builds both sealed parts before it packs', () => {});

  it('no built sealed part is committed', () => {
    const builtSealedParts = [
      'packages/sherlo-core/sherlo-core.js',
      'packages/react-native-storybook/ios/Resources/assets/sherlo-core.js',
      'packages/react-native-storybook/android/src/main/assets/sherlo-core.js',
    ];

    for (const builtPart of builtSealedParts) {
      // Nothing of the built core is tracked...
      const tracked = execFileSync('git', ['ls-files', builtPart], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(tracked.trim()).toBe('');

      // ...and git ignores it, so a build made beside the source cannot be committed by accident.
      const ignored = execFileSync('git', ['check-ignore', builtPart], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(ignored.trim()).toBe(builtPart);
    }
  });

  it('a release build refuses the test public key', () => {});
});
