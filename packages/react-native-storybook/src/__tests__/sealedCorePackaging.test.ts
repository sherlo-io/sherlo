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

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PACKAGE_ROOT = path.resolve(__dirname, '../..');

// Builds the bundler plugin, packs the SDK into a temporary folder and unpacks the tarball there,
// so the test reads what a customer would install. The build runs as its own step and the pack
// skips lifecycle scripts, so the pack's JSON output is never mixed with build logs.
function packIntoTemporaryFolder(): { unpackedPackageDir: string; packedFilePaths: string[] } {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-pack-'));
  execFileSync('yarn', ['build:metro'], { cwd: PACKAGE_ROOT, stdio: 'ignore' });
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryDir],
    { cwd: PACKAGE_ROOT, encoding: 'utf8' }
  );
  const [{ filename, files }] = JSON.parse(packOutput);
  execFileSync('tar', ['-xzf', path.join(temporaryDir, filename), '-C', temporaryDir]);

  return {
    unpackedPackageDir: path.join(temporaryDir, 'package'),
    packedFilePaths: files.map((file: { path: string }) => file.path),
  };
}

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

  it('the published bundler plugin is a minified bundle that requires no file of its own source', () => {
    const { unpackedPackageDir, packedFilePaths } = packIntoTemporaryFolder();

    const readableMetroSources = packedFilePaths.filter(
      (filePath) => filePath.startsWith('metro/') && filePath.endsWith('.js')
    );
    expect(readableMetroSources).toEqual([]);

    for (const bundleName of ['withStorybook.js', 'polyfill.js']) {
      expect(packedFilePaths).toContain('dist-metro/' + bundleName);
      const bundleSource = fs.readFileSync(
        path.join(unpackedPackageDir, 'dist-metro', bundleName),
        'utf8'
      );
      // minified: a readable source line is far shorter than a bundle's longest line
      const longestLineLength = Math.max(...bundleSource.split('\n').map((line) => line.length));
      expect(longestLineLength).toBeGreaterThan(1000);
    }

    // requires no file of its own source: no relative require is left in the bundle
    const withStorybookSource = fs.readFileSync(
      path.join(unpackedPackageDir, 'dist-metro', 'withStorybook.js'),
      'utf8'
    );
    expect(withStorybookSource).not.toMatch(/require\(["']\.\.?\//);

    // the generator's path is still resolved at run time to a real file, not bundled into a number
    // (a bundler turns a literal require.resolve of an external package into a module id)
    expect(withStorybookSource).toMatch(
      /createRequire\(__filename\)\.resolve\(["']@storybook\/react-native\/scripts\/generate["']\)/
    );
    expect(withStorybookSource).not.toMatch(/=\d+;var \w+="var generateModule/);

    const exportsMap = JSON.parse(
      fs.readFileSync(path.join(unpackedPackageDir, 'package.json'), 'utf8')
    ).exports;
    for (const entryName of ['./metro/withStorybook', './metro/polyfill']) {
      expect(fs.existsSync(path.join(unpackedPackageDir, exportsMap[entryName].default))).toBe(
        true
      );
    }
  }, 120_000);

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
