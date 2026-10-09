/**
 * What the published SDK carries, what the repository does not, and what CI and a release check
 * around the sealed core.
 *
 * The rules that read a real pack fetch the pinned core, so they need PACKAGE_TOKEN: CI carries it
 * (the packaging check), and on a machine without it they are skipped, saying so.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { LAID_PATHS } from '../../scripts/packSealedCore.js';
import {
  LOADERS,
  refuseTestPublicKey,
  stampPublicKey,
  TEST_KEY_NAME,
} from '../../scripts/sealedCoreKey.js';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SDK_ROOT, '..', '..');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');

const IOS_ASSET = 'ios/Resources/assets/sherlo-core.js';
const ANDROID_ASSET = 'android/src/main/assets/sherlo-core.js';
const XCFRAMEWORK = 'ios/SherloCore.xcframework';
const XCFRAMEWORK_SLICES = [
  XCFRAMEWORK + '/ios-arm64/libsherlocore.a',
  XCFRAMEWORK + '/ios-arm64_x86_64-simulator/libsherlocore.a',
];
const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];
const ANDROID_LIBRARIES = ANDROID_ABIS.map(
  (abi) => 'android/src/main/jniLibs/' + abi + '/libsherlocore.so'
);
const ANDROID_PAGE_SIZE = 16384;
const RELEASE_WORKFLOWS = [
  'release-sherlo-packages.yml',
  'release_to_test.yml',
  'release_to_dev.yml',
];
const TESTING_APP_TARBALLS = [
  'testing/expo/sherlo-lib/react-native-storybook.tgz',
  'testing/react-native/sherlo-lib/react-native-storybook.tgz',
];

/** Whether this run may read package storage; outside CI, a run without the token skips. */
const canFetchThePinnedCore = Boolean(process.env.PACKAGE_TOKEN) || process.env.CI === 'true';
const NO_TOKEN_REASON = 'PACKAGE_TOKEN is not set, so no real pack runs here';

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

