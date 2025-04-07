import { DOCS_LINK } from '../../../constants';
import { logInfo } from '../../../helpers';

function printDefaultDevicesInfo(): void {
  logInfo({
    message: 'You can adjust testing devices to match your needs',
    learnMoreLink: DOCS_LINK.configDevices,
  });
}

export default printDefaultDevicesInfo;
