/**
 * The base fingerprint's PRE-IMAGE - the inputs the hash was computed over.
 *
 * Two things are guarded here and they pull in opposite directions:
 *
 *   1. RETAINING the pre-image must not move a single digest. The hash values
 *      below are PINNED, so a change that alters them fails here rather than
 *      silently invalidating every fingerprint already registered against the
 *      staged gate. They were re-pinned ONCE when the base fingerprint became one
 *      per platform and the JavaScript lockfiles left it (epic
 *      sherlo-test-builds-apps; Sherlo 3 is unreleased, so no stored base moves).
 *   2. The pre-image must never carry SOURCE TEXT. `@expo/fingerprint` emits
 *      `contents` sources whose value IS the hashed input - a resolved Expo
 *      config, which routinely holds customer secrets in `extra`. Only the id and
 *      the hash may survive.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mockCreateFingerprintAsync = vi.fn();

vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: (...args: any[]) => mockCreateFingerprintAsync(...args),
  SourceSkips: { None: 0, ExpoConfigVersions: 1, ExpoConfigRuntimeVersionIfString: 2 },
}));

// Autolinking is a subprocess; rejecting it makes the Layer-2 module set empty
// and the whole computation reproducible on any machine.
vi.mock('../../runShellCommand', () => ({
  default: vi.fn().mockRejectedValue(new Error('not available in test')),
}));

/**
 * The fixture the pins below were captured over: a managed project with exactly
 * one native lockfile (iOS's Gemfile.lock). Every byte here is load-bearing -
 * editing it invalidates the pins.
 */
function makePinnedFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-preimage-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"pinned","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(dir, 'Gemfile.lock'), '# pinned gemfile lockfile\n');
  return dir;
}

/** The Layer-1 hash the mocked library reports for the pinned fixture, on each platform. */
const PINNED_LAYER1_HASH = 'fp-layer1-abc123';

/** Each platform's base fingerprint of the pinned fixture. This is the behavior-preservation proof. */
const PINNED_BASE_FINGERPRINT = {
  android: 'a9da6da508f5e658a1d174eb180e5fdbb762b55cb00ffcfdbede2937203acb7c',
  ios: 'b48678ea0f0f7047315ddd7cd79643fe41965941225550b3d147d55252b1a002',
};

/** The native fingerprint of the pinned fixture: both platforms' Layer-1 hashes. */
const PINNED_NATIVE_FINGERPRINT =
  'd22d6b54c090a0cf462fa38faeb2f9c150680eb54772b97a2ed96143e959a7a4';

/** The secret a real resolved Expo config would carry - it must never be retained. */
const CUSTOMER_SECRET = 'sk-live-customer-secret-value';

describe('base fingerprint pre-image', () => {
  let computeBaseFingerprint: typeof import('../baseFingerprint').computeBaseFingerprint;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateFingerprintAsync.mockResolvedValue({ hash: PINNED_LAYER1_HASH, sources: [] });
    computeBaseFingerprint = (await import('../baseFingerprint')).computeBaseFingerprint;
  });

  it('produces the pinned digest - retaining the pre-image moved nothing', async () => {
    const dir = makePinnedFixture();
    try {
      const result = await computeBaseFingerprint(dir);

      expect(result.android.hash).toBe(PINNED_BASE_FINGERPRINT.android);
      expect(result.ios.hash).toBe(PINNED_BASE_FINGERPRINT.ios);
      expect(result.android.nativeFingerprint).toBe(PINNED_NATIVE_FINGERPRINT);
      expect(result.ios.nativeFingerprint).toBe(PINNED_NATIVE_FINGERPRINT);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retains the lockfile that fed the digest, as filename plus digest', async () => {
    const dir = makePinnedFixture();
    try {
      const result = await computeBaseFingerprint(dir);

      expect(result.ios.preimage?.workflow).toBe('managed');
      expect(result.ios.preimage?.lockfiles).toEqual([
        {
          file: 'Gemfile.lock',
          // sha256 of "# pinned gemfile lockfile\n".
          digest: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ]);
      expect(result.ios.preimage?.autolinkedModules).toEqual([]);
      // Android pins its native dependencies in no lockfile Sherlo reads.
      expect(result.android.preimage?.lockfiles).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retains a contents source by id and hash only, never its value', async () => {
    mockCreateFingerprintAsync.mockResolvedValue({
      hash: PINNED_LAYER1_HASH,
      sources: [
        { type: 'file', filePath: 'ios/Podfile', reasons: ['bareRncliAutolinking'], hash: 'h1' },
        { type: 'dir', filePath: 'android', reasons: ['bareNativeDir'], hash: 'h2' },
        {
          type: 'contents',
          id: 'expoConfig',
          contents: JSON.stringify({ expo: { extra: { apiKey: CUSTOMER_SECRET } } }),
          reasons: ['expoConfig'],
          hash: 'h3',
        },
      ],
    });

    const dir = makePinnedFixture();
    try {
      const result = await computeBaseFingerprint(dir);

      expect(result.android.preimage?.nativeSources).toEqual([
        { type: 'file', id: 'ios/Podfile', hash: 'h1' },
        { type: 'dir', id: 'android', hash: 'h2' },
        { type: 'contents', id: 'expoConfig', hash: 'h3' },
      ]);

      // The whole point: the retained structure is written to a file later, so no
      // serialization of it may contain the config's text anywhere.
      expect(JSON.stringify(result)).not.toContain(CUSTOMER_SECRET);
      // No retained source carries a `contents` field at all - not just this one.
      for (const platform of ['android', 'ios'] as const) {
        for (const source of result[platform].preimage?.nativeSources ?? []) {
          expect(Object.keys(source).sort()).toEqual(['hash', 'id', 'type']);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no pre-image when the fingerprint is unrecoverable', async () => {
    mockCreateFingerprintAsync.mockRejectedValue(new Error('library missing'));

    const dir = makePinnedFixture();
    try {
      const result = await computeBaseFingerprint(dir);

      expect(result.android.hash).toBeNull();
      expect(result.android.preimage).toBeUndefined();
      expect(result.ios.preimage).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
