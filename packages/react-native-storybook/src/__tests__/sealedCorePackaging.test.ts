// Shells: each name is a rule the book marks on "The sealed core" and "Working on the SDK". The
// bodies come with the code.

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
  it('the published files carry the JS core as an asset for iOS and Android', () => {});

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

  it('no built sealed part is committed', () => {});

  it('a release build refuses the test public key', () => {});
});
