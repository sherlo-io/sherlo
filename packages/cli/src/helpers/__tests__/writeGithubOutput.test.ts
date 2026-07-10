/**
 * Tests for writeGithubOutput (SHERLO-1692): appends `key=value` lines to the
 * file named by $GITHUB_OUTPUT, is a no-op when the env var is unset, and never
 * breaks the line format on multi-line values.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import writeGithubOutput from '../writeGithubOutput';

let outputFile: string;
const originalEnv = process.env.GITHUB_OUTPUT;

beforeEach(() => {
  outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-output-')), 'output.txt');
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.GITHUB_OUTPUT;
  } else {
    process.env.GITHUB_OUTPUT = originalEnv;
  }
});

describe('writeGithubOutput', () => {
  it('appends one key=value line per entry', () => {
    process.env.GITHUB_OUTPUT = outputFile;

    writeGithubOutput({ mode: 'fast', reason: 'matches base' });

    const contents = fs.readFileSync(outputFile, 'utf8');
    expect(contents).toBe('mode=fast\nreason=matches base\n');
  });

  it('appends across multiple calls rather than overwriting', () => {
    process.env.GITHUB_OUTPUT = outputFile;

    writeGithubOutput({ mode: 'full' });
    writeGithubOutput({ baseFingerprint: 'FP1' });

    const contents = fs.readFileSync(outputFile, 'utf8');
    expect(contents).toBe('mode=full\nbaseFingerprint=FP1\n');
  });

  it('flattens newlines in values so the key=value format never breaks', () => {
    process.env.GITHUB_OUTPUT = outputFile;

    writeGithubOutput({ reason: 'line one\nline two' });

    const contents = fs.readFileSync(outputFile, 'utf8');
    expect(contents).toBe('reason=line one line two\n');
  });

  it('is a no-op when GITHUB_OUTPUT is unset', () => {
    delete process.env.GITHUB_OUTPUT;

    // Must not throw and must not create any file.
    expect(() => writeGithubOutput({ mode: 'fast' })).not.toThrow();
    expect(fs.existsSync(outputFile)).toBe(false);
  });
});
