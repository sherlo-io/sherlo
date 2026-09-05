/**
 * Tests for entry resolution - which CLI a run executes, and why.
 *
 * TWO THINGS ARE UNDER TEST. First, the SHAPES: a normal `npm install sherlo` links
 * the bin as `sherlo`; the test channel's aliased install
 * ("sherlo": "npm:@sherlo-io/cli@x") installs into the same node_modules/sherlo
 * directory but links its bin as `cli`, because a string `bin` takes its name from
 * the package. Resolving through node's DIRECTORY lookup is what makes the two
 * indistinguishable to the action - looking for a command on PATH would find one and
 * miss the other.
 *
 * Second, the ORDER: the project's own install always wins, the copy the action
 * carries is only the fallback, and when neither exists the error names both places.
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

/** An empty directory that is cleaned up after the test. */
function emptyDirectory() {
  // realpath: node's resolver returns real paths, and the system temp dir is a
  // symlink on macOS - comparing against the symlinked path would fail for a
  // reason that has nothing to do with resolution.
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-action-')));
  fixtures.push(directory);

  return directory;
}

/**
 * A root with the Sherlo CLI installed under node_modules/sherlo - the SAME layout
 * for a project's install and for the copy the action carries, which is why one
 * helper builds both.
 */
function rootWithCliInstalled({ manifest, binFileName = 'cli.js' }) {
  const root = emptyDirectory();

  const packageDir = path.join(root, 'node_modules', 'sherlo');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(manifest));
  if (binFileName) {
    fs.writeFileSync(path.join(packageDir, binFileName), '#!/usr/bin/env node\n');
  }

  return { root, packageDir };
}

/** A carried-CLI root a release ref would have committed. */
function carriedCliRoot(version = '2.0.2') {
  return rootWithCliInstalled({
    manifest: { name: 'sherlo', version, bin: './cli.js' },
  });
}

/** A carried-CLI root for a ref that carries no CLI (every non-release ref). */
function noCarriedCli() {
  return emptyDirectory();
}

describe('resolveCliEntry', () => {
  it('resolves a normal install (package `sherlo`, bin linked as `sherlo`)', () => {
    const { root, packageDir } = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });

    expect(resolveCliEntry(root, noCarriedCli())).toEqual({
      entry: path.join(packageDir, 'cli.js'),
      packageName: 'sherlo',
      version: '2.0.2',
      source: 'project',
    });
  });

  it('resolves the aliased test-channel install (package `@sherlo-io/cli`, bin linked as `cli`)', () => {
    const { root, packageDir } = rootWithCliInstalled({
      manifest: { name: '@sherlo-io/cli', version: '2.1.0-test.4', bin: './cli.js' },
    });

    // Same entry script, and the resolved identity names the channel - which is
    // what a CI log needs to show WHICH cli produced the results.
    expect(resolveCliEntry(root, noCarriedCli())).toEqual({
      entry: path.join(packageDir, 'cli.js'),
      packageName: '@sherlo-io/cli',
      version: '2.1.0-test.4',
      source: 'project',
    });
  });

  it('reads an object `bin` by position, since its key is the command name that differs', () => {
    const { root, packageDir } = rootWithCliInstalled({
      manifest: { name: '@sherlo-io/cli', version: '9.9.9', bin: { cli: './cli.js' } },
    });

    expect(resolveCliEntry(root, noCarriedCli()).entry).toBe(path.join(packageDir, 'cli.js'));
  });

  it('finds the CLI from a nested working directory (node walks node_modules upward)', () => {
    const { root, packageDir } = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });
    const appDir = path.join(root, 'apps', 'mobile');
    fs.mkdirSync(appDir, { recursive: true });

    expect(resolveCliEntry(appDir, noCarriedCli()).entry).toBe(path.join(packageDir, 'cli.js'));
  });

  it("prefers the project's install over the carried copy, keeping the pinned version", () => {
    const project = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });
    const carried = carriedCliRoot('9.9.9');

    expect(resolveCliEntry(project.root, carried.root)).toEqual({
      entry: path.join(project.packageDir, 'cli.js'),
      packageName: 'sherlo',
      version: '2.0.2',
      source: 'project',
    });
  });

  it('falls back to the carried copy when the project installed nothing', () => {
    const carried = carriedCliRoot('2.0.2');

    expect(resolveCliEntry(emptyDirectory(), carried.root)).toEqual({
      entry: path.join(carried.packageDir, 'cli.js'),
      packageName: 'sherlo',
      version: '2.0.2',
      source: 'carried',
    });
  });

  it('never climbs out of the carried root to find some other checkout install', () => {
    // The carried copy is an EXACT path, not a node resolution: an upward walk from
    // the action's own directory could find the node_modules of whatever checkout
    // the action happens to sit inside, which is not a copy the action carries.
    const outer = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './cli.js' },
    });
    const nestedCarriedRoot = path.join(outer.root, 'actions', 'carried-cli');
    fs.mkdirSync(nestedCarriedRoot, { recursive: true });

    expect(() => resolveCliEntry(emptyDirectory(), nestedCarriedRoot)).toThrow(
      /No Sherlo CLI found/
    );
  });

  it('fails naming BOTH places it looked when neither has a CLI', () => {
    const workingDirectory = emptyDirectory();
    const carried = noCarriedCli();

    const run = () => resolveCliEntry(workingDirectory, carried);

    expect(run).toThrow(/No Sherlo CLI found/);
    expect(run).toThrow(new RegExp(workingDirectory));
    expect(run).toThrow(new RegExp(carried));
    expect(run).toThrow(/npm install --save-dev sherlo/);
  });

  it('fails when the manifest points at a script that is not on disk', () => {
    const { root } = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2', bin: './missing.js' },
      binFileName: 'cli.js',
    });

    expect(() => resolveCliEntry(root, carriedCliRoot().root)).toThrow(/missing\.js/);
  });

  it('fails when the installed package declares no bin at all', () => {
    const { root } = rootWithCliInstalled({
      manifest: { name: 'sherlo', version: '2.0.2' },
    });

    expect(() => resolveCliEntry(root, carriedCliRoot().root)).toThrow(/declares no `bin`/);
  });
});
