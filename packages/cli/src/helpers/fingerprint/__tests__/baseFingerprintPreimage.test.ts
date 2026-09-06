/**
 * The base fingerprint's PRE-IMAGE - the inputs the hash was computed over.
 *
 * Two things are guarded here and they pull in opposite directions:
 *
 *   1. RETAINING the pre-image must not move a single digest. The hash values
 *      below are PINNED: they were captured from the code as it stood BEFORE the
 *      pre-image existed, so a change that alters them fails here rather than
 *      silently invalidating every fingerprint already registered against the
 *      staged gate.
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
 * one lockfile. Every byte here is load-bearing - editing it invalidates the pins.
 */
function makePinnedFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-fp-preimage-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"pinned","version":"1.0.0"}\n');
  fs.writeFileSync(path.join(dir, 'yarn.lock'), '# pinned yarn lockfile\n');
  return dir;
}

/** The Layer-1 hash the mocked library reports for the pinned fixture. */
const PINNED_LAYER1_HASH = 'fp-layer1-abc123';

/**
 * The final base fingerprint of the pinned fixture, captured from the code BEFORE
 * the pre-image was retained. This is the behavior-preservation proof.
 */
const PINNED_BASE_FINGERPRINT = '11a1c1f015505053925e06428d9f66a6ba4b2e454782b0cfdb0a641c3f1214d5';

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

      expect(result.hash).toBe(PINNED_BASE_FINGERPRINT);
      expect(result.nativeFingerprint).toBe(PINNED_LAYER1_HASH);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retains the lockfile that fed the digest, as filename plus digest', async () => {
    const dir = makePinnedFixture();
    try {
      const result = await computeBaseFingerprint(dir);

      expect(result.preimage?.workflow).toBe('managed');
      expect(result.preimage?.lockfiles).toEqual([
        {
          file: 'yarn.lock',
          // sha256 of "# pinned yarn lockfile\n".
          digest: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      ]);
      expect(result.preimage?.autolinkedModules).toEqual([]);
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

      expect(result.preimage?.nativeSources).toEqual([
        { type: 'file', id: 'ios/Podfile', hash: 'h1' },
        { type: 'dir', id: 'android', hash: 'h2' },
        { type: 'contents', id: 'expoConfig', hash: 'h3' },
      ]);

      // The whole point: the retained structure is written to a file later, so no
      // serialization of it may contain the config's text anywhere.
      expect(JSON.stringify(result.preimage)).not.toContain(CUSTOMER_SECRET);
      // No retained source carries a `contents` field at all - not just this one.
      for (const source of result.preimage?.nativeSources ?? []) {
        expect(Object.keys(source).sort()).toEqual(['hash', 'id', 'type']);
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

      expect(result.hash).toBeNull();
      expect(result.preimage).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
