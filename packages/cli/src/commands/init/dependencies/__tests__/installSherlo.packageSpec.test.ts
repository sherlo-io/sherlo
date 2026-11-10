import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version as cliVersion } from '../../../../../package.json';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../../constants';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({ addPackage: vi.fn() }));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = { start: () => spinner, fail: () => spinner, succeed: () => spinner };
    return spinner;
  },
}));
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));

import installSherlo, { sherloSdkPackageSpec } from '../installSherlo';

const PKG = SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;

describe('installSherlo packageSpec derivation', () => {
  it('uses file: protocol when SHERLO_SDK_PATH ends with .tgz', () => {
    const spec = sherloSdkPackageSpec('/tmp/sdk-1.0.0.tgz', undefined);
    expect(spec).toBe(`${PKG}@file:/tmp/sdk-1.0.0.tgz`);
  });

  it('uses portal: protocol when SHERLO_SDK_PATH is a directory', () => {
    const spec = sherloSdkPackageSpec('/path/to/sdk-dir', undefined);
    expect(spec).toBe(`${PKG}@portal:/path/to/sdk-dir`);
  });

  it('uses npm version when only SHERLO_SDK_VERSION is set', () => {
    const spec = sherloSdkPackageSpec(undefined, '1.2.3');
    expect(spec).toBe(`${PKG}@1.2.3`);
  });

  it('SHERLO_SDK_PATH takes precedence over SHERLO_SDK_VERSION', () => {
    const spec = sherloSdkPackageSpec('/tmp/sdk.tgz', '9.9.9');
    expect(spec).toBe(`${PKG}@file:/tmp/sdk.tgz`);
  });
});

describe('installSherlo into an app with no SDK', () => {
  beforeEach(() => {
    vi.stubEnv('SHERLO_SDK_PATH', undefined);
    vi.stubEnv('SHERLO_SDK_VERSION', undefined);
    workstationAnswers.addPackage.mockReset();
    projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'install-sherlo-new-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(projectRoot.path, { recursive: true, force: true });
  });

  it('a new install pins the SDK version this CLI ships with and adds it to dependencies', async () => {
    fs.writeFileSync(
      path.join(projectRoot.path, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '^5.0.0' } })
    );

    await installSherlo();

    expect(workstationAnswers.addPackage).toHaveBeenCalledTimes(1);
    const [{ packageSpec, command }] = workstationAnswers.addPackage.mock.calls[0];
    expect(packageSpec).toBe(`${PKG}@${cliVersion}`);
    expect(command).toBe(`npm i ${PKG}@${cliVersion}`);
  });
});
