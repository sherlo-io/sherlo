/**
 * What the published SDK carries, what the repository does not, and what CI and a release check
 * around the sealed core.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
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
import {
  LOADERS,
  refuseTestPublicKey,
  stampPublicKey,
  TEST_KEY_NAME,
} from '../../scripts/sealedCoreKey.js';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SDK_ROOT, '..', '..');
const CORE_JS_SOURCE_DIR = path.join(REPO_ROOT, 'packages', 'sherlo-core', 'js', 'src');
const CORE_NATIVE_SOURCE_DIR = path.join(REPO_ROOT, 'packages', 'sherlo-core', 'native', 'src');

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

/**
 * Every path (relative to the SDK) a pack would carry. It builds the JS core assets the way the
 * SDK's prepack does first, then asks npm - so this holds whether or not a dry-run pack runs the
 * prepack lifecycle itself.
 */
function listFilesAPackCarries(): string[] {
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
  return packed.files.map((file) => file.path);
}

/** The JS assets a dry-run pack built; cleared so a local run leaves no sealed part behind. */
function removeBuiltJsCoreAssets() {
  for (const asset of [IOS_ASSET, ANDROID_ASSET]) {
    fs.rmSync(path.join(SDK_ROOT, asset), { force: true });
  }
}

/** Every file under `directory`, as an absolute path. */
function listFilesUnder(directory: string): string[] {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function hashOfFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * A workflow's named steps, in order: each one's name and the lines of YAML under it. Text, not a
 * YAML parse - every step these tests read starts with `- name:`.
 */
function namedStepsOf(workflowFile: string): Array<{ name: string; body: string }> {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', workflowFile),
    'utf8'
  );
  return workflow
    .split(/\n(?=[ \t]+- name: )/)
    .slice(1)
    .map((stepText) => {
      const [firstLine, ...rest] = stepText.split('\n');
      const name = firstLine.replace(/^[ \t]+- name: /, '').replace(/^'(.*)'$/, '$1');
      return { name, body: rest.join('\n') };
    });
}

describe('what the published package carries', () => {
  describe('the published files carry the JS core as an asset for iOS and Android', () => {
    let packedFiles: string[];

    beforeAll(() => {
      packedFiles = listFilesAPackCarries();
    }, 120_000);

    it('the published files carry the JS core as an asset for iOS and Android', () => {
      expect(packedFiles).toContain(IOS_ASSET);
      expect(packedFiles).toContain(ANDROID_ASSET);
    });

    afterAll(removeBuiltJsCoreAssets);
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
      expect(manifest.files).toContain(XCFRAMEWORK + '/**/*');

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

    it('a yarn pack carries the C core xcframework too', (context) => {
      if (missingTools.length > 0) {
        console.warn('not packed here: ' + missingTools.join('; '));
        context.skip();
      }
      const yarnReleasePath = fs
        .readFileSync(path.join(REPO_ROOT, '.yarnrc.yml'), 'utf8')
        .match(/^yarnPath:\s*(\S+)\s*$/m)![1];
      const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-sdk-yarn-pack-'));
      const yarnTarball = path.join(temporaryDir, 'sdk.tgz');
      execFileSync('node', [path.join(REPO_ROOT, yarnReleasePath), 'pack', '-o', yarnTarball], {
        cwd: SDK_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const yarnPackedFiles = execFileSync('tar', ['-tzf', yarnTarball], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map((entry) => entry.replace(/^package\//, ''));

      for (const slice of XCFRAMEWORK_SLICES) expect(yarnPackedFiles).toContain(slice);
      for (const sliceName of ['ios-arm64', 'ios-arm64_x86_64-simulator']) {
        expect(yarnPackedFiles).toContain(XCFRAMEWORK + '/' + sliceName + '/Headers/sherlo_core.h');
      }
    }, 300_000);

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

  it('the published files carry no readable source of either core', () => {
    const packedFiles = listFilesAPackCarries();
    try {
      // No path from either core's source folder, and no C file anywhere.
      expect(packedFiles.filter((file) => file.includes('sherlo-core/'))).toEqual([]);
      expect(packedFiles.filter((file) => file.endsWith('.c'))).toEqual([]);

      // And no packed file is a copy of one, whatever it is named.
      const sourceHashes = new Set(
        [CORE_JS_SOURCE_DIR, CORE_NATIVE_SOURCE_DIR].flatMap(listFilesUnder).map(hashOfFile)
      );
      expect(sourceHashes.size).toBeGreaterThan(0);
      const copiedSources = packedFiles.filter((file) =>
        sourceHashes.has(hashOfFile(path.join(SDK_ROOT, file)))
      );
      expect(copiedSources).toEqual([]);
    } finally {
      removeBuiltJsCoreAssets();
    }
  }, 120_000);

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

  it('a release build refuses the test public key', () => {
    // The repository's own loaders carry the test key, so a release pack stops before it builds.
    const releasePack = () =>
      execFileSync('node', ['scripts/packSealedCore.js', 'js'], {
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
    // The pack step with no part to build runs only its guard; without SHERLO_RELEASE_BUILD it
    // must let the test key through, and leave the loaders as they were.
    const { SHERLO_RELEASE_BUILD: _releaseFlag, ...localEnv } = process.env;
    execFileSync(
      'node',
      [
        '-e',
        "require('./scripts/packSealedCore.js').packSealedCore([]).catch((e) => { console.error(e); process.exit(1); })",
      ],
      { cwd: SDK_ROOT, env: localEnv, stdio: 'pipe' }
    );
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
});

describe('what CI and a release check', () => {
  it("CI type-checks the sealed core in the SDK's job", () => {
    const coreTypeCheckSteps = namedStepsOf('pr_checks.yml').filter((step) =>
      /run: yarn tsc --noEmit -p packages\/sherlo-core\s*$/m.test(step.body)
    );
    expect(coreTypeCheckSteps).toHaveLength(1);
    expect(coreTypeCheckSteps[0].body).toMatch(
      /if: matrix\.package\.name == 'react-native-storybook'/
    );
  });

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
    const steps = namedStepsOf('release_to_test.yml');
    const publishPosition = steps.findIndex(
      (step) => step.name === 'Prepare and publish to GitHub Packages'
    );
    expect(publishPosition).toBeGreaterThanOrEqual(0);
    const publishBody = steps[publishPosition].body;

    const prepackPosition = publishBody.indexOf('npm run prepack');
    expect(prepackPosition).toBeGreaterThanOrEqual(0);
    expect(prepackPosition).toBeLessThan(publishBody.search(/\bsdk\.name\s*=/));
    expect(publishBody).toMatch(/npm publish --ignore-scripts --tag test/);

    const ndkStepPosition = steps.findIndex((step) =>
      /ANDROID_NDK_HOME=.*>> \$GITHUB_ENV/.test(step.body)
    );
    expect(ndkStepPosition).toBeGreaterThanOrEqual(0);
    expect(ndkStepPosition).toBeLessThan(publishPosition);
  });
});
