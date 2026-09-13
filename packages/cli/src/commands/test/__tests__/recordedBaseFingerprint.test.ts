/**
 * The base fingerprint a supplied bundle carries: what the emitting machine
 * records about the native inputs, and when the accepting machine may take the
 * recorded number instead of computing one it has no install to compute with.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ computeBaseFingerprint: vi.fn() }));

vi.mock('../../../helpers/fingerprint', () => ({
  computeBaseFingerprint: mocks.computeBaseFingerprint,
}));

import type { BaseFingerprintResult } from '../../../helpers/fingerprint/baseFingerprint';
import { SIDECAR_VERSION, sidecarFileName } from '../bundleSidecar';
import {
  digestNativeInputs,
  nativeInputPaths,
  recordBaseFingerprint,
  resolveBaseFingerprintForSuppliedBundle,
} from '../recordedBaseFingerprint';

let projectRoot: string;
let bundleDir: string;

function write(relativePath: string, text: string): void {
  const fullPath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

/** What `computeBaseFingerprint` returned on the emitting machine. */
const COMPUTED: BaseFingerprintResult = {
  hash: 'base-hash',
  nativeFingerprint: 'native-hash',
  preimage: {
    workflow: 'bare',
    nativeSources: [
      { type: 'dir', id: 'ios', hash: 'h-ios' },
      { type: 'file', id: 'android/gradle.properties', hash: 'h-gradle' },
      // A native module under node_modules: vouched for by the dependency
      // closure, absent on the accepting machine, so never a native input.
      { type: 'dir', id: 'node_modules/expo-camera/android', hash: 'h-camera' },
      // Resolved values, not files - their inputs are the config files below.
      { type: 'contents', id: 'expoConfig', hash: 'h-config' },
    ],
    lockfiles: [{ file: 'yarn.lock', digest: 'h-lock' }],
    autolinkedModules: ['expo-camera@15.0.0'],
  },
};

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-recorded-fp-'));
  projectRoot = path.join(root, 'project');
  bundleDir = path.join(root, 'bundle');
  fs.mkdirSync(projectRoot);
  fs.mkdirSync(bundleDir);

  write('package.json', '{"name":"app"}');
  write('app.json', '{"expo":{"name":"app"}}');
  write('yarn.lock', '# lockfile\n');
  write('ios/Podfile', 'platform :ios');
  write('ios/App/Info.plist', '<plist/>');
  write('android/gradle.properties', 'hermesEnabled=true');
  write('node_modules/expo-camera/android/build.gradle', 'android {}');

  mocks.computeBaseFingerprint.mockReset();
});

afterEach(() => {
  fs.rmSync(path.dirname(projectRoot), { recursive: true, force: true });
});

function writeSidecar(platform: 'android' | 'ios', baseFingerprint: unknown): void {
  fs.writeFileSync(
    path.join(bundleDir, sidecarFileName(platform)),
    JSON.stringify({
      sidecarVersion: SIDECAR_VERSION,
      platform,
      bundle: { file: 'b', sha256: 'x' },
      moduleManifest: { file: 'm', sha256: 'y' },
      project: { dependencyClosure: { source: 'yarn.lock', hash: 'z', packages: [] } },
      appSource: { hash: 'w' },
      gateMetadata: { derivedFrom: 'source' },
      baseFingerprint,
    })
  );
}

