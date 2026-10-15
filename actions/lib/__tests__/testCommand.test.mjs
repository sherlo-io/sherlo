/**
 * Tests for the argument list the action hands `sherlo test`: one platform per job,
 * and no token on the command line.
 */
import { describe, expect, it } from 'vitest';
import { buildTestArgs } from '../testCommand.mjs';

describe('buildTestArgs', () => {
  it('passes the platform input as --platform', () => {
    expect(
      buildTestArgs({ platform: 'ios', config: 'sherlo.config.json', projectRoot: '.' })
    ).toEqual([
      'test',
      '--platform',
      'ios',
      '--config',
      'sherlo.config.json',
      '--projectRoot',
      '.',
    ]);
  });

  it('never passes --token', () => {
    expect(buildTestArgs({ platform: 'android', token: 'T' })).not.toContain('--token');
    expect(buildTestArgs({ platform: 'android', token: 'T' })).not.toContain('T');
  });

  it('omits a blank input entirely, so the CLI keeps its own default', () => {
    // An unset GitHub Action input arrives as "" - it must not become `--platform ""`.
    expect(buildTestArgs({ platform: '', config: '', projectRoot: '  ' })).toEqual(['test']);
  });

  it('hands the CLI a prebuilt bundle directory, so the job runs no bundler', () => {
    expect(buildTestArgs({ bundleDir: 'sherlo-bundle' })).toEqual([
      'test',
      '--bundle-dir',
      'sherlo-bundle',
    ]);
  });

  it('emits a bundle directory for later jobs to consume', () => {
    expect(buildTestArgs({ emitBundleDir: 'sherlo-bundle' })).toEqual([
      'test',
      '--emit-bundle-dir',
      'sherlo-bundle',
    ]);
  });
});
