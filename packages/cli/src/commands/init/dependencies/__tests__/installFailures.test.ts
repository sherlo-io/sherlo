import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({
  addPackage: vi.fn(),
  installPods: vi.fn(),
}));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = { start: () => spinner, fail: () => spinner, succeed: () => spinner };
    return spinner;
  },
}));
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));

import installPods from '../installPods';
import installSherlo from '../installSherlo';

const LAST_LINES_SHOWN = 15;

function numberedLines(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

async function messageOfRefusal(install: () => Promise<void>): Promise<string> {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await install();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('The install was expected to be refused');
}

beforeEach(async () => {
  projectRoot.path = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sherlo-install-test-'));
  await fs.promises.writeFile(path.join(projectRoot.path, 'package.json'), '{}', 'utf-8');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.promises.rm(projectRoot.path, { recursive: true, force: true });
});

describe('a failed install', () => {
  it('a failed pod install shows the last lines the command printed under the refusal', async () => {
    workstationAnswers.installPods.mockRejectedValue(
      Object.assign(new Error('Command failed'), { stderr: numberedLines(40), stdout: 'unused' })
    );

    const message = await messageOfRefusal(installPods);

    expect(message).toContain('Failed to install Pods automatically');
    expect(message).toContain('line 40');
    expect(message).toContain(`line ${40 - LAST_LINES_SHOWN + 1}`);
    expect(message).not.toContain(`line ${40 - LAST_LINES_SHOWN}\n`);
    expect(message).not.toContain('unused');
    expect(message.indexOf('line 40')).toBeGreaterThan(
      message.indexOf('Failed to install Pods automatically')
    );
  });

  it('a failed SDK install shows the last lines the command printed under the refusal', async () => {
    workstationAnswers.addPackage.mockRejectedValue(
      Object.assign(new Error('Command failed'), { stderr: '', stdout: numberedLines(40) })
    );

    const message = await messageOfRefusal(installSherlo);

    expect(message).toContain('Failed to install Sherlo automatically');
    expect(message).toContain('line 40');
    expect(message).toContain(`line ${40 - LAST_LINES_SHOWN + 1}`);
    expect(message).not.toContain(`line ${40 - LAST_LINES_SHOWN}\n`);
    expect(message.indexOf('line 40')).toBeGreaterThan(
      message.indexOf('Failed to install Sherlo automatically')
    );
  });
});
