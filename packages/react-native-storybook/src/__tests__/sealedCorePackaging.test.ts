/**
 * What the published SDK carries, and what the repository does not: each name is a rule the book
 * marks on "The sealed core" and "Working on the SDK". The bodies of the readable-source and
 * release-key rules come with their own tasks; they stay empty shells here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import {
  ANDROID_ABIS,
  ANDROID_PAGE_SIZE,
  missingAndroidTools,
  missingIosTools,
} from '../../../sherlo-core/native/build.js';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SDK_ROOT, '..', '..');

const IOS_ASSET = 'ios/Resources/assets/sherlo-core.js';
const ANDROID_ASSET = 'android/src/main/assets/sherlo-core.js';
const XCFRAMEWORK = 'ios/SherloCore.xcframework';
const XCFRAMEWORK_SLICES = [
  XCFRAMEWORK + '/ios-arm64/libsherlocore.a',
  XCFRAMEWORK + '/ios-arm64_x86_64-simulator/libsherlocore.a',
];
const ANDROID_LIBRARIES = ANDROID_ABIS.map(
  ({ abi }: { abi: string }) => 'android/src/main/jniLibs/' + abi + '/libsherlocore.so'
);

// Builds the bundler plugin, packs the SDK into a temporary folder and unpacks the tarball there,
// so the test reads what a customer would install. The build runs as its own step and the pack
// skips lifecycle scripts, so the pack's JSON output is never mixed with build logs.
function packIntoTemporaryFolder(): { unpackedPackageDir: string; packedFilePaths: string[] } {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-pack-'));
  execFileSync('yarn', ['build:metro'], { cwd: SDK_ROOT, stdio: 'ignore' });
  const packOutput = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryDir],
    { cwd: SDK_ROOT, encoding: 'utf8' }
  );
  const [{ filename, files }] = JSON.parse(packOutput);
  execFileSync('tar', ['-xzf', path.join(temporaryDir, filename), '-C', temporaryDir]);

  return {
    unpackedPackageDir: path.join(temporaryDir, 'package'),
    packedFilePaths: files.map((file: { path: string }) => file.path),
  };
}

/** Every sealed part a pack builds into the SDK, removed, so a pack must build each again. */
function removeBuiltSealedParts() {
  for (const builtPart of [IOS_ASSET, ANDROID_ASSET, XCFRAMEWORK, 'android/src/main/jniLibs']) {
    fs.rmSync(path.join(SDK_ROOT, builtPart), { recursive: true, force: true });
  }
}

/** The alignment of each loadable segment of an ELF shared library. */
function loadSegmentAlignments(library: Buffer): number[] {
  const is64Bit = library[4] === 2;
  const readWord = (offset: number) =>
    is64Bit ? Number(library.readBigUInt64LE(offset)) : library.readUInt32LE(offset);
  const programHeadersAt = readWord(is64Bit ? 0x20 : 0x1c);
  const programHeaderSize = library.readUInt16LE(is64Bit ? 0x36 : 0x2a);
  const programHeaderCount = library.readUInt16LE(is64Bit ? 0x38 : 0x2c);
  const LOADABLE = 1;

  const alignments: number[] = [];
  for (let index = 0; index < programHeaderCount; index++) {
    const header = programHeadersAt + index * programHeaderSize;
    if (library.readUInt32LE(header) !== LOADABLE) continue;
    alignments.push(readWord(header + (is64Bit ? 0x30 : 0x1c)));
  }
  return alignments;
}

