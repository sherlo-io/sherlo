import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const shell = vi.hoisted(() => ({ run: vi.fn() }));
const spinnerSaid = vi.hoisted(() => ({ done: [] as string[] }));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = {
      start: () => spinner,
      fail: () => spinner,
      succeed: (text: string) => {
        spinnerSaid.done.push(text);
        return spinner;
      },
    };
    return spinner;
  },
}));
vi.mock('../../../../helpers/runShellCommand', () => ({ default: shell.run }));

import installPods from '../installPods';

beforeEach(() => {
  projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'install-pods-'));
  spinnerSaid.done = [];
  shell.run.mockReset();
  shell.run.mockResolvedValue('');
});

afterEach(() => {
  fs.rmSync(projectRoot.path, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it('installs pods through bundle exec when a Gemfile names cocoapods', async () => {
  fs.writeFileSync(path.join(projectRoot.path, 'Gemfile'), "gem 'cocoapods', '1.15.2'\n");
  vi.stubEnv('SHERLO_BUILD', '1');

  await installPods();

  const call = shell.run.mock.calls[0][0];
  expect(call.command).toBe('cd ios && bundle exec pod install');
  expect(call.env.SHERLO_BUILD).toBeUndefined();
});

it('installs pods with plain pod install when no Gemfile names cocoapods', async () => {
  await installPods();

  expect(shell.run.mock.calls[0][0].command).toBe('cd ios && pod install');
});

function writeFile(relativePath: string, content: string) {
  const filePath = path.join(projectRoot.path, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

it('setup skips pod install and says Pods are current when Sherlo is linked into any configuration', async () => {
  const xcconfig = 'ios/Pods/Target Support Files/Pods-App/Pods-App.dev.release.xcconfig';
  writeFile('ios/Podfile.lock', 'PODS: one\n');
  writeFile('ios/Pods/Manifest.lock', 'PODS: one\n');

  // The pods match the lockfile, but Sherlo is linked into no configuration: the install runs.
  writeFile(xcconfig, 'OTHER_LDFLAGS = -l"other"\n');
  await installPods();
  expect(shell.run).toHaveBeenCalledTimes(1);

  // Linked into one of the app's own configurations: it is skipped.
  shell.run.mockClear();
  spinnerSaid.done = [];
  writeFile(xcconfig, 'OTHER_LDFLAGS = -l"sherlo-react-native-storybook"\n');
  await installPods();
  expect(shell.run).not.toHaveBeenCalled();
  expect(spinnerSaid.done).toEqual(['Pods are current, install skipped']);
});

it('a failed pod install in setup names its command and the first error line', async () => {
  shell.run.mockRejectedValue(
    Object.assign(new Error('failed'), {
      exitCode: 1,
      stderr: 'Resolving dependencies\n[!] Unable to find a specification for `Foo`\nmore\n',
    })
  );

  await expect(installPods()).rejects.toThrow(
    /The pod install step failed: `cd ios && pod install` exited with 1\.\n.*\[!\] Unable to find a specification for `Foo`/
  );
});
