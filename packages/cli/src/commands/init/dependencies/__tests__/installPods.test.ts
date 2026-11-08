import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const shell = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = { start: () => spinner, fail: () => spinner, succeed: () => spinner };
    return spinner;
  },
}));
vi.mock('../../../../helpers/runShellCommand', () => ({ default: shell.run }));

import installPods from '../installPods';

beforeEach(() => {
  projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'install-pods-'));
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