describe('what the emit side records', () => {
  it('names the checkout inputs: native files and dirs outside node_modules, lockfiles, config files', () => {
    expect(nativeInputPaths(COMPUTED.preimage!, projectRoot)).toEqual([
      'android/gradle.properties',
      'app.json',
      'ios',
      'package.json',
      'yarn.lock',
    ]);
  });

  it('records the hash, the native hash and a digest over those inputs', () => {
    const recorded = recordBaseFingerprint(COMPUTED, projectRoot);

    expect(recorded).toEqual({
      hash: 'base-hash',
      nativeFingerprint: 'native-hash',
      nativeInputs: {
        paths: ['android/gradle.properties', 'app.json', 'ios', 'package.json', 'yarn.lock'],
        digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it('records nothing when the emitting machine computed no fingerprint', () => {
    expect(
      recordBaseFingerprint({ hash: null, debugMessage: 'no native dirs' }, projectRoot)
    ).toBeNull();
  });
});

describe('the native inputs digest', () => {
  const paths = ['ios', 'android/gradle.properties', 'yarn.lock'];

  it('is stable across runs and independent of path order', () => {
    const first = digestNativeInputs({ projectRoot, paths });
    const second = digestNativeInputs({ projectRoot, paths: [...paths].reverse() });

    expect(first).toBe(second);
  });

  it('moves when a file inside a native directory changes', () => {
    const before = digestNativeInputs({ projectRoot, paths });
    write('ios/App/Info.plist', '<plist><key>changed</key></plist>');

    expect(digestNativeInputs({ projectRoot, paths })).not.toBe(before);
  });

  it('ignores build output and caches, which a build machine has and a checkout does not', () => {
    const before = digestNativeInputs({ projectRoot, paths });
    write('ios/Pods/Foo/Foo.h', '// pod');
    write('ios/build/App.app/App', 'binary');
    write('ios/.DS_Store', 'junk');

    expect(digestNativeInputs({ projectRoot, paths })).toBe(before);
  });

  it('moves when an input is missing', () => {
    const before = digestNativeInputs({ projectRoot, paths });
    fs.rmSync(path.join(projectRoot, 'android'), { recursive: true });

    expect(digestNativeInputs({ projectRoot, paths })).not.toBe(before);
  });
});

describe('what the accept side trusts', () => {
  it('takes the recorded fingerprint when the native inputs are unchanged - with no install at all', async () => {
    const recorded = recordBaseFingerprint(COMPUTED, projectRoot);
    writeSidecar('android', recorded);
    writeSidecar('ios', recorded);

    // The accepting machine: same checkout, nothing installed.
    fs.rmSync(path.join(projectRoot, 'node_modules'), { recursive: true });
    mocks.computeBaseFingerprint.mockResolvedValue({
      hash: null,
      debugMessage: '@expo/fingerprint unavailable',
    });

    const result = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir,
      projectRoot,
      platforms: ['android', 'ios'],
      command: 'test',
    });

    expect(result.hash).toBe('base-hash');
    expect(result.nativeFingerprint).toBe('native-hash');
    expect(mocks.computeBaseFingerprint).not.toHaveBeenCalled();
  });

  it('computes instead when a native input changed, and says what that needs when it cannot', async () => {
    writeSidecar('android', recordBaseFingerprint(COMPUTED, projectRoot));
    write('ios/Podfile', "platform :ios, '16.0'");
    mocks.computeBaseFingerprint.mockResolvedValue({
      hash: null,
      debugMessage: '@expo/fingerprint unavailable',
    });

    const result = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir,
      projectRoot,
      platforms: ['android'],
      command: 'test',
    });

    expect(result.hash).toBeNull();
    expect(result.debugMessage).toContain('the native inputs it was computed over have changed');
    expect(result.debugMessage).toContain('needs the project installed');
  });

  it('computes instead when a native input changed and the install is there', async () => {
    writeSidecar('android', recordBaseFingerprint(COMPUTED, projectRoot));
    write('ios/Podfile', "platform :ios, '16.0'");
    mocks.computeBaseFingerprint.mockResolvedValue({
      hash: 'fresh',
      nativeFingerprint: 'fresh-native',
    });

    const result = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir,
      projectRoot,
      platforms: ['android'],
      command: 'test',
    });

    expect(result.hash).toBe('fresh');
    expect(mocks.computeBaseFingerprint).toHaveBeenCalledWith(projectRoot, { command: 'test' });
  });

  it('computes instead when the platform sidecars disagree, or one records nothing', async () => {
    writeSidecar('android', recordBaseFingerprint(COMPUTED, projectRoot));
    writeSidecar('ios', recordBaseFingerprint({ ...COMPUTED, hash: 'other-tree' }, projectRoot));
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: null, debugMessage: 'unavailable' });

    const disagreeing = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir,
      projectRoot,
      platforms: ['android', 'ios'],
      command: 'test',
    });
    expect(disagreeing.debugMessage).toContain('record different fingerprints');

    writeSidecar('ios', null);
    const partial = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir,
      projectRoot,
      platforms: ['android', 'ios'],
      command: 'test',
    });
    expect(partial.debugMessage).toContain('not every platform sidecar records one');
  });

  it('leaves an unreadable directory to the supplied-bundle road and just computes', async () => {
    mocks.computeBaseFingerprint.mockResolvedValue({ hash: 'fresh', nativeFingerprint: 'n' });

    const result = await resolveBaseFingerprintForSuppliedBundle({
      bundleDir: path.join(bundleDir, 'missing'),
      projectRoot,
      platforms: ['android'],
      command: 'test',
    });

    expect(result.hash).toBe('fresh');
  });
});
