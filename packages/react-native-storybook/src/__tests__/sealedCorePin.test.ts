/**
 * The pinned core: the pin file (../../sherlo-core.json) that names the one stored core the SDK
 * packs, the pin tool that writes it, and the pack that fetches, checks and lays that core.
 *
 * Every rule but the first reads a fake package storage, built here from a fake core, so none needs
 * a token or the network.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LAID_PATHS, packSealedCore } from '../../scripts/packSealedCore.js';
import { PIN_FILE, pinCore } from '../../scripts/pinCore.js';
import { coreFingerprint, storageReaderWith } from '../../scripts/storedCore.js';

// packages/react-native-storybook root: this file is at src/__tests__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..');
const SEAM_FILE = path.join(SDK_ROOT, 'src', 'sealedCore', 'seam.ts');
const PIN_FIELDS = ['version', 'fingerprint', 'runnerSha', 'sourceTree', 'seamHash'];

type StoredFile = { path: string; sha256: string };
type Manifest = {
  version: string;
  fingerprint: string;
  runnerSha: string;
  sourceTree: string;
  seamHash: string;
  abis: string[];
  files: StoredFile[];
};

function sha256(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

/** A fake core's files, by their path inside the core's stored folder: each file holds its path. */
function fakeCoreFiles(): Map<string, Buffer> {
  const paths = [
    'sherlo-core.js',
    'sherlo-core.js.sig',
    'SherloCore.xcframework/Info.plist',
    'SherloCore.xcframework/ios-arm64/libsherlocore.a',
    'SherloCore.xcframework/ios-arm64/Headers/sherlo_core.h',
    'SherloCore.xcframework/ios-arm64_x86_64-simulator/libsherlocore.a',
    'SherloCore.xcframework/ios-arm64_x86_64-simulator/Headers/sherlo_core.h',
    ...ANDROID_ABIS.map((abi) => 'jniLibs/' + abi + '/libsherlocore.so'),
  ];
  return new Map(paths.map((filePath) => [filePath, Buffer.from('fake ' + filePath)]));
}

/** The manifest sherlo-runner would store beside the files. */
function manifestOf(files: Map<string, Buffer>, seamHash = sha256(fs.readFileSync(SEAM_FILE))) {
  const storedFiles = [...files].map(([filePath, bytes]) => ({
    path: filePath,
    sha256: sha256(bytes),
  }));
  return {
    version: '2.0.9',
    fingerprint: coreFingerprint(storedFiles),
    runnerSha: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    seamHash,
    abis: ANDROID_ABIS,
    files: storedFiles,
  } as Manifest;
}

/**
 * Package storage holding the given cores, each under `cores/<fingerprint>/`, as the reader
 * storedCore.js makes; every key read is recorded.
 */
function fakeStorage(cores: Array<{ manifest: Manifest; files: Map<string, Buffer> }>) {
  const objects = new Map<string, Buffer>();
  for (const { manifest, files } of cores) {
    const folderKey = 'cores/' + manifest.fingerprint + '/';
    for (const [filePath, bytes] of files) objects.set(folderKey + filePath, bytes);
    objects.set(folderKey + 'manifest.json', Buffer.from(JSON.stringify(manifest)));
  }
  const keysRead: string[] = [];
  const readStoredFile = async (objectKey: string) => {
    keysRead.push(objectKey);
    return objects.get(objectKey) ?? null;
  };
  return { objects, keysRead, readStoredFile };
}

