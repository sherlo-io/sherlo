/**
 * The version the CLI records as its OWN, in every layout it runs in.
 *
 * The sidecar and the fingerprint document both record `cliVersion`, and it has to
 * be the CLI's version wherever the code happens to sit: `src/commands/test` when
 * run from source, `dist` after the ncc build flattens every module into one file,
 * and `node_modules/sherlo/dist` once installed in somebody's project. A fixed
 * number of `..` hops cannot be right in all three - in the installed layout it
 * walked past the CLI and read the CONSUMER's package.json, so every sidecar
 * reported the app's version as the CLI's.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCliVersionFrom, readCliVersion } from '../bundleSidecar';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    fs.rmSync(fixtures.pop() as string, { recursive: true, force: true });
  }
});

/** A consumer project with the CLI installed inside it, built to a chosen depth. */
function installedCli({
  cliManifest,
  consumerManifest = { name: 'my-app', version: '1.2.0' },
}: {
  cliManifest: Record<string, unknown>;
  consumerManifest?: Record<string, unknown>;
}) {
  const consumerRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-cli-')));
  fixtures.push(consumerRoot);
  fs.writeFileSync(path.join(consumerRoot, 'package.json'), JSON.stringify(consumerManifest));

  const cliRoot = path.join(consumerRoot, 'node_modules', 'sherlo');
  const distDir = path.join(cliRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify(cliManifest));

  return { consumerRoot, cliRoot, distDir };
}

describe('the CLI version recorded in a sidecar', () => {
  it("is the CLI's own version in the installed, ncc-built layout", () => {
    const { distDir } = installedCli({
      cliManifest: { name: 'sherlo', version: '2.0.2' },
    });

    // 1.2.0 is the consumer's version - the answer this used to give.
    expect(findCliVersionFrom(distDir)).toBe('2.0.2');
  });

  it('recognises the aliased test-channel package by name', () => {
    const { distDir } = installedCli({
      cliManifest: { name: '@sherlo-io/cli', version: '2.1.0-test.4' },
    });

    expect(findCliVersionFrom(distDir)).toBe('2.1.0-test.4');
  });

  it("is null rather than a stranger's version when no CLI package is above it", () => {
    const { consumerRoot } = installedCli({
      cliManifest: { name: 'sherlo', version: '2.0.2' },
    });
    const unrelatedDir = path.join(consumerRoot, 'src', 'screens');
    fs.mkdirSync(unrelatedDir, { recursive: true });

    expect(findCliVersionFrom(unrelatedDir)).toBeNull();
  });

  it('reads this package when running from source, as the suite itself does', () => {
    const ownVersion = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8')
    ).version;

    expect(readCliVersion()).toBe(ownVersion);
  });
});
