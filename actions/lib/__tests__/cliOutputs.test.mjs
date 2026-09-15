/**
 * Tests for the GitHub half of the CLI's output contract.
 *
 * The CLI prints CI-agnostic `key=value` lines; this action turns them into step
 * outputs. Two things must hold, or a workflow routes on a lie:
 *
 *   1. an ANSWER and a CRASH are told apart by the OUTPUT, never by the exit code
 *      (exit 4 with `native-needed=true` is a clean answer; any non-zero exit with
 *      no key at all is a genuine tool error);
 *   2. a value can never break the `key=value` line format GitHub parses.
 */
import { describe, expect, it } from 'vitest';
import {
  EXIT_NATIVE_NEEDED,
  formatOutputFileLines,
  parseCliOutputs,
  readRunResult,
} from '../cliOutputs.mjs';

/** The shape of a real staged-road refusal, prose and all. */
const NATIVE_NEEDED_OUTPUT = [
  'Sherlo',
  '',
  'native-needed=true',
  'reason=ios: changed since the base build: JS engine (Hermes/JSC)',
  'base-fingerprint=BASE_FP',
  '',
  'A native build is required before this commit can be tested: ios: changed since the base build.',
  'Nothing was built and no test ran.',
].join('\n');

/** The shape of a completed fast run. */
const FAST_RUN_OUTPUT = [
  'native-needed=false',
  'reason=the registered base still matches this commit - running JS-only',
  'base-fingerprint=BASE_FP',
  '',
  'url=https://app.sherlo.io/build/7',
  '',
  'Review: https://app.sherlo.io/build/7',
].join('\n');

describe('parseCliOutputs', () => {
  it('reads every published key and ignores the prose around them', () => {
    expect(parseCliOutputs(NATIVE_NEEDED_OUTPUT)).toEqual({
      'native-needed': 'true',
      reason: 'ios: changed since the base build: JS engine (Hermes/JSC)',
      'base-fingerprint': 'BASE_FP',
    });
  });

  it('reads the run URL of a completed run', () => {
    expect(parseCliOutputs(FAST_RUN_OUTPUT).url).toBe('https://app.sherlo.io/build/7');
  });

  it('keeps the whole value when it contains an "=" of its own', () => {
    expect(parseCliOutputs('url=https://app.sherlo.io/build?index=7&team=abc').url).toBe(
      'https://app.sherlo.io/build?index=7&team=abc'
    );
  });

  it('parses a coloured line (a CLI that kept its ANSI codes)', () => {
    const coloured = `${String.fromCharCode(27)}[33mnative-needed=true${String.fromCharCode(
      27
    )}[39m`;

    expect(parseCliOutputs(coloured)['native-needed']).toBe('true');
  });

  it('publishes no key the CLI did not print - absent is not empty', () => {
    expect(parseCliOutputs('nothing machine-readable here')).toEqual({});
    expect(parseCliOutputs('some-other-tool=true')).toEqual({});
  });

  it('keeps the LAST value when a key is printed twice', () => {
    expect(parseCliOutputs('reason=first\nreason=second').reason).toBe('second');
  });
});

describe('readRunResult', () => {
  it('exit 0: the run completed and its keys are published', () => {
    const { outputs } = readRunResult({ exitCode: 0, output: FAST_RUN_OUTPUT });

    expect(outputs['native-needed']).toBe('false');
    expect(outputs.url).toBe('https://app.sherlo.io/build/7');
  });

  it('exit 0 with no keys (the standard road): still a completed run, no routing key', () => {
    const { outputs } = readRunResult({ exitCode: 0, output: 'Review: https://app.sherlo.io/b/1' });

    expect(outputs['native-needed']).toBeUndefined();
  });

  it('exit 4 with native-needed=true: an ANSWER, never a failure', () => {
    const { outputs } = readRunResult({
      exitCode: EXIT_NATIVE_NEEDED,
      output: NATIVE_NEEDED_OUTPUT,
    });

    expect(outputs['native-needed']).toBe('true');
    expect(outputs['base-fingerprint']).toBe('BASE_FP');
  });

  it('non-zero with NO key: a genuine tool error, and it says so', () => {
    expect(() => readRunResult({ exitCode: 1, output: 'Invalid token\nNeed Help?' })).toThrow(
      /without answering whether a native build is needed/
    );
  });

  it('exit 4 without the key: still a tool error - the code alone never routes', () => {
    expect(() => readRunResult({ exitCode: EXIT_NATIVE_NEEDED, output: 'boom' })).toThrow(
      /without answering/
    );
  });

  it('a key that disagrees with the exit code is refused, not published', () => {
    expect(() => readRunResult({ exitCode: 2, output: 'native-needed=false' })).toThrow(
      /native-needed=false but exited 2/
    );
  });
});

describe('formatOutputFileLines', () => {
  it('writes one key=value line per published key', () => {
    expect(formatOutputFileLines({ 'native-needed': 'false', reason: 'matches base' })).toBe(
      'native-needed=false\nreason=matches base\n'
    );
  });

  it('flattens newlines so the line format can never break', () => {
    expect(formatOutputFileLines({ reason: 'line one\nline two' })).toBe(
      'reason=line one line two\n'
    );
  });

  it('writes nothing when there is nothing to publish', () => {
    expect(formatOutputFileLines({})).toBe('');
  });

  it('never publishes a key that is not part of the contract', () => {
    expect(formatOutputFileLines({ url: 'https://x', smuggled: 'value' })).toBe('url=https://x\n');
  });
});
