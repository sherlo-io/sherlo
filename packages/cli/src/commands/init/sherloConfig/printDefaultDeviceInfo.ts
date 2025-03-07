import { DEVICES } from '@sherlo/shared';
import { DOCS_LINK } from '../../../constants';
import { logInfo } from '../../../helpers';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICE } from './constants';

function printDefaultDeviceInfo(): void {
  const { displayName, os } = DEVICES[DEFAULT_DEVICE.id];
  const osInfo = (os === 'ios' ? 'iOS' : 'Android') + ' ' + DEFAULT_DEVICE.osVersion;

  printMessage({
    type: 'success',
    message: `Added default device: ${displayName} (${osInfo})`,
  });

  console.log();

  logInfo({
    message: 'You can adjust testing devices to match your needs',
    learnMoreLink: DOCS_LINK.configDevices,
  });
}

export default printDefaultDeviceInfo;
