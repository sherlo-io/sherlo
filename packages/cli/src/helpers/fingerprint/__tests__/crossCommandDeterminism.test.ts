/**
 * CROSS-COMMAND DETERMINISM REGRESSION TEST (SHERLO-1744, AC4)
 *
 * This is the test that would have FAILED the whole night of 2026-07-10/11.
 *
 * Registration (test:standard) and the probe (staged:check) both call
 * `computeBaseFingerprint(projectRoot)` over an identical tree, yet were
 * producing DIFFERENT base fingerprints - so the staged gate lookup never hit
 * and the fast path was silently dead for every user. The instrument
 * (`SHERLO_FINGERPRINT_DEBUG=1`) named the divergent input as
 * `layer2.autolinked`: the autolinking resolve subprocess inherited the CLI's
 * ambient `process.env`, which a package manager injects DIFFERENTLY per yarn
 * script (`NODE_ENV`, `npm_lifecycle_event`, …), so the same tree resolved a
 * different module set per command.
 *
 * These tests compute the base fingerprint via the registration path AND the
 * probe path over ONE fixture tree and ASSERT EQUALITY across:
 *   1. a per-command ambient-env difference (the named root cause), and
 *   2. a projectRoot path-form difference ('.'-form vs absolute - the
 *      @expo/fingerprint path-form footgun).
 *
 * `@expo/fingerprint` (Layer 1) is mocked to a fixed hash so the test is fast
 * and isolates Layer 2. `runShellCommand` is deliberately NOT mocked: the real
 * autolinking subprocess is what exercises the env-determinism fix.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  originalCwd = process.cwd();
  originalNodeEnv = process.env.NODE_ENV;
  fixtureDir = buildFixture();
  computeBaseFingerprint = (await import('../baseFingerprint')).computeBaseFingerprint;
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
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
