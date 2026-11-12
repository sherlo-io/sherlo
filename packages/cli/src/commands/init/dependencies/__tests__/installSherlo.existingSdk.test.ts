/**
 * An SDK the app already depends on is the app's own choice - a pinned version, a tarball, a
 * workspace link - so setup leaves it where it is and installs nothing over it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME as SDK } from '../../../../constants';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({ addPackage: vi.fn() }));
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
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));

import installSherlo from '../installSherlo';

function writePackageJson(contents: object): void {
  fs.writeFileSync(path.join(projectRoot.path, 'package.json'), JSON.stringify(contents));
}

function readPackageJson(): unknown {
  return JSON.parse(fs.readFileSync(path.join(projectRoot.path, 'package.json'), 'utf-8'));
}

beforeEach(() => {
  vi.stubEnv('SHERLO_SDK_PATH', undefined);
  vi.stubEnv('SHERLO_SDK_VERSION', undefined);
  workstationAnswers.addPackage.mockReset();
  spinnerSaid.done.length = 0;
  projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'install-sherlo-existing-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot.path, { recursive: true, force: true });
});

describe('installSherlo with an SDK already installed', () => {
  it('an SDK already in dependencies is kept and setup says Sherlo is already installed', async () => {
    for (const spec of ['2.0.2', 'file:/abs/sherlo.tgz', 'link:../sdk', 'workspace:*']) {
      const packageJson = { dependencies: { [SDK]: spec } };
      writePackageJson(packageJson);
      spinnerSaid.done.length = 0;

      await installSherlo();

      expect(workstationAnswers.addPackage).not.toHaveBeenCalled();
      expect(spinnerSaid.done).toEqual(['Sherlo is already installed']);
      expect(readPackageJson()).toEqual(packageJson);
    }
  });

  it('an SDK already in devDependencies is kept where it is', async () => {
    const packageJson = { devDependencies: { [SDK]: '^1.4.0' } };
    writePackageJson(packageJson);

    await installSherlo();

    expect(workstationAnswers.addPackage).not.toHaveBeenCalled();
    expect(spinnerSaid.done).toEqual(['Sherlo is already installed']);
    expect(readPackageJson()).toEqual(packageJson);
  });
});