/** The paths inside a tarball, without npm's `package/` folder. */
function filesInTarball(tarball: string): string[] {
  return execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((entry) => entry.replace(/^package\//, ''));
}

/** The two native loaders, copied to a temporary folder so a test may stamp them freely. */
function copyLoadersToTemporaryFolder(): typeof LOADERS {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-loaders-'));
  const copyOf = ({ file, derFormat }: { file: string; derFormat: string }) => {
    const copiedFile = path.join(temporaryDir, path.basename(file));
    fs.copyFileSync(file, copiedFile);
    return { file: copiedFile, derFormat };
  };
  return { ios: copyOf(LOADERS.ios), android: copyOf(LOADERS.android) };
}

/** Every path a pack lays the core at, removed, so a pack must lay each again. */
function removeLaidCore() {
  for (const { inSdk } of LAID_PATHS) {
    fs.rmSync(path.join(SDK_ROOT, inSdk), { recursive: true, force: true });
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

/** What a script run with no package token printed to its error output, and that it failed. */
function failureOfPackWithoutToken(): string {
  const {
    PACKAGE_TOKEN: _packageToken,
    SHERLO_RELEASE_BUILD: _releaseFlag,
    ...environmentWithoutToken
  } = process.env;
  try {
    execFileSync('node', ['scripts/packSealedCore.js'], {
      cwd: SDK_ROOT,
      env: environmentWithoutToken,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    return (error as { stderr: string }).stderr;
  }
  throw new Error('a pack succeeded with no package token');
}

/**
 * A workflow's named steps, in order: each one's name and the lines of YAML under it. Text, not a
 * YAML parse - every step these tests read starts with `- name:`.
 */
function namedStepsOf(workflowFile: string): Array<{ name: string; body: string }> {
  const workflow = fs.readFileSync(path.join(WORKFLOWS_DIR, workflowFile), 'utf8');
  return workflow
    .split(/\n(?=[ \t]+- name: )/)
    .slice(1)
    .map((stepText) => {
      const [firstLine, ...rest] = stepText.split('\n');
      const name = firstLine.replace(/^[ \t]+- name: /, '').replace(/^'(.*)'$/, '$1');
      return { name, body: rest.join('\n') };
    });
}

/** The YAML lines of a workflow that are not comments. */
function workflowWithoutComments(workflowFile: string): string {
  return fs
    .readFileSync(path.join(WORKFLOWS_DIR, workflowFile), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

/**
 * Whether a workflow step packs the SDK: it runs the SDK's prepack, publishes with lerna (which
 * packs), packs by hand, or runs the SDK's unit suite, whose packaging check packs.
 */
function packsTheSdk(step: { name: string; body: string }): boolean {
  const runsTheSdkSuite =
    /\byarn test\b/.test(step.body) &&
    /working-directory: (packages\/react-native-storybook|\$\{\{ matrix\.package\.dir \}\})/.test(
      step.body
    );
  return (
    runsTheSdkSuite ||
    /npm run prepack|lerna publish|\b(npm|yarn) pack\b|yarn reset/.test(step.body)
  );
}

describe('what the published package carries', () => {
  describe('the pinned core, from a real pack', () => {
    let packedFiles: string[] = [];
    let unpackedPackageDir = '';

    beforeAll(() => {
      if (!canFetchThePinnedCore) {
        console.warn(NO_TOKEN_REASON);
        return;
      }
      // Pack as a publish does, prepack and all, with no core laid beforehand.
      removeLaidCore();
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-real-pack-'));
      execFileSync('npm', ['pack', '--pack-destination', temporaryDir], {
        cwd: SDK_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const tarball = fs.readdirSync(temporaryDir).find((name) => name.endsWith('.tgz'))!;
      execFileSync('tar', ['-xzf', path.join(temporaryDir, tarball), '-C', temporaryDir]);
      packedFiles = filesInTarball(path.join(temporaryDir, tarball));
      unpackedPackageDir = path.join(temporaryDir, 'package');
    }, 300_000);

    afterAll(() => {
      // The pack laid the core into the SDK; clear it so a local run leaves none behind.
      if (canFetchThePinnedCore) removeLaidCore();
    });

    it('the published files carry the JS core as an asset for iOS and Android', (context) => {
      if (!canFetchThePinnedCore) context.skip();
      expect(packedFiles).toContain(IOS_ASSET);
      expect(packedFiles).toContain(ANDROID_ASSET);

      // The carried core is the pinned one: its header names the pinned version.
      const pin = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'sherlo-core.json'), 'utf8'));
      for (const asset of [IOS_ASSET, ANDROID_ASSET]) {
        const header = fs.readFileSync(path.join(unpackedPackageDir, asset), 'utf8').split('\n')[0];
        expect(header).toMatch(/^\/\/ sherlo-core \{/);
        expect(JSON.parse(header.replace('// sherlo-core ', '')).version).toBe(pin.version);
      }
    });

    it('the podspec vendors the C core xcframework', (context) => {
      const podspec = fs.readFileSync(
        path.join(SDK_ROOT, 'sherlo-react-native-storybook.podspec'),
        'utf8'
      );
      expect(podspec).toContain('s.vendored_frameworks = "' + XCFRAMEWORK + '"');
      const manifest = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'package.json'), 'utf8'));
      expect(manifest.files).toContain(XCFRAMEWORK + '/**/*');

      if (!canFetchThePinnedCore) {
        console.warn('the xcframework is not packed here, so its slices are not checked');
        context.skip();
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

    it('a yarn pack carries the C core xcframework too', (context) => {
      if (!canFetchThePinnedCore) context.skip();
      const yarnReleasePath = fs
        .readFileSync(path.join(REPO_ROOT, '.yarnrc.yml'), 'utf8')
        .match(/^yarnPath:\s*(\S+)\s*$/m)![1];
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-yarn-pack-'));
      const yarnTarball = path.join(temporaryDir, 'sdk.tgz');
      execFileSync('node', [path.join(REPO_ROOT, yarnReleasePath), 'pack', '-o', yarnTarball], {
        cwd: SDK_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const yarnPackedFiles = filesInTarball(yarnTarball);

      for (const slice of XCFRAMEWORK_SLICES) expect(yarnPackedFiles).toContain(slice);
      for (const sliceName of ['ios-arm64', 'ios-arm64_x86_64-simulator']) {
        expect(yarnPackedFiles).toContain(XCFRAMEWORK + '/' + sliceName + '/Headers/sherlo_core.h');
      }
    }, 300_000);

    it('the published files carry a C core library for every Android ABI', (context) => {
      if (!canFetchThePinnedCore) context.skip();
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

    it('the published files carry no readable source of either core', (context) => {
      if (!canFetchThePinnedCore) context.skip();
      // No folder of either core's source, and no C source anywhere.
      expect(packedFiles.filter((file) => file.includes('sherlo-core/'))).toEqual([]);
      expect(packedFiles.filter((file) => /\.c$/.test(file))).toEqual([]);
      // The JS core is one scrambled file: its header, then code on few, long lines.
      const jsCore = fs.readFileSync(path.join(unpackedPackageDir, IOS_ASSET), 'utf8');
      const codeLines = jsCore
        .split('\n')
        .slice(1)
        .filter((line) => line.trim() !== '');
      expect(codeLines.length).toBeLessThan(20);
    });
  });

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
    expect(withStorybookSource).not.toMatch(/[=]\d+;var \w+="var generateModule/);

    const exportsMap = JSON.parse(
      fs.readFileSync(path.join(unpackedPackageDir, 'package.json'), 'utf8')
    ).exports;
    for (const entryName of ['./metro/withStorybook', './metro/polyfill']) {
      expect(fs.existsSync(path.join(unpackedPackageDir, exportsMap[entryName].default))).toBe(
        true
      );
    }
  }, 120_000);

  it('the published build setting parser loads with plain Node from the package root', () => {
    const { unpackedPackageDir, packedFilePaths } = packIntoTemporaryFolder();

    expect(packedFilePaths).toContain('dist-metro/sherloBuild.js');
    const { readSherloBuild, whatThisBuildCarries } = require(path.join(
      unpackedPackageDir,
      'dist-metro',
      'sherloBuild.js'
    ));
    expect(readSherloBuild({ SHERLO_BUILD: 'off' })).toBe('off');
    expect(whatThisBuildCarries({}, true, undefined).sherloBuild).toBe('off');

    // The stand-in a build without Sherlo resolves the SDK to is published and named in the
    // exports map, so a project's resolver can reach it by its package path.
    const exportsMap = JSON.parse(
      fs.readFileSync(path.join(unpackedPackageDir, 'package.json'), 'utf8')
    ).exports;
    expect(exportsMap['./dist/offStandIn.js']).toBe('./dist/offStandIn.js');
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
    const laidParts = [
      'packages/react-native-storybook/' + IOS_ASSET,
      'packages/react-native-storybook/' + ANDROID_ASSET,
      'packages/react-native-storybook/' + XCFRAMEWORK,
      ...ANDROID_LIBRARIES.map((library) => 'packages/react-native-storybook/' + library),
    ];

    for (const laidPart of laidParts) {
      // Nothing of the laid core is tracked...
      const tracked = execFileSync('git', ['ls-files', laidPart], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(tracked.trim()).toBe('');

      // ...and git ignores it, so a core laid by a pack cannot be committed by accident.
      const ignored = execFileSync('git', ['check-ignore', laidPart], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(ignored.trim()).toBe(laidPart);
    }
  });

  it('a release build refuses the test public key', () => {
    // The repository's own loaders carry the test key, so a release pack stops before it fetches.
    const releasePack = () =>
      execFileSync('node', ['scripts/packSealedCore.js'], {
        cwd: SDK_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        env: { ...process.env, SHERLO_RELEASE_BUILD: 'true' },
      });
    expect(releasePack).toThrow(/still holds the test key/);

    // Stamped with a real-looking key, the same loaders pass the guard, each in its own format.
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const stampedLoaders = copyLoadersToTemporaryFolder();
    try {
      stampPublicKey(publicKey.export({ type: 'spki', format: 'pem' }) as string, stampedLoaders);
      expect(() => refuseTestPublicKey(stampedLoaders)).not.toThrow();
      const readKey = (file: string) =>
        fs.readFileSync(file, 'utf8').match(/SHERLO_CORE_PUBLIC_KEY\s*=\s*@?"([^"]+)"/)![1];
      expect(readKey(stampedLoaders.android.file)).toBe(
        publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      );
      expect(readKey(stampedLoaders.ios.file)).toBe(
        publicKey.export({ type: 'pkcs1', format: 'der' }).toString('base64')
      );
    } finally {
      fs.rmSync(path.dirname(stampedLoaders.ios.file), { recursive: true, force: true });
    }
  });

  it('a local pack keeps the test key', () => {
    // Without SHERLO_RELEASE_BUILD the pack lets the test key through: with no token it stops at
    // the token, never at the key, and leaves the loaders as they were.
    expect(failureOfPackWithoutToken()).not.toContain('test key');
    for (const { file } of Object.values(LOADERS)) {
      expect(fs.readFileSync(file, 'utf8')).toContain(TEST_KEY_NAME);
    }
  });

  it("the podspec keeps the compiled core's header private", () => {
    // CompiledCore.h imports sherlo_core.h, which only the pod's own build can find; a public
    // header would reach the umbrella header of an app built with frameworks and break its build.
    const podspec = fs.readFileSync(
      path.join(SDK_ROOT, 'sherlo-react-native-storybook.podspec'),
      'utf8'
    );
    expect(podspec).toContain('s.private_header_files = "ios/CompiledCore.h"');
  });

  it('the sherlo repository tracks no source of either core', () => {
    const trackedFiles = execFileSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .trim()
      .split('\n');

    expect(trackedFiles.filter((file) => file.startsWith('packages/sherlo-core/'))).toEqual([]);
    // The C core's source is C, and its header is sherlo_core.h: neither is tracked anywhere.
    expect(trackedFiles.filter((file) => /\.c$/.test(file))).toEqual([]);
    expect(trackedFiles.filter((file) => path.basename(file) === 'sherlo_core.h')).toEqual([]);
    // And no workspace is left for one.
    expect(fs.readFileSync(path.join(REPO_ROOT, 'yarn.lock'), 'utf8')).not.toContain(
      '@sherlo/core@workspace'
    );
  });

  it("every testing app's committed SDK tarball carries the JS core and the C core", () => {
    for (const tarball of TESTING_APP_TARBALLS) {
      const carriedFiles = filesInTarball(path.join(REPO_ROOT, tarball));
      for (const corePart of [
        IOS_ASSET,
        ANDROID_ASSET,
        ...XCFRAMEWORK_SLICES,
        ...ANDROID_LIBRARIES,
      ]) {
        expect(carriedFiles, tarball).toContain(corePart);
      }
    }
  });
});

describe('what CI and a release check', () => {
  it('a test or dev release packs the SDK before it renames the package', () => {
    for (const workflowFile of ['release_to_test.yml', 'release_to_dev.yml']) {
      const publishStep = namedStepsOf(workflowFile).find(
        (step) => step.name === 'Prepare and publish to GitHub Packages'
      );
      expect(publishStep, workflowFile).toBeDefined();
      const stepBody = publishStep!.body;

      const prepackPosition = stepBody.indexOf(
        '(cd packages/react-native-storybook && npm run prepack)'
      );
      const renamePosition = stepBody.indexOf("sdk.name = '@sherlo-io/react-native-storybook'");
      expect(prepackPosition, workflowFile).toBeGreaterThanOrEqual(0);
      expect(renamePosition, workflowFile).toBeGreaterThanOrEqual(0);
      expect(prepackPosition, workflowFile).toBeLessThan(renamePosition);

      // The publish must not run prepack again, now under the new name.
      expect(stepBody, workflowFile).toMatch(
        /cd \.\.\/react-native-storybook && npm publish --ignore-scripts /
      );
    }
  });

  it('a release with no signing key stops before it commits anything', () => {
    const steps = namedStepsOf('release-sherlo-packages.yml');
    const positionOf = (stepName: string) => {
      const position = steps.findIndex((step) => step.name === stepName);
      expect(position, stepName).toBeGreaterThanOrEqual(0);
      return position;
    };
    const keyCheckPosition = steps.findIndex(
      (step) =>
        step.body.includes('vars.SHERLO_CORE_PUBLIC_KEY') &&
        step.body.includes('exit 1') &&
        !step.body.includes('sealedCoreKey.js stamp')
    );
    expect(keyCheckPosition).toBeGreaterThanOrEqual(0);

    // Before anything is installed or committed...
    expect(keyCheckPosition).toBeLessThan(positionOf('Install dependencies'));
    expect(keyCheckPosition).toBeLessThan(positionOf('Commit and push version updates'));
    // ...while the real key is still stamped only after the commit, and restored after the publish.
    const stampPosition = positionOf("Stamp Sherlo's public key into the native loaders");
    expect(stampPosition).toBeGreaterThan(positionOf('Commit and push version updates'));
    expect(positionOf('Restore the native loaders to the test key')).toBeGreaterThan(
      positionOf('Publish to npm')
    );
  });

  // The SDK's prepack must run inside the workspace yarn knows, so it runs before the rename,
  // and the publish skips it.
  it('the release to test runs the SDK prepack before the rename, and the publish skips it', () => {
    const publishStep = namedStepsOf('release_to_test.yml').find(
      (step) => step.name === 'Prepare and publish to GitHub Packages'
    );
    expect(publishStep).toBeDefined();
    const publishBody = publishStep!.body;

    const prepackPosition = publishBody.indexOf('npm run prepack');
    expect(prepackPosition).toBeGreaterThanOrEqual(0);
    expect(prepackPosition).toBeLessThan(publishBody.search(/\bsdk\.name\s*=/));
    expect(publishBody).toMatch(/npm publish --ignore-scripts --tag test/);
  });

  it('every workflow step that packs the SDK has the package token', () => {
    const packingSteps = fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((file) => file.endsWith('.yml'))
      .flatMap((workflowFile) =>
        namedStepsOf(workflowFile)
          .filter(packsTheSdk)
          .map((step) => ({ workflowFile, stepName: step.name, body: step.body }))
      );

    // The release, both channels, and the packaging check on a pull request and by hand.
    const workflowsThatPack = new Set(packingSteps.map(({ workflowFile }) => workflowFile));
    expect([...workflowsThatPack].sort()).toEqual(
      [...RELEASE_WORKFLOWS, 'pr_checks.yml', 'manual_tests.yml'].sort()
    );
    const stepsWithoutToken = packingSteps
      // The secret itself, or - in a step both packages' jobs share - the secret for the SDK's.
      .filter(
        ({ body }) => !/PACKAGE_TOKEN: \$\{\{[^}]*\bsecrets\.PACKAGE_TOKEN\b[^}]*\}\}/.test(body)
      )
      .map(({ workflowFile, stepName }) => workflowFile + ': ' + stepName);
    expect(stepsWithoutToken).toEqual([]);
  });

  it("a release whose pinned core's source tree is on no commit of sherlo-runner's default branch stops before it commits anything", () => {
    const steps = namedStepsOf('release-sherlo-packages.yml');
    const positionOf = (stepName: string) => {
      const position = steps.findIndex((step) => step.name === stepName);
      expect(position, stepName).toBeGreaterThanOrEqual(0);
      return position;
    };
    const mergeCheckPosition = steps.findIndex(
      (step) =>
        step.body.includes('.sourceTree packages/react-native-storybook/sherlo-core.json') &&
        step.body.includes('repos/sherlo-io/sherlo-runner/commits?sha=') &&
        step.body.includes('path=core') &&
        step.body.includes('repos/sherlo-io/sherlo-runner/git/trees/') &&
        step.body.includes('exit 1')
    );
    expect(mergeCheckPosition).toBeGreaterThanOrEqual(0);
    const mergeCheck = steps[mergeCheckPosition];

    // It reads sherlo-runner with the bot's token, minted before it...
    expect(mergeCheck.body).toContain('GH_TOKEN: ${{ steps.github_app_token.outputs.token }}');
    expect(positionOf('Create GH App Token')).toBeLessThan(mergeCheckPosition);
    // ...on the checked-out pin, which only exists after the checkout...
    const checkoutPosition = steps.findIndex((step) => step.body.includes('actions/checkout'));
    expect(checkoutPosition).toBeLessThan(mergeCheckPosition);
    // ...and passes only a source tree that a commit changing `core` on the default branch holds,
    // however that commit was merged: the commit's own `core` tree entry is compared to the pin.
    expect(mergeCheck.body).toContain('select(.path == "core")');
    expect(mergeCheck.body).toContain('"$CORE_TREE" = "$SOURCE_TREE"');
    // Before anything is installed or committed.
    expect(mergeCheckPosition).toBeLessThan(positionOf('Install dependencies'));
    expect(mergeCheckPosition).toBeLessThan(positionOf('Commit and push version updates'));
  });

  it('no release workflow builds or signs a core', () => {
    for (const workflowFile of RELEASE_WORKFLOWS) {
      const workflow = workflowWithoutComments(workflowFile);
      // No core build: no core source, build script or native toolchain.
      expect(workflow, workflowFile).not.toMatch(
        /sherlo-core\/|native\/build|xcodebuild|cmake|clang/i
      );
      // No signing: no core signing key, and no signature made.
      expect(workflow, workflowFile).not.toMatch(
        /CORE_SIGNING|SIGNING_KEY|openssl[^\n]*-sign|\.sig\b/
      );
    }
  });

  it('no release workflow sets up the Android NDK', () => {
    for (const workflowFile of RELEASE_WORKFLOWS) {
      expect(workflowWithoutComments(workflowFile), workflowFile).not.toMatch(/ndk/i);
    }
  });

  it('no pull request job builds, tests or type-checks a core', () => {
    const workflow = workflowWithoutComments('pr_checks.yml');
    // One job, once per package: the CLI and the SDK.
    const jobs = workflow.slice(workflow.search(/^jobs:\s*$/m));
    expect([...jobs.matchAll(/^ {2}(\S+):\s*$/gm)].map((match) => match[1])).toEqual(['checks']);
    expect([...workflow.matchAll(/^\s+- name: (\S+)\s*$/gm)].map((match) => match[1])).toEqual(
      expect.arrayContaining(['cli', 'react-native-storybook'])
    );
    expect(workflow).not.toMatch(/sherlo-core|@sherlo\/core|ndk/i);
  });
});
