/**
 * STEP 6 - SHERLO'S SDK. A project that already has the SDK at this tool's own version is left as
 * it is, so a rerun installs nothing; any other gets it through its own package manager.
 *
 * No `pod install`: the default device is an Android phone, and an iOS build installs its own pods.
 */
import { SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME } from '../../../constants';
import { version as cliVersion } from '../../../../package.json';
import { renderStepLine } from '../../../render/initSteps';
import installSherlo from '../dependencies/installSherlo';
import { printLines } from '../helpers';
import getPackageVersion from '../requirements/getPackageVersion';

async function sherloSdk(): Promise<void> {
  const installedVersion = getPackageVersion(SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME);

  if (installedVersion === cliVersion) {
    printLines([
      renderStepLine({
        outcome: 'already',
        name: 'Installed Sherlo',
        detail: `${SHERLO_REACT_NATIVE_STORYBOOK_PACKAGE_NAME} ${installedVersion}`,
      }),
    ]);
    return;
  }

  await installSherlo();
}

export default sherloSdk;
