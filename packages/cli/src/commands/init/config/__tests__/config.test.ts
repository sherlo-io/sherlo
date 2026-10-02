import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import config from '../config';

vi.mock('../../helpers/trackProgress', () => ({
  default: vi.fn(async ({ sessionId }) => ({ sessionId })),
}));

const PROJECT = 'k3j9x2ab/4';
const OTHER_PROJECT = 'k3j9x2ab/5';

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

async function runConfigStep(project: string): Promise<string> {
  const printedLines: string[] = [];
  const recordLine = (...args: unknown[]) => {
    printedLines.push(args.map(String).join(' '));
  };
  vi.spyOn(console, 'log').mockImplementation(recordLine);
  vi.spyOn(console, 'warn').mockImplementation(recordLine);

  await config({ sessionId: null, project });

  vi.restoreAllMocks();

  return printedLines.join('\n');
}

function readWrittenConfig(): { project?: string; token?: string } {
  return JSON.parse(fs.readFileSync(path.join(projectDir, 'sherlo.config.json'), 'utf-8'));
}

describe('the config step of setup', () => {
  it('writes a new config file with the project and no token, and says so before the devices pointer', async () => {
    const printed = await runConfigStep(PROJECT);

    expect(readWrittenConfig()).toMatchObject({ project: PROJECT });
    expect(readWrittenConfig().token).toBeUndefined();

    const createdAt = printed.indexOf('Created: sherlo.config.json');
    const projectAt = printed.indexOf(`Added project`);
    const devicesInfoAt = printed.indexOf('You can adjust testing devices');
    expect(createdAt).toBeGreaterThanOrEqual(0);
    expect(projectAt).toBeGreaterThan(createdAt);
    expect(devicesInfoAt).toBeGreaterThan(projectAt);
    expect(printed).not.toContain('needs a project token');
  });

  it('writes the new project over the old one when the file already exists', async () => {
    await runConfigStep(PROJECT);

    const printed = await runConfigStep(OTHER_PROJECT);

    expect(readWrittenConfig().project).toBe(OTHER_PROJECT);
    expect(printed).toContain('Already created: sherlo.config.json');
  });
});
