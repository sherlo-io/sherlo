import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../../constants';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({ addPackage: vi.fn(), sherloVersion: () => '3.0.1' }));

vi.mock('../../../../helpers/getCwd', () => ({ default: () => projectRoot.path }));
vi.mock('../../../../helpers/reporting', () => ({ default: { captureException: vi.fn() } }));
vi.mock('../../../../helpers/spinner', () => ({
  default: () => {
    const spinner = { start: () => spinner, fail: () => spinner, stop: () => spinner };
    return spinner;
  },
}));
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));

import installSherlo, { sherloSdkPackageSpec, sherloSdkVersionRange } from '../installSherlo';

const PKG = SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME;

describe('installSherlo packageSpec derivation', () => {
  it('uses file: protocol when SHERLO_SDK_PATH ends with .tgz', () => {
    const spec = sherloSdkPackageSpec('/tmp/sdk-1.0.0.tgz', undefined, '3.0.1');
    expect(spec).toBe(`${PKG}@file:/tmp/sdk-1.0.0.tgz`);
  });

  it('uses portal: protocol when SHERLO_SDK_PATH is a directory', () => {
    const spec = sherloSdkPackageSpec('/path/to/sdk-dir', undefined, '3.0.1');
    expect(spec).toBe(`${PKG}@portal:/path/to/sdk-dir`);
  });

  it('uses npm version when only SHERLO_SDK_VERSION is set', () => {
    const spec = sherloSdkPackageSpec(undefined, '1.2.3', '3.0.1');
    expect(spec).toBe(`${PKG}@1.2.3`);
  });

  it('SHERLO_SDK_PATH takes precedence over SHERLO_SDK_VERSION', () => {
    const spec = sherloSdkPackageSpec('/tmp/sdk.tgz', '9.9.9', '3.0.1');
    expect(spec).toBe(`${PKG}@file:/tmp/sdk.tgz`);
  });
});

describe('the SDK versions a CLI version asks for', () => {
  it('a released CLI asks for a range on its major version', () => {
    expect(sherloSdkVersionRange('3.0.1')).toBe('^3');
    expect(sherloSdkVersionRange('12.4.0')).toBe('^12');
  });

  it('a prerelease CLI asks for its exact version, which a ^ range never matches', () => {
    expect(sherloSdkVersionRange('3.0.0-alpha.0')).toBe('3.0.0-alpha.0');
    expect(sherloSdkVersionRange('3.1.0-beta.2')).toBe('3.1.0-beta.2');
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

  it("a new install by CLI 3.0.1 asks for ^3, never its exact version", async () => {
    fs.writeFileSync(
      path.join(projectRoot.path, 'package.json'),
      JSON.stringify({ devDependencies: { typescript: '^5.0.0' } })
    );

    await installSherlo();

    expect(workstationAnswers.addPackage).toHaveBeenCalledTimes(1);
    const [{ packageSpec, command }] = workstationAnswers.addPackage.mock.calls[0];
    expect(packageSpec).toBe(`${PKG}@^3`);
    expect(command).toBe(`npm i ${PKG}@^3`);
  });
});