describe('what the published package carries', () => {
  describe('the published files carry the JS core as an asset for iOS and Android', () => {
    let packedFiles: string[];

    beforeAll(() => {
      // Build and copy the assets the way the SDK's prepack does, then ask npm what a pack would
      // carry - so this holds whether or not a dry-run pack runs the prepack lifecycle itself.
      execFileSync('node', ['scripts/packSealedCore.js', 'js'], {
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

  describe('the C core, from a real pack', () => {
    // The C core builds with Xcode and the Android NDK. On a machine without both, a pack cannot
    // run, and these rules check what they can without one.
    const missingTools = [missingIosTools(), missingAndroidTools()].filter(Boolean) as string[];
    let packedFiles: string[] = [];
    let unpackedPackageDir = '';

    beforeAll(() => {
      if (missingTools.length > 0) {
        console.warn('no real pack on this machine: ' + missingTools.join('; '));
        return;
      }
      // Pack as a publish does, prepack and all, with no sealed part built beforehand.
      removeBuiltSealedParts();
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-real-pack-'));
      execFileSync('npm', ['pack', '--pack-destination', temporaryDir], {
        cwd: SDK_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const tarball = fs.readdirSync(temporaryDir).find((name) => name.endsWith('.tgz'))!;
      execFileSync('tar', ['-xzf', path.join(temporaryDir, tarball), '-C', temporaryDir]);
      packedFiles = execFileSync('tar', ['-tzf', path.join(temporaryDir, tarball)], {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .map((entry) => entry.replace(/^package\//, ''));
      unpackedPackageDir = path.join(temporaryDir, 'package');
    }, 300_000);

    afterAll(() => {
      // The pack built every sealed part into the SDK; clear them so a local run leaves none.
      if (missingTools.length === 0) removeBuiltSealedParts();
    });

    it('the podspec vendors the C core xcframework', () => {
      const podspec = fs.readFileSync(
        path.join(SDK_ROOT, 'sherlo-react-native-storybook.podspec'),
        'utf8'
      );
      expect(podspec).toContain('s.vendored_frameworks = "' + XCFRAMEWORK + '"');
      const manifest = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'package.json'), 'utf8'));
      expect(manifest.files).toContain(XCFRAMEWORK);

      if (missingTools.length > 0) {
        console.warn('the xcframework itself was not built here, so its slices are not checked');
        return;
      }
      for (const slice of XCFRAMEWORK_SLICES) expect(packedFiles).toContain(slice);
      // Both slices are named libsherlocore.a, or CocoaPods refuses the xcframework.
      const infoPlist = fs.readFileSync(
        path.join(unpackedPackageDir, XCFRAMEWORK, 'Info.plist'),
        'utf8'
      );
      const libraryPathPattern = /<key>LibraryPath<\/key>\s*<string>([^<]+)<\/string>/g;
      const libraryPaths = [...infoPlist.matchAll(libraryPathPattern)].map((match) => match[1]);
      expect(libraryPaths).toEqual(['libsherlocore.a', 'libsherlocore.a']);
    });

    it('the published files carry a C core library for every Android ABI', (context) => {
      if (missingTools.length > 0) {
        console.warn('not checked here: ' + missingTools.join('; '));
        context.skip();
      }
      // The rule that keeps CompiledCore's native method names under R8 ships with them.
      expect(packedFiles).toContain('android/consumer-rules.pro');
      for (const library of ANDROID_LIBRARIES) {
        expect(packedFiles).toContain(library);
        // 16 KB page aligned: every loadable segment.
        const libraryBytes = fs.readFileSync(path.join(unpackedPackageDir, library));
        const alignments = loadSegmentAlignments(libraryBytes);
        expect(alignments.length, library).toBeGreaterThan(0);
        for (const alignment of alignments) expect(alignment, library).toBe(ANDROID_PAGE_SIZE);
      }
    });

    it('a pack builds both sealed parts before it packs', (context) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'package.json'), 'utf8'));
      expect(manifest.scripts.prepack).toMatch(/^node scripts\/packSealedCore\.js &&/);

      if (missingTools.length > 0) {
        console.warn('not packed here: ' + missingTools.join('; '));
        context.skip();
      }
      // None of these was in the SDK when the pack started.
      const builtParts = [IOS_ASSET, ANDROID_ASSET, ...XCFRAMEWORK_SLICES, ...ANDROID_LIBRARIES];
      for (const builtPart of builtParts) expect(packedFiles).toContain(builtPart);
    });
  });

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

  it('the published polyfill runs as a plain script, with no module or require around it', () => {
    const { unpackedPackageDir } = packIntoTemporaryFolder();
    const polyfillSource = fs.readFileSync(
      path.join(unpackedPackageDir, 'dist-metro', 'polyfill.js'),
      'utf8'
    );

    expect(polyfillSource).not.toContain('module.exports');
    expect(polyfillSource).not.toContain('__nccwpck_require__');

    // Metro pastes the polyfill into the app bundle as a bare script: the context has the global
    // object and none of module, exports or require.
    const bareScriptContext: Record<string, unknown> = {};
    bareScriptContext.globalThis = bareScriptContext;
    bareScriptContext.global = bareScriptContext;
    expect(() => vm.runInNewContext(polyfillSource, bareScriptContext)).not.toThrow();
  }, 120_000);

  it('no built sealed part is committed', () => {
    const builtSealedParts = [
      'packages/sherlo-core/sherlo-core.js',
      'packages/react-native-storybook/ios/Resources/assets/sherlo-core.js',
      'packages/react-native-storybook/android/src/main/assets/sherlo-core.js',
      'packages/react-native-storybook/' + XCFRAMEWORK,
      ...ANDROID_LIBRARIES.map((library) => 'packages/react-native-storybook/' + library),
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
