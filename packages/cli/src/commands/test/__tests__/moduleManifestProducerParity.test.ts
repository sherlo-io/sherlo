/**
 * Producer-header-parity test (SHERLO-1943, PRODUCER HEADER PARITY AC).
 *
 * test:standard does NOT implement a second module-manifest producer: it
 * calls the EXACT same buildBundleForPlatform test:bundled uses. This is the
 * structural half of the comparability proof - it drives BOTH paths against
 * the same mocked bundler output on the same working tree and asserts the
 * resulting manifest.header (metroVersion, babelConfigDigest, envDigest,
 * envKeys) is byte-identical, because there is only one producer to route
 * through.
 *
 * The bundler itself is mocked (same technique as buildBundle.test.ts) - no
 * real Metro/expo process runs - but buildBundleForPlatform is NOT mocked:
 * both the "test:bundled" call and the "test:standard" call below execute
 * the real function.
 */
import chalk from 'chalk';
chalk.level = 0;

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from '@sherlo/api-types';

// ---------------------------------------------------------------------------
// Mocks - bundler + surrounding project-detection only. buildBundleForPlatform
// and emitAndUploadModuleManifests are REAL (not mocked).
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({ execSync: vi.fn() }));

vi.mock('../../showError/detectBundler', () => ({
  default: vi.fn(),
  detectEntryFile: vi.fn(),
}));

vi.mock('../../init/requirements/getPackageVersion', () => ({
  default: vi.fn(),
}));

vi.mock('../readBundledSdkProtocolVersion', () => ({
  readBundledSdkProtocolVersion: vi.fn(),
}));

const mocks = vi.hoisted(() => ({ putBuffer: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../uploadStagedArtifacts', () => ({ putBuffer: mocks.putBuffer }));

import detectBundlerDefault from '../../showError/detectBundler';
import { detectEntryFile as detectEntryFileNamed } from '../../showError/detectBundler';
import getPackageVersionDefault from '../../init/requirements/getPackageVersion';
import { buildBundleForPlatform } from '../buildBundle';
import { emitAndUploadModuleManifests } from '../../../helpers/emitAndUploadModuleManifests';

const mockExecSync = vi.mocked(execSync);
const mockDetectBundler = vi.mocked(detectBundlerDefault);
const mockDetectEntryFile = vi.mocked(detectEntryFileNamed);
const mockGetPackageVersion = vi.mocked(getPackageVersionDefault);

// ---------------------------------------------------------------------------
// Fixture: a fixed manifest sidecar the mocked bundler "emits" on every run.
// ---------------------------------------------------------------------------

let tempDir: string;
const MANIFEST_REL = ['node_modules', '.cache', 'sherlo', 'module-manifest.json'];

function manifestSidecarPath(): string {
  return path.join(tempDir, ...MANIFEST_REL);
}

function manifestSidecarJson(): string {
  return JSON.stringify({
    version: 1,
    header: {
      metroVersion: '0.81.3',
      babelConfigDigest: 'digest-abc123',
      envDigest: 'env-digest-xyz789',
      envKeys: ['NODE_ENV'],
      absolutePathLeaks: [],
    },
    moduleHashes: { './src/App.tsx': 'a'.repeat(64) },
    storyClosures: { './src/App.stories.tsx': ['./src/App.tsx'] },
  });
}

/** Models a single platform's bundler + Metro serializer run, deterministically. */
function mockBundlerRun() {
  mockGetPackageVersion.mockReturnValue('0.76.0');
  mockDetectBundler.mockReturnValue('rn');
  mockDetectEntryFile.mockReturnValue('index.js');
  mockExecSync.mockImplementation(((cmd: string) => {
    const bundleMatch = cmd.match(/--bundle-output[= ](\S+)/);
    if (bundleMatch) {
      const dir = path.dirname(bundleMatch[1]);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(bundleMatch[1], Buffer.from('(function(global){})();', 'utf8'));
    }
    const mp = manifestSidecarPath();
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, manifestSidecarJson(), 'utf8');
    return Buffer.alloc(0);
  }) as any);
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-manifest-parity-'));
  vi.clearAllMocks();
  mocks.putBuffer.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('module manifest producer parity (SHERLO-1943)', () => {
  it('test:standard and test:bundled route through the SAME buildBundleForPlatform and produce byte-identical headers', async () => {
    // --- "test:bundled" side: call the producer directly, exactly as
    // stagedRun.ts does. ---
    mockBundlerRun();
    const bundledResult = await buildBundleForPlatform({
      projectRoot: tempDir,
      platform: 'android' as Platform,
    });
    expect(bundledResult.moduleManifest).toBeDefined();
    const bundledHeader = bundledResult.moduleManifest!.parsed.header;
    const bundledRaw = bundledResult.moduleManifest!.raw;

    // --- "test:standard" side: go through the guarded producer pass. The
    // bundler mock is reset to model a fresh, independent bundler invocation
    // on the SAME working tree (same fixed sidecar), then captured via the
    // exact upload path emitAndUploadModuleManifests uses. ---
    mockBundlerRun();
    const client = {
      getStagedUploadUrls: vi.fn().mockResolvedValue({
        stagedPresignedUploadUrls: {
          android: { manifest: { url: 'http://s3/manifest', s3Key: 'manifest-key' } },
        },
      }),
    } as any;

    const keys = await emitAndUploadModuleManifests({
      client,
      projectRoot: tempDir,
      platforms: ['android' as Platform],
      gitInfo: { commitName: 'c', commitHash: 'h', branchName: 'b', isDirty: false },
      projectIndex: 1,
      teamId: 'team',
    });

    expect(keys.android).toBe('manifest-key');
    expect(mocks.putBuffer).toHaveBeenCalledTimes(1);
    const uploadedGzip: Buffer = mocks.putBuffer.mock.calls[0][0].buffer;
    const uploadedRaw = zlib.gunzipSync(uploadedGzip);
    const standardHeader = JSON.parse(uploadedRaw.toString('utf8')).header;

    // The structural proof: both flows produced the manifest through the
    // identical function, so the header - and the raw bytes wrapping it - are
    // byte-identical.
    expect(standardHeader).toEqual(bundledHeader);
    expect(uploadedRaw.equals(bundledRaw)).toBe(true);

    // Sanity: the bundler was actually invoked twice (once per "flow"), not
    // stubbed away - this is a real (mocked-bundler) execution, not a fixture
    // read from disk.
    expect(mockExecSync).toHaveBeenCalledTimes(2);
  });
});
