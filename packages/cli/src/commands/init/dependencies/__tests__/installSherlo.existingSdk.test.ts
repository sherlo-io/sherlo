import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME as SDK } from '../../../../constants';

const projectRoot = vi.hoisted(() => ({ path: '' }));
const workstationAnswers = vi.hoisted(() => ({ addPackage: vi.fn() }));
const printed = vi.hoisted(() => ({ lines: [] as string[] }));
/** The SDK version in the app's node_modules; null when the app has none. */
const installedSdk = vi.hoisted(() => ({ version: null as string | null }));

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
vi.mock('../../helpers/printLines', () => ({
  default: (lines: string[]) => printed.lines.push(...lines),
}));
vi.mock('../../../../seams/workstation', () => ({ workstation: () => workstationAnswers }));
vi.mock('../../requirements/getPackageVersion', () => ({
  default: () => installedSdk.version,
}));

/** The step line setup prints, with its colours taken off. */
function printedText(): string {
  // eslint-disable-next-line no-control-regex
  return printed.lines.join('\n').replace(/\u001b\[[0-9;]*m/g, '');
}

import { version as cliVersion } from '../../../../../package.json';
import sherloSdk from '../../steps/sherloSdk';

function writePackageJson(contents: object): void {
  fs.writeFileSync(path.join(projectRoot.path, 'package.json'), JSON.stringify(contents));
}

beforeEach(() => {
  vi.stubEnv('SHERLO_SDK_PATH', undefined);
  vi.stubEnv('SHERLO_SDK_VERSION', undefined);
  workstationAnswers.addPackage.mockReset();
  printed.lines.length = 0;
  installedSdk.version = null;
  projectRoot.path = fs.mkdtempSync(path.join(os.tmpdir(), 'install-sherlo-existing-'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(projectRoot.path, { recursive: true, force: true });
});

describe('the Sherlo step by what the app already has', () => {
  it("no SDK yet: installs this tool's version and says Installed", async () => {
    writePackageJson({ dependencies: {} });

    await sherloSdk();

    expect(workstationAnswers.addPackage).toHaveBeenCalledOnce();
    expect(printedText()).toContain(`Installed Sherlo`);
    expect(printedText()).toContain(`${SDK} ${cliVersion}`);
    expect(printedText()).not.toContain('already done');
  });

  it("the SDK at this tool's version: changes nothing and says already done", async () => {
    writePackageJson({ dependencies: { [SDK]: cliVersion } });
    installedSdk.version = cliVersion;

    await sherloSdk();

    expect(workstationAnswers.addPackage).not.toHaveBeenCalled();
    expect(printedText()).toContain(`Installed Sherlo`);
    expect(printedText()).toContain(`${SDK} ${cliVersion}`);
    expect(printedText()).toContain('(already done)');
  });

  it("the SDK at another version: installs this tool's version and says Updated", async () => {
    writePackageJson({ devDependencies: { [SDK]: '2.0.2' } });
    installedSdk.version = '2.0.2';

    await sherloSdk();

    expect(workstationAnswers.addPackage).toHaveBeenCalledOnce();
    expect(printedText()).toContain('Updated Sherlo');
    expect(printedText()).toContain(`${SDK} ${cliVersion}`);
    expect(printedText()).not.toContain('already done');
  });
});
