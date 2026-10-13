/**
 * Tests for the argument list the action hands the ONE verb.
 *
 * The road is chosen by the FLAGS: no build paths asks the routing question,
 * build paths run a full test that registers a fresh base. So which flags reach
 * the CLI is the whole behaviour of the action's input surface.
 */
import { describe, expect, it } from 'vitest';
import { buildTestArgs } from '../testCommand.mjs';

describe('buildTestArgs', () => {
  it('asks the routing question when no build path is given', () => {
    expect(buildTestArgs({ token: 'T', config: 'sherlo.config.json', projectRoot: '.' })).toEqual([
      'test',
      '--token',
      'T',
      '--config',
      'sherlo.config.json',
      '--projectRoot',
      '.',
    ]);
  });

  it('runs the standard road when build paths are given', () => {
    expect(
      buildTestArgs({
        token: 'T',
        config: 'sherlo.config.json',
        projectRoot: '.',
        android: 'android.apk',
        ios: 'ios.tar.gz',
      })
    ).toEqual([
      'test',
      '--token',
      'T',
      '--config',
      'sherlo.config.json',
      '--projectRoot',
      '.',
      '--android',
      'android.apk',
      '--ios',
      'ios.tar.gz',
    ]);
  });

  it('passes one platform on its own', () => {
    expect(buildTestArgs({ token: 'T', android: 'android.apk' })).toEqual([
      'test',
      '--token',
      'T',
      '--android',
      'android.apk',
    ]);
  });

  it('omits a blank input entirely, so the CLI keeps its own default', () => {
    // An unset GitHub Action input arrives as "" - it must not become `--ios ""`.
    expect(
      buildTestArgs({ token: 'T', config: '', projectRoot: '  ', android: '', ios: '' })
    ).toEqual(['test', '--token', 'T']);
  });

  it('hands the CLI a prebuilt bundle directory, so the job runs no bundler', () => {
    expect(buildTestArgs({ token: 'T', bundleDir: 'sherlo-bundle' })).toEqual([
      'test',
      '--token',
      'T',
      '--bundle-dir',
      'sherlo-bundle',
    ]);
  });

  it('emits a bundle directory for later jobs to consume', () => {
    expect(buildTestArgs({ token: 'T', emitBundleDir: 'sherlo-bundle' })).toEqual([
      'test',
      '--token',
      'T',
      '--emit-bundle-dir',
      'sherlo-bundle',
    ]);
  });

  it('refuses to run without a token, naming the input to set', () => {
    expect(() => buildTestArgs({ token: '' })).toThrow(/secrets.SHERLO_TOKEN/);
  });
});