const temporaryFolders: string[] = [];
function temporaryFolder(prefix: string): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryFolders.push(folder);
  return folder;
}
afterEach(() => {
  for (const folder of temporaryFolders.splice(0)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

/**
 * A stand-in SDK folder: its pin copies every pin field the given core has (a bare fingerprint
 * pins a core nothing stores), and its seam is this commit's seam.
 */
function fakeSdkPinnedTo(core: { fingerprint: string } & Partial<Manifest>): string {
  const sdkRoot = temporaryFolder('sherlo-sdk-');
  const pin = Object.fromEntries(
    PIN_FIELDS.filter((field) => field in core).map((field) => [
      field,
      core[field as keyof Manifest],
    ])
  );
  fs.writeFileSync(path.join(sdkRoot, 'sherlo-core.json'), JSON.stringify(pin));
  fs.mkdirSync(path.join(sdkRoot, 'src', 'sealedCore'), { recursive: true });
  fs.copyFileSync(SEAM_FILE, path.join(sdkRoot, 'src', 'sealedCore', 'seam.ts'));
  return sdkRoot;
}

/** The environment of this test run, without the package token. */
function environmentWithoutToken(): NodeJS.ProcessEnv {
  const { PACKAGE_TOKEN: _packageToken, SHERLO_RELEASE_BUILD: _releaseFlag, ...rest } = process.env;
  return rest;
}

/** What a script run with no package token printed to its error output, and that it failed. */
function failureOfScriptWithoutToken(scriptArguments: string[]): string {
  try {
    execFileSync('node', scriptArguments, {
      cwd: SDK_ROOT,
      env: environmentWithoutToken(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    return (error as { stderr: string }).stderr;
  }
  throw new Error('node ' + scriptArguments.join(' ') + ' succeeded with no package token');
}

describe('the pin', () => {
  it('the pin names one stored core by version, fingerprint, runner commit, source tree and seam hash', async (context) => {
    const pin = JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
    expect(Object.keys(pin)).toEqual(PIN_FIELDS);
    expect(pin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pin.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(pin.runnerSha).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.sourceTree).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.seamHash).toMatch(/^[0-9a-f]{64}$/);

    // And the core is stored: the pin tool, run on the pinned fingerprint against the real storage,
    // writes this same pin. That reads storage, so it needs the package token, which CI carries.
    if (!process.env.PACKAGE_TOKEN && process.env.CI !== 'true') {
      console.warn('PACKAGE_TOKEN is not set, so the pinned core is not looked up in storage');
      context.skip();
    }
    const pinFromStorage = path.join(temporaryFolder('sherlo-pin-'), 'sherlo-core.json');
    await pinCore({
      fingerprint: pin.fingerprint,
      readStoredFile: storageReaderWith(process.env.PACKAGE_TOKEN),
      pinFile: pinFromStorage,
    });
    expect(fs.readFileSync(pinFromStorage, 'utf8')).toBe(fs.readFileSync(PIN_FILE, 'utf8'));
  }, 60_000);
});

describe('the pin tool', () => {
  it("the pin tool writes the pin from a stored core's manifest", async () => {
    const files = fakeCoreFiles();
    const manifest = manifestOf(files);
    const { readStoredFile } = fakeStorage([{ manifest, files }]);
    const pinFile = path.join(temporaryFolder('sherlo-pin-'), 'sherlo-core.json');

    await pinCore({ fingerprint: manifest.fingerprint, readStoredFile, pinFile });

    expect(JSON.parse(fs.readFileSync(pinFile, 'utf8'))).toEqual({
      version: manifest.version,
      fingerprint: manifest.fingerprint,
      runnerSha: manifest.runnerSha,
      sourceTree: manifest.sourceTree,
      seamHash: manifest.seamHash,
    });
  });

  it('the pin tool refuses a core that is not stored yet', async () => {
    const { readStoredFile } = fakeStorage([]);
    const pinFile = path.join(temporaryFolder('sherlo-pin-'), 'sherlo-core.json');

    await expect(pinCore({ fingerprint: 'c'.repeat(64), readStoredFile, pinFile })).rejects.toThrow(
      'no core is stored under the fingerprint ' + 'c'.repeat(64)
    );
    expect(fs.existsSync(pinFile)).toBe(false);
  });

  it('the pin tool with no package token fails, naming the token', () => {
    const errorOutput = failureOfScriptWithoutToken([
      'scripts/pinCore.js',
      '--fingerprint',
      'c'.repeat(64),
    ]);
    expect(errorOutput).toContain('PACKAGE_TOKEN is not set');
  });
});

describe('a pack', () => {
  it('a pack with no package token fails, naming the token', () => {
    const errorOutput = failureOfScriptWithoutToken(['scripts/packSealedCore.js']);
    expect(errorOutput).toContain('PACKAGE_TOKEN is not set');
  });

  it('a pack fetches the core stored under the pinned fingerprint', async () => {
    const pinnedFiles = fakeCoreFiles();
    const pinnedManifest = manifestOf(pinnedFiles);
    const otherFiles = new Map(
      [...fakeCoreFiles()].map(([filePath]) => [filePath, Buffer.from('other ' + filePath)])
    );
    const otherManifest = manifestOf(otherFiles);
    const storage = fakeStorage([
      { manifest: pinnedManifest, files: pinnedFiles },
      { manifest: otherManifest, files: otherFiles },
    ]);
    const sdkRoot = fakeSdkPinnedTo(pinnedManifest);

    await packSealedCore({ sdkRoot, readStoredFile: storage.readStoredFile });

    const pinnedFolderKey = 'cores/' + pinnedManifest.fingerprint + '/';
    expect(storage.keysRead).toContain(pinnedFolderKey + 'manifest.json');
    expect(storage.keysRead.filter((key) => !key.startsWith(pinnedFolderKey))).toEqual([]);
    expect(fs.readFileSync(path.join(sdkRoot, 'ios/Resources/assets/sherlo-core.js'), 'utf8')).toBe(
      'fake sherlo-core.js'
    );
  });

  it('a pack refuses a pin to a core that is not stored', async () => {
    const files = fakeCoreFiles();
    const { readStoredFile } = fakeStorage([{ manifest: manifestOf(files), files }]);
    const sdkRoot = fakeSdkPinnedTo({ fingerprint: 'd'.repeat(64) });

    await expect(packSealedCore({ sdkRoot, readStoredFile })).rejects.toThrow(
      'no core is stored under the fingerprint ' + 'd'.repeat(64)
    );
  });

  it('a pack refuses a pin file that is not a pin', async () => {
    const { readStoredFile } = fakeStorage([]);
    const sdkRoot = fakeSdkPinnedTo({ fingerprint: 'd'.repeat(64) });
    fs.writeFileSync(path.join(sdkRoot, 'sherlo-core.json'), '{ "fingerprint": "latest" }');

    await expect(packSealedCore({ sdkRoot, readStoredFile })).rejects.toThrow(
      'sherlo-core.json is not a pin: it names no fingerprint of 64 hex characters'
    );
  });

  it('a pack refuses a core that lacks a C core library for an Android ABI', async () => {
    const files = fakeCoreFiles();
    files.delete('jniLibs/x86/libsherlocore.so');
    const manifest = manifestOf(files);
    const { readStoredFile } = fakeStorage([{ manifest, files }]);
    const sdkRoot = fakeSdkPinnedTo(manifest);

    await expect(packSealedCore({ sdkRoot, readStoredFile })).rejects.toThrow(
      'core ' + manifest.fingerprint + ' stores no C core library for x86'
    );
    for (const { inSdk } of LAID_PATHS) {
      expect(fs.existsSync(path.join(sdkRoot, inSdk))).toBe(false);
    }
  });

  it('a pack refuses a core file whose hash differs from its manifest', async () => {
    const files = fakeCoreFiles();
    const manifest = manifestOf(files);
    const storage = fakeStorage([{ manifest, files }]);
    const tamperedFile = 'jniLibs/x86/libsherlocore.so';
    storage.objects.set(
      'cores/' + manifest.fingerprint + '/' + tamperedFile,
      Buffer.from('changed')
    );
    const sdkRoot = fakeSdkPinnedTo(manifest);

    await expect(
      packSealedCore({ sdkRoot, readStoredFile: storage.readStoredFile })
    ).rejects.toThrow('the stored ' + tamperedFile + ' of core ' + manifest.fingerprint);
    // Nothing is laid from a core that failed a check.
    for (const { inSdk } of LAID_PATHS) {
      expect(fs.existsSync(path.join(sdkRoot, inSdk))).toBe(false);
    }
  });

  it("a pack refuses a core whose seam hash differs from the SDK's own seam", async () => {
    const files = fakeCoreFiles();
    // The manifest is not one of the files the fingerprint is made from, so only the seam differs.
    const manifest = manifestOf(files, sha256('another seam'));
    const { readStoredFile } = fakeStorage([{ manifest, files }]);
    const sdkRoot = fakeSdkPinnedTo(manifest);

    await expect(packSealedCore({ sdkRoot, readStoredFile })).rejects.toThrow(
      "this commit's src/sealedCore/seam.ts hashes to " + sha256(fs.readFileSync(SEAM_FILE))
    );
    for (const { inSdk } of LAID_PATHS) {
      expect(fs.existsSync(path.join(sdkRoot, inSdk))).toBe(false);
    }
  });

  it("A pack refuses a pin whose fields differ from the stored core's manifest", async () => {
    const files = fakeCoreFiles();
    const manifest = manifestOf(files);
    const { readStoredFile } = fakeStorage([{ manifest, files }]);

    for (const field of ['version', 'runnerSha', 'sourceTree', 'seamHash'] as const) {
      const sdkRoot = fakeSdkPinnedTo({ ...manifest, [field]: 'not the stored ' + field });

      await expect(packSealedCore({ sdkRoot, readStoredFile })).rejects.toThrow(
        'sherlo-core.json says ' +
          field +
          ' is not the stored ' +
          field +
          ', but the stored core ' +
          manifest.fingerprint +
          ' says ' +
          manifest[field]
      );
      for (const { inSdk } of LAID_PATHS) {
        expect(fs.existsSync(path.join(sdkRoot, inSdk))).toBe(false);
      }
    }
  });

  it("a pack lays the pinned core's four paths before it packs", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SDK_ROOT, 'package.json'), 'utf8'));
    expect(manifest.scripts.prepack).toMatch(/^node scripts\/packSealedCore\.js &&/);

    const files = fakeCoreFiles();
    const coreManifest = manifestOf(files);
    const { readStoredFile } = fakeStorage([{ manifest: coreManifest, files }]);
    const sdkRoot = fakeSdkPinnedTo(coreManifest);
    // A core laid by an earlier pack is replaced whole.
    const leftover = path.join(sdkRoot, 'android/src/main/jniLibs/mips/libsherlocore.so');
    fs.mkdirSync(path.dirname(leftover), { recursive: true });
    fs.writeFileSync(leftover, 'an older core');

    await packSealedCore({ sdkRoot, readStoredFile });

    const laidFile = (sdkPath: string) => fs.readFileSync(path.join(sdkRoot, sdkPath), 'utf8');
    expect(laidFile('ios/Resources/assets/sherlo-core.js')).toBe('fake sherlo-core.js');
    expect(laidFile('android/src/main/assets/sherlo-core.js')).toBe('fake sherlo-core.js');
    for (const slice of ['ios-arm64', 'ios-arm64_x86_64-simulator']) {
      const sliceFile = 'SherloCore.xcframework/' + slice + '/libsherlocore.a';
      expect(laidFile('ios/' + sliceFile)).toBe('fake ' + sliceFile);
    }
    expect(laidFile('ios/SherloCore.xcframework/Info.plist')).toBe(
      'fake SherloCore.xcframework/Info.plist'
    );
    for (const abi of ANDROID_ABIS) {
      expect(laidFile('android/src/main/jniLibs/' + abi + '/libsherlocore.so')).toBe(
        'fake jniLibs/' + abi + '/libsherlocore.so'
      );
    }
    expect(fs.existsSync(leftover)).toBe(false);
    // The signature checks only an override core, so the SDK does not carry it.
    expect(fs.existsSync(path.join(sdkRoot, 'ios/Resources/assets/sherlo-core.js.sig'))).toBe(
      false
    );
  });
});
