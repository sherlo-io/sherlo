/**
 * Tests for uploadStagedArtifacts - the SHERLO-1894 module-manifest upload slot.
 *
 * Focus: the manifest is a THIRD staged slot uploaded alongside jsBundle/assets,
 * and every manifest failure mode BAILS OPEN - a missing server slot, or an upload
 * error, must never fail the build. The jsBundle upload keeps its hard-failure
 * semantics (that is NOT bailed open).
 */
import fs from 'fs';
import zlib from 'zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../../../helpers/reporting', () => ({
  default: { addBreadcrumb: vi.fn(), captureException: vi.fn() },
}));

import fetch from 'node-fetch';
import uploadStagedArtifacts from '../uploadStagedArtifacts';

const mockFetch = vi.mocked(fetch as unknown as (...args: any[]) => Promise<any>);

const JS_BUNDLE_URL = 'http://s3/js';
const MANIFEST_URL = 'http://s3/manifest';

function okResponse() {
  return { ok: true, status: 200, text: async () => '' };
}

function bundleResult(overrides: Record<string, unknown> = {}): any {
  return {
    bundlePath: '/tmp/bundle.ios.js',
    bundleFormat: 'plain-js',
    bundleSizeMb: 1.5,
    bundleHash: 'abc',
    assetsDest: undefined, // no assets -> only jsBundle (+ manifest) upload
    assetInventory: [],
    bundler: 'expo',
    ...overrides,
  };
}

function manifest(raw = '{"version":1,"header":{},"moduleHashes":{},"storyClosures":{}}') {
  return { raw: Buffer.from(raw, 'utf8'), parsed: JSON.parse(raw) };
}

function urls(withManifest: boolean) {
  return {
    jsBundle: { s3Key: 'js-key', url: JS_BUNDLE_URL },
    assets: { s3Key: 'assets-key', url: 'http://s3/assets' },
    ...(withManifest ? { manifest: { s3Key: 'manifest-key', url: MANIFEST_URL } } : {}),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The jsBundle read is a real fs call in the source; stub it to a fixed buffer.
  vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('BUNDLE_BYTES'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('module manifest upload (SHERLO-1894)', () => {
  it('uploads the gzipped manifest to the manifest slot and returns manifestS3Key', async () => {
    mockFetch.mockResolvedValue(okResponse());

    const keys = await uploadStagedArtifacts({
      platform: 'ios',
      bundleResult: bundleResult({ moduleManifest: manifest() }),
      urls: urls(true),
    });

    expect(keys.jsBundleS3Key).toBe('js-key');
    expect(keys.manifestS3Key).toBe('manifest-key');

    // The manifest PUT went to the manifest slot with GZIP bytes (not raw JSON).
    const manifestCall = mockFetch.mock.calls.find((c) => c[0] === MANIFEST_URL);
    expect(manifestCall).toBeDefined();
    const sentBuffer: Buffer = manifestCall![1].body;
    // gzip magic header 0x1f 0x8b, and it round-trips back to the raw bytes.
    expect(sentBuffer[0]).toBe(0x1f);
    expect(sentBuffer[1]).toBe(0x8b);
    expect(zlib.gunzipSync(sentBuffer).toString('utf8')).toBe(manifest().raw.toString('utf8'));
  });

  it('BAIL-OPEN: no server manifest slot -> jsBundle still uploads, no manifestS3Key, no throw', async () => {
    mockFetch.mockResolvedValue(okResponse());
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const keys = await uploadStagedArtifacts({
      platform: 'ios',
      bundleResult: bundleResult({ moduleManifest: manifest() }),
      urls: urls(false), // old API / published sdk-client: no manifest slot
    });

    expect(keys.jsBundleS3Key).toBe('js-key');
    expect(keys.manifestS3Key).toBeUndefined();
    // No manifest PUT was attempted.
    expect(mockFetch.mock.calls.some((c) => c[0] === MANIFEST_URL)).toBe(false);
    // Missing slot is not a warning - it is the expected skew case.
    expect(logSpy.mock.calls.map((c) => c.join(' ')).join('')).not.toMatch(/WARNING/);
  });

  it('BAIL-OPEN: build produced no manifest -> slot present but nothing uploaded', async () => {
    mockFetch.mockResolvedValue(okResponse());

    const keys = await uploadStagedArtifacts({
      platform: 'ios',
      bundleResult: bundleResult({ moduleManifest: undefined }),
      urls: urls(true),
    });

    expect(keys.manifestS3Key).toBeUndefined();
    expect(mockFetch.mock.calls.some((c) => c[0] === MANIFEST_URL)).toBe(false);
  });

  it('BAIL-OPEN: manifest upload errors -> WARNING, no manifestS3Key, build NOT failed', async () => {
    // jsBundle succeeds; every manifest PUT rejects (exhausting retries).
    mockFetch.mockImplementation((url: string) => {
      if (url === MANIFEST_URL) return Promise.reject(new Error('network down'));
      return Promise.resolve(okResponse());
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const keys = await uploadStagedArtifacts({
      platform: 'ios',
      bundleResult: bundleResult({ moduleManifest: manifest() }),
      urls: urls(true),
    });

    // jsBundle key is still returned; the manifest failure did not propagate.
    expect(keys.jsBundleS3Key).toBe('js-key');
    expect(keys.manifestS3Key).toBeUndefined();
    const warned = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).toMatch(/WARNING/);
    expect(warned).toMatch(/module manifest/i);
    expect(warned).toMatch(/continuing without it/);
  });

  it('a jsBundle upload failure is NOT bailed open (still a hard error)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      uploadStagedArtifacts({
        platform: 'ios',
        bundleResult: bundleResult({ moduleManifest: manifest() }),
        urls: urls(true),
      })
    ).rejects.toThrow();
  });
});
