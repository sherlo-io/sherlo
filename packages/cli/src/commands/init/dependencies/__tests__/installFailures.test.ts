import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({
  addPackage: vi.fn(),
  installPods: vi.fn(),
  podsAreCurrent: () => false,
}));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = {
      start: () => spinner,
      stop: () => spinner,
      fail: () => spinner,
      succeed: () => spinner,
    };
    return spinner;
  },
}));
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));

import installPods from '../installPods';
import installSherlo, { storybookPinsExactPeers } from '../installSherlo';

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
      Object.assign(new Error('Command failed'), { stderr: numberedLines(40), stdout: '' })
    );

    const message = await messageOfRefusal(installPods);

    expect(message).toContain('Failed to install Pods automatically');
    expect(message).toContain('line 40');
    expect(message).toContain(`line ${40 - LAST_LINES_SHOWN + 1}`);
    expect(message).not.toContain(`line ${40 - LAST_LINES_SHOWN}\n`);
    expect(message.indexOf('line 40')).toBeGreaterThan(
      message.indexOf('Failed to install Pods automatically')
    );
  });

  it('a failed pod install shows the last lines of both streams, so a warning on one cannot hide the cause on the other', async () => {
    const warning = 'Ignoring ffi-1.15.5 because its extensions are not built.';
    const cause = '[!] CocoaPods could not find compatible versions for pod "hermes-engine"';
    workstationAnswers.installPods.mockRejectedValue(
      Object.assign(new Error('Command failed'), {
        stdout: `Analyzing dependencies\n${cause}`,
        stderr: warning,
      })
    );

    const message = await messageOfRefusal(installPods);

    expect(message).toContain(cause);
    expect(message).toContain(warning);
    expect(message.indexOf(cause)).toBeLessThan(message.indexOf(warning));
  });

  it('a failed SDK install with no line marked as an error shows its last 20 lines and names the log', async () => {
    const UNMARKED_LINES_SHOWN = 20;
    const logFile = path.join(os.tmpdir(), 'sherlo-init-a1B2c3', 'install.log');
    workstationAnswers.addPackage.mockRejectedValue(
      Object.assign(new Error('Command failed'), { output: numberedLines(40), logFile })
    );

    const message = await messageOfRefusal(installSherlo);

    expect(message).toContain("Sherlo couldn't be installed");
    expect(message).toContain('line 40');
    expect(message).toContain(`line ${40 - UNMARKED_LINES_SHOWN + 1}`);
    expect(message).not.toContain(`line ${40 - UNMARKED_LINES_SHOWN}\n`);
    expect(message.indexOf('line 40')).toBeGreaterThan(
      message.indexOf("Sherlo couldn't be installed")
    );
    expect(message).toContain(`Full output: ${logFile}`);
  });
});

describe('npm stopping on the exact versions some Storybook releases demand', () => {
  const ERESOLVE_OUTPUT = [
    'npm error code ERESOLVE',
    'npm error ERESOLVE could not resolve',
    'npm error Found: react-native-safe-area-context@5.11.1',
    'npm error peer react-native-safe-area-context@"5.8.0" from @storybook/react-native@10.6.1',
  ].join('\n');

  async function installStorybook(version: string): Promise<void> {
    const folder = path.join(projectRoot.path, 'node_modules', '@storybook', 'react-native');
    await fs.promises.mkdir(folder, { recursive: true });
    await fs.promises.writeFile(
      path.join(folder, 'package.json'),
      JSON.stringify({ name: '@storybook/react-native', version }),
      'utf-8'
    );
  }

  it('Storybook 10.6.1: the refusal says to upgrade Storybook, not to install Sherlo by hand', async () => {
    await installStorybook('10.6.1');
    workstationAnswers.addPackage.mockRejectedValue(
      Object.assign(new Error('Command failed'), { output: ERESOLVE_OUTPUT, logFile: 'log' })
    );

    const message = await messageOfRefusal(installSherlo);

    expect(message).toContain(
      'Storybook 10.6.1 demands exact versions of react-native-safe-area-context and react-native-reanimated'
    );
    expect(message).toContain('Upgrade Storybook:');
    expect(message).toContain('npm i storybook@^10');
    expect(message).not.toContain('npm install @sherlo/react-native-storybook');
  });

  it('Storybook 10.6.2 pins nothing: the same failure is the usual install refusal', async () => {
    await installStorybook('10.6.2');
    workstationAnswers.addPackage.mockRejectedValue(
      Object.assign(new Error('Command failed'), { output: ERESOLVE_OUTPUT, logFile: 'log' })
    );

    const message = await messageOfRefusal(installSherlo);

    expect(message).toContain("Sherlo couldn't be installed");
  });

  it('the pinning releases are 10.5.2 to 10.6.1', () => {
    expect(
      ['10.5.1', '10.5.2', '10.6.0', '10.6.1', '10.6.2', '9.6.1', '11.5.2'].filter(
        storybookPinsExactPeers
      )
    ).toEqual(['10.5.2', '10.6.0', '10.6.1']);
  });
});
