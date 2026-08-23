/**
 * Tests for entry resolution - the reason the action works on BOTH install shapes.
 *
 * A normal `npm install sherlo` links the bin as `sherlo`; the test channel's
 * aliased install ("sherlo": "npm:@sherlo-io/cli@x") installs into the same
 * node_modules/sherlo directory but links its bin as `cli`, because a string
 * `bin` takes its name from the package. Resolving through node's DIRECTORY
 * lookup is what makes the two indistinguishable to the action - looking for a
 * command on PATH would find one and miss the other.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCliEntry } from '../cliEntry.mjs';

const fixtures = [];

afterEach(() => {
  while (fixtures.length > 0) {
    fs.rmSync(fixtures.pop(), { recursive: true, force: true });
  }
});

/**
 * A project directory with the Sherlo CLI installed under node_modules/sherlo -
 * the SAME directory whatever the package calls itself.
 */
function projectWithCliInstalled({ manifest, binFileName = 'cli.js' }) {
  // realpath: node's resolver returns real paths, and the system temp dir is a
  // symlink on macOS - comparing against the symlinked path would fail for a
  // reason that has nothing to do with resolution.
  const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-action-')));
  fixtures.push(projectRoot);

  const packageDir = path.join(projectRoot, 'node_modules', 'sherlo');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
  if (binFileName) {
    fs.writeFileSync(path.join(packageDir, binFileName), '#!/usr/bin/env node\n');
  }

  return { projectRoot, packageDir };
}

describe('resolveCliEntry', () => {
  it('resolves a normal install (package `sherlo`, bin linked as `sherlo`)', () => {
    const { projectRoot, packageDir } = projectWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });

    expect(resolveCliEntry(projectRoot)).toEqual({
      entry: path.join(packageDir, 'cli.js'),
      packageName: 'sherlo',
      version: '2.0.2',
    });
  });

  it('resolves the aliased test-channel install (package `@sherlo-io/cli`, bin linked as `cli`)', () => {
    const { projectRoot, packageDir } = projectWithCliInstalled({
      manifest: { name: '@sherlo-io/cli', version: '2.1.0-test.4', bin: './cli.js' },
    });

    // Same entry script, and the resolved identity names the channel - which is
    // what a CI log needs to show WHICH cli produced the results.
    expect(resolveCliEntry(projectRoot)).toEqual({
      entry: path.join(packageDir, 'cli.js'),
      packageName: '@sherlo-io/cli',
      version: '2.1.0-test.4',
    });
  });

  it('reads an object `bin` by position, since its key is the command name that differs', () => {
    const { projectRoot, packageDir } = projectWithCliInstalled({
      manifest: { name: '@sherlo-io/cli', version: '9.9.9', bin: { cli: './cli.js' } },
    });

    expect(resolveCliEntry(projectRoot).entry).toBe(path.join(packageDir, 'cli.js'));
  });

  it('finds the CLI from a nested working directory (node walks node_modules upward)', () => {
    const { projectRoot, packageDir } = projectWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });
    const appDir = path.join(projectRoot, 'apps', 'mobile');
    fs.mkdirSync(appDir, { recursive: true });

    expect(resolveCliEntry(appDir).entry).toBe(path.join(packageDir, 'cli.js'));
  });

  it('fails with an installable fix when no CLI is installed', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-action-'));
    fixtures.push(projectRoot);

    expect(() => resolveCliEntry(projectRoot)).toThrow(/No Sherlo CLI found/);
    expect(() => resolveCliEntry(projectRoot)).toThrow(/npm install --save-dev sherlo/);
  });

  it('fails when the manifest points at a script that is not on disk', () => {
    const { projectRoot } = projectWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './missing.js' },
      binFileName: 'cli.js',
    });

    expect(() => resolveCliEntry(projectRoot)).toThrow(/missing\.js/);
  });

  it('fails when the installed package declares no bin at all', () => {
    const { projectRoot } = projectWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2' },
    });

    expect(() => resolveCliEntry(projectRoot)).toThrow(/declares no `bin`/);
  });
});
