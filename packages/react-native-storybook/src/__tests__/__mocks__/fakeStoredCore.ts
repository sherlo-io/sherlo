/**
 * A fake stored core and the package storage holding it, for the tests of the pin and of the pack
 * (sealedCorePin.test.ts, sealedCorePackaging.test.ts): none needs a token or the network.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { coreFingerprint } from '../../../scripts/storedCore.js';
import { seamThisSdkSpeaks } from './fakeSealedCore';

export { seamThisSdkSpeaks };

// packages/react-native-storybook root: this file is at src/__tests__/__mocks__/.
const SDK_ROOT = path.resolve(__dirname, '..', '..', '..');
export const SEAM_FILE = path.join(SDK_ROOT, 'src', 'sealedCore', 'seam.ts');
const LOADER_FILE = path.join(SDK_ROOT, 'src', 'sealedCore', 'loadSealedCore.ts');
const PIN_FIELDS = ['version', 'fingerprint', 'runnerSha', 'sourceTree', 'seamHash'];
export const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

type StoredFile = { path: string; sha256: string };
export type Manifest = {
  version: string;
  fingerprint: string;
  runnerSha: string;
  sourceTree: string;
  seamHash: string;
  abis: string[];
  files: StoredFile[];
};

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** The JS core of a fake core: the header line a real one starts with, naming `seam`. */
export function fakeCoreSource(seam: number): string {
  return `// sherlo-core {"version":"2.0.9","seam":${seam}}\nfake core code`;
}

/**
 * A fake core's files, by their path inside the core's stored folder: each file holds its path,
 * but the JS core, which holds a header naming `seam` (the seam this SDK speaks, left out).
 */
export function fakeCoreFiles(seam = seamThisSdkSpeaks()): Map<string, Buffer> {
  const paths = [
    'sherlo-core.js',
    'sherlo-core.js.sig',
    'SherloCore.xcframework/Info.plist',
    'SherloCore.xcframework/ios-arm64/SherloCore.framework/SherloCore',
    'SherloCore.xcframework/ios-arm64/SherloCore.framework/Headers/sherlo_core.h',
    'SherloCore.xcframework/ios-arm64_x86_64-simulator/SherloCore.framework/SherloCore',
    'SherloCore.xcframework/ios-arm64_x86_64-simulator/SherloCore.framework/Headers/sherlo_core.h',
    ...ANDROID_ABIS.map((abi) => 'jniLibs/' + abi + '/libsherlocore.so'),
  ];
  return new Map(
    paths.map((filePath) => [
      filePath,
      Buffer.from(filePath === 'sherlo-core.js' ? fakeCoreSource(seam) : 'fake ' + filePath),
    ])
  );
}

/** The manifest sherlo-runner would store beside the files. */
export function manifestOf(
  files: Map<string, Buffer>,
  seamHash = sha256(fs.readFileSync(SEAM_FILE))
) {
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
export function fakeStorage(cores: Array<{ manifest: Manifest; files: Map<string, Buffer> }>) {
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

/**
 * Fills the empty folder `sdkRoot` as a stand-in SDK: its pin copies every pin field the given core
 * has (a bare fingerprint pins a core nothing stores), and its seam and loader are this commit's.
 */
export function fillFakeSdkPinnedTo(
  sdkRoot: string,
  core: { fingerprint: string } & Partial<Manifest>
): string {
  const pin = Object.fromEntries(
    PIN_FIELDS.filter((field) => field in core).map((field) => [
      field,
      core[field as keyof Manifest],
    ])
  );
  fs.writeFileSync(path.join(sdkRoot, 'sherlo-core.json'), JSON.stringify(pin));
  fs.mkdirSync(path.join(sdkRoot, 'src', 'sealedCore'), { recursive: true });
  fs.copyFileSync(SEAM_FILE, path.join(sdkRoot, 'src', 'sealedCore', 'seam.ts'));
  fs.copyFileSync(LOADER_FILE, path.join(sdkRoot, 'src', 'sealedCore', 'loadSealedCore.ts'));
  return sdkRoot;
}
