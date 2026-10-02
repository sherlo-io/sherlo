import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../config';

vi.mock('../../helpers/trackProgress', () => ({
  default: vi.fn(async ({ sessionId }) => ({ sessionId })),
}));

const NO_TOKEN_WARNING_LINES = [
  '`npx sherlo test` needs a project token, and sherlo.config.json has none yet',
  'Get one at https://app.sherlo.io, then run `npx sherlo init --token <token>` or add it as "token" in sherlo.config.json',
];

let projectDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-config-test-'));
  process.chdir(projectDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(projectDir, { recursive: true, force: true });
});

async function runConfigStep(token?: string): Promise<string> {
  const printedLines: string[] = [];
  const recordLine = (...args: unknown[]) => {
    printedLines.push(args.map(String).join(' '));
  };
  vi.spyOn(console, 'log').mockImplementation(recordLine);
  vi.spyOn(console, 'warn').mockImplementation(recordLine);

  await config({ sessionId: null, token });

  vi.restoreAllMocks();

  return printedLines.join('\n');
}

function readWrittenConfig(): { token?: string } {
  return JSON.parse(fs.readFileSync(path.join(projectDir, 'sherlo.config.json'), 'utf-8'));
}

describe('the config step of setup', () => {
  // The hint's two lines are approved copy, so they are matched exactly.
  it('with no token, writes a config file with no token and prints where to get one and how to add it', async () => {
    const printed = await runConfigStep();

    expect(readWrittenConfig().token).toBeUndefined();
    for (const line of NO_TOKEN_WARNING_LINES) expect(printed).toContain(line);

    const createdAt = printed.indexOf('Created: sherlo.config.json');
    const warningAt = printed.indexOf(NO_TOKEN_WARNING_LINES[0]);
    const devicesInfoAt = printed.indexOf('You can adjust testing devices');
    expect(createdAt).toBeGreaterThanOrEqual(0);
    expect(warningAt).toBeGreaterThan(createdAt);
    expect(devicesInfoAt).toBeGreaterThan(warningAt);
  });

  it('prints nothing about a token when one is given', async () => {
    const printed = await runConfigStep('some-token');

    expect(readWrittenConfig().token).toBe('some-token');
    expect(printed).not.toContain(NO_TOKEN_WARNING_LINES[0]);
  });

  it('prints nothing new when a file that already holds a token is re-run with no token', async () => {
    await runConfigStep('some-token');

    const printed = await runConfigStep();

    expect(readWrittenConfig().token).toBe('some-token');
    expect(printed).toContain('Already created: sherlo.config.json');
    expect(printed).not.toContain(NO_TOKEN_WARNING_LINES[0]);
  });

  it('warns again when an existing file holds no token and none is given', async () => {
    await runConfigStep();

    const printed = await runConfigStep();

    expect(printed).toContain('Already created: sherlo.config.json');
    expect(printed).toContain(NO_TOKEN_WARNING_LINES[0]);
  });
});
