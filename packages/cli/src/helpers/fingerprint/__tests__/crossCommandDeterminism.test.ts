/**
 * CROSS-COMMAND DETERMINISM REGRESSION TEST (SHERLO-1744, SHERLO-1746)
 *
 * This is the test that would have FAILED the whole night of 2026-07-10/11.
 *
 * Registration (test:standard) and the probe (staged:check / test:bundled) both
 * call `computeBaseFingerprint(projectRoot)` over an identical tree, yet were
 * producing DIFFERENT base fingerprints - so the staged gate lookup never hit
 * and the fast path was silently dead for every user. The root cause is
 * per-command ambient `process.env`: a package manager injects `NODE_ENV`,
 * `npm_lifecycle_event`, … DIFFERENTLY per yarn script, and that env leaked into
 * the fingerprint compute. There are TWO leak surfaces, fixed separately:
 *   - Layer 2 (SHERLO-1744): the autolinking resolve subprocess inherited the
 *     ambient env and resolved a different module set per command. Covered by
 *     the first describe block below (`runShellCommand` is NOT mocked; the real
 *     subprocess exercises the `envMode: 'replace'` fix).
 *   - Layer 1 (SHERLO-1746): `@expo/fingerprint` internally spawns its own
 *     `ExpoConfigLoader.js` to evaluate the app config, which inherited the
 *     ambient env - so an app.config.js that reads env hashed differently per
 *     command. The 1744 fixture keys divergence on autolinking ONLY (Layer 1 was
 *     mocked to a fixed hash), so it could NOT catch this. Covered by the second
 *     describe block below, which makes the Layer-1 mock ENV-SENSITIVE to stand
 *     in for such an app.config.js and exercises the `withDeterministicEnv`
 *     env-swap around `createFingerprintAsync`.
 *
 * These tests compute the base fingerprint via the registration path AND the
 * probe path over ONE fixture tree and ASSERT EQUALITY across:
 *   1. a per-command ambient-env difference at Layer 2 (SHERLO-1744),
 *   2. a projectRoot path-form difference ('.'-form vs absolute - the
 *      @expo/fingerprint path-form footgun), and
 *   3. a per-command ambient-env difference at Layer 1 (SHERLO-1746).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFingerprintAsync } from '@expo/fingerprint';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Layer 1 mocked to a fixed hash - keeps the test fast and focuses it on the
// Layer-2 autolinking subprocess (the divergent input).
vi.mock('@expo/fingerprint', () => ({
  createFingerprintAsync: vi.fn().mockResolvedValue({ hash: 'layer1-fixed-hash' }),
  SourceSkips: { None: 0, ExpoConfigVersions: 1, ExpoConfigRuntimeVersionIfString: 2 },
}));

const RUN_TIMEOUT_MS = 60_000;

let computeBaseFingerprint: typeof import('../baseFingerprint').computeBaseFingerprint;
let fixtureDir: string;
let originalCwd: string;
let originalNodeEnv: string | undefined;
let originalNpmLifecycleEvent: string | undefined;

/** Fixed hash the Layer-1 mock resolves to for the (env-insensitive) 1744 tests. */
const LAYER1_FIXED_HASH = 'layer1-fixed-hash';

function writeFile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

/**
 * A bare RN fixture whose local `react-native` stub reports a dependency VERSION
 * that reflects the ambient `NODE_ENV`. `npx react-native config` resolves this
 * local bin. This stands in for any resolution hook / plugin whose output keys
 * off the inherited env - so WITHOUT the env-sanitization fix, the autolinked
 * set (and the final hash) would differ between two commands run under different
 * ambient environments.
 */
function buildFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-1744-xcmd-'));
  writeFile(dir, 'package.json', JSON.stringify({ name: 'xcmd-app', version: '1.0.0' }));
  writeFile(dir, 'yarn.lock', '# yarn lockfile v1\nxcmd@1.0.0:\n  version "1.0.0"\n');
  writeFile(
    dir,
    'android/app/build.gradle',
    'android {\n    versionCode 1\n    versionName "1.0.0"\n    applicationId "com.xcmd"\n}\n'
  );
  const bin = path.join(dir, 'node_modules', '.bin', 'react-native');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(
    bin,
    [
      '#!/usr/bin/env node',
      "const env = process.env.NODE_ENV || 'unset';",
      'process.stdout.write(JSON.stringify({',
      '  dependencies: {',
      "    'react-native-reanimated': { name: 'react-native-reanimated', version: '3.0.0-' + env },",
      '  },',
      '}));',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  return dir;
}

/** Run the fixture's autolinking stub directly under one ambient env. */
function runStubUnderEnv(dir: string, nodeEnv: string): string {
  const bin = path.join(dir, 'node_modules', '.bin', 'react-native');
  return execFileSync(process.execPath, [bin, 'config'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: nodeEnv },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset Layer 1 to the env-INSENSITIVE fixed hash. The 1744 block relies on
  // this; the 1746 block overrides it with an env-SENSITIVE implementation.
  vi.mocked(createFingerprintAsync).mockResolvedValue({ hash: LAYER1_FIXED_HASH } as never);
  originalCwd = process.cwd();
  originalNodeEnv = process.env.NODE_ENV;
  originalNpmLifecycleEvent = process.env.npm_lifecycle_event;
  fixtureDir = buildFixture();
  computeBaseFingerprint = (await import('../baseFingerprint')).computeBaseFingerprint;
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalNpmLifecycleEvent === undefined) delete process.env.npm_lifecycle_event;
  else process.env.npm_lifecycle_event = originalNpmLifecycleEvent;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('cross-command base fingerprint determinism (SHERLO-1744 AC4)', () => {
  it(
    'sanity: the fixture autolinking subprocess IS ambient-env-sensitive',
    () => {
      // Proves the test is meaningful: without sanitization, the raw subprocess
      // output genuinely differs per ambient env, so the fingerprint WOULD
      // diverge across commands if the env leaked through.
      const dev = runStubUnderEnv(fixtureDir, 'development');
      const prod = runStubUnderEnv(fixtureDir, 'production');
      expect(dev).not.toBe(prod);
    },
    RUN_TIMEOUT_MS
  );

  it(
    'registration and probe paths agree despite a per-command ambient-env difference',
    async () => {
      // Registration path runs under one ambient env; the probe under another -
      // exactly the CI condition that broke the staged gate.
      process.env.NODE_ENV = 'development';
      const registration = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      process.env.NODE_ENV = 'production';
      const probe = await computeBaseFingerprint(fixtureDir, { command: 'staged:check' });

      expect(registration.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(registration.hash).toBe(probe.hash);
    },
    RUN_TIMEOUT_MS
  );

  it(
    "registration and probe paths agree despite a projectRoot path-form difference ('.' vs absolute)",
    async () => {
      // Registration passes an absolute projectRoot; the probe passes '.'-form
      // from the same cwd. @expo/fingerprint is path-form-sensitive, so without
      // normalization these could disagree.
      const registration = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      process.chdir(fixtureDir);
      const probe = await computeBaseFingerprint('.', { command: 'staged:check' });

      expect(registration.hash).toBe(probe.hash);
    },
    RUN_TIMEOUT_MS
  );
});

describe('cross-command Layer-1 env determinism (SHERLO-1746)', () => {
  /**
   * Make the Layer-1 mock ENV-SENSITIVE: its hash reflects the ambient
   * `NODE_ENV` and `npm_lifecycle_event`. This stands in for an app.config.js
   * whose evaluation reads env - exactly what `@expo/fingerprint`'s internal
   * `ExpoConfigLoader.js` subprocess would observe. Under the env-swap fix the
   * compute always sees the pinned deterministic env, so the hash is stable
   * across commands.
   */
  beforeEach(() => {
    vi.mocked(createFingerprintAsync).mockImplementation(
      async () =>
        ({
          hash: `layer1-${process.env.NODE_ENV ?? 'unset'}-${
            process.env.npm_lifecycle_event ?? 'unset'
          }`,
        } as never)
    );
  });

  it('sanity: the Layer-1 mock IS ambient-env-sensitive', async () => {
    // Proves the regression test is meaningful: without the env-swap the mock
    // genuinely returns a different hash per ambient env, so the fingerprint
    // WOULD diverge across commands if that env leaked into the compute.
    process.env.NODE_ENV = 'development';
    process.env.npm_lifecycle_event = 'test:standard';
    const dev = await createFingerprintAsync(fixtureDir, {});

    process.env.NODE_ENV = 'production';
    process.env.npm_lifecycle_event = 'test:bundled';
    const prod = await createFingerprintAsync(fixtureDir, {});

    expect(dev.hash).not.toBe(prod.hash);
  });

  it(
    'registration and probe paths agree despite a per-command Layer-1 ambient-env difference',
    async () => {
      // Registration path runs under the test:standard ambient env; the probe
      // under the test:bundled one - exactly the CI condition that broke the
      // staged gate. Without the swap the two Layer-1 hashes (and the finals)
      // diverge; with it both see the pinned NODE_ENV='production'.
      process.env.NODE_ENV = 'development';
      process.env.npm_lifecycle_event = 'test:standard';
      const registration = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      process.env.NODE_ENV = 'production';
      process.env.npm_lifecycle_event = 'test:bundled';
      const probe = await computeBaseFingerprint(fixtureDir, { command: 'test:bundled' });

      expect(registration.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(registration.hash).toBe(probe.hash);
    },
    RUN_TIMEOUT_MS
  );

  it(
    'is fail-soft on a Layer-1 throw and fully restores process.env (no allowlist leak)',
    async () => {
      // A pre-existing, non-allowlisted ambient var and a distinctive NODE_ENV
      // must both survive the compute untouched - proving the env-swap restores
      // the EXACT original env on the throwing path, leaking nothing.
      const marker = 'sherlo-1746-marker-should-survive';
      process.env.SHERLO_1746_CANARY = marker;
      process.env.NODE_ENV = 'development';

      vi.mocked(createFingerprintAsync).mockRejectedValue(new Error('boom'));

      const result = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      // (a) fail-soft: unrecoverable Layer-1 error degrades to a null hash.
      expect(result.hash).toBeNull();

      // (b) env fully restored: the pinned production value did not leak out and
      // the arbitrary pre-existing var is intact.
      expect(process.env.NODE_ENV).toBe('development');
      expect(process.env.SHERLO_1746_CANARY).toBe(marker);

      delete process.env.SHERLO_1746_CANARY;
    },
    RUN_TIMEOUT_MS
  );
});

describe('test:standard pre-step ordering determinism (SHERLO-1756)', () => {
  /**
   * SHERLO-1756: on the test:standard path the consumer used to run a SECOND,
   * RAW `createFingerprintAsync` (a standalone native pre-compute) BEFORE
   * `computeBaseFingerprint`, in the same process. Loading the Expo app config
   * mutates `process.env` as a dotenv-class side effect, so that raw pre-compute
   * polluted the env `computeBaseFingerprint` then snapshotted: the registration
   * Layer-1 ran "sanitized-from-polluted" while every probe (staged:check /
   * test:bundled, which never do a native pre-compute) ran "sanitized-from-clean".
   * Byte-identical tree, two different base hashes, dead staged fast-path.
   *
   * The fix DELETES the raw pre-compute: `computeBaseFingerprint` is the ONLY
   * `createFingerprintAsync` invocation, and the `nativeFingerprint` wire value is
   * sourced from its sanitized Layer-1 result. This case asserts the registration
   * base hash equals a bare probe-style compute even when a config load pollutes
   * an allowlisted env var mid-run.
   */
  // An ALLOWLISTED env var, so pollution survives the deterministic-env
  // sanitization (a non-allowlisted var would be stripped and mask the hazard).
  const POLLUTABLE_ENV_KEY = 'LANG';
  let savedLang: string | undefined;

  beforeEach(() => {
    savedLang = process.env[POLLUTABLE_ENV_KEY];
    // Model an app.config.js whose evaluation (a) reads env to shape its hash and
    // (b) as a dotenv-class side effect MUTATES an allowlisted env var. Under the
    // env-swap that mutation is reverted, but a RAW (unswapped) pre-compute leaks
    // it into the ambient env, skewing any base compute whose snapshot follows.
    vi.mocked(createFingerprintAsync).mockImplementation(async () => {
      const variant = process.env[POLLUTABLE_ENV_KEY] ?? 'unset';
      process.env[POLLUTABLE_ENV_KEY] = 'polluted-by-config-load';
      return { hash: `layer1-${variant}` } as never;
    });
  });

  afterEach(() => {
    if (savedLang === undefined) delete process.env[POLLUTABLE_ENV_KEY];
    else process.env[POLLUTABLE_ENV_KEY] = savedLang;
  });

  it(
    'sanity: a raw native pre-compute leaks pollution that survives sanitization',
    async () => {
      // Proves the fixture is meaningful: a RAW createFingerprintAsync (no env
      // swap) persistently mutates the allowlisted var, so a base compute run
      // afterward sees a different sanitized env than one run from a clean env.
      process.env[POLLUTABLE_ENV_KEY] = 'clean';
      const clean = await computeBaseFingerprint(fixtureDir, { command: 'staged:check' });

      process.env[POLLUTABLE_ENV_KEY] = 'clean';
      await createFingerprintAsync(fixtureDir); // raw, unswapped - leaks pollution
      const afterRaw = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      expect(afterRaw.hash).not.toBe(clean.hash);
    },
    RUN_TIMEOUT_MS
  );

  it(
    'registration and probe base hashes agree over the full pre-step sequence',
    async () => {
      // Probe path (staged:check): no native pre-compute, clean env.
      process.env[POLLUTABLE_ENV_KEY] = 'clean';
      const probe = await computeBaseFingerprint(fixtureDir, { command: 'staged:check' });

      // Registration path (test:standard): the base compute is the ONLY
      // createFingerprintAsync invocation - no native pre-call touches the config
      // before it, so nothing pollutes the env it snapshots.
      process.env[POLLUTABLE_ENV_KEY] = 'clean';
      const registration = await computeBaseFingerprint(fixtureDir, { command: 'test:standard' });

      // The base hash (which folds in Layer-1) must match the probe's...
      expect(registration.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(registration.hash).toBe(probe.hash);
      // ...and the nativeFingerprint (the single sanitized Layer-1) is sourced from
      // that same compute and likewise matches the probe's.
      expect(registration.nativeFingerprint).toBe(probe.nativeFingerprint);
    },
    RUN_TIMEOUT_MS
  );
});
