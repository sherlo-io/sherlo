import { DEVICES } from '@sherlo/shared';
import { printMessage } from '../helpers';
import { DEFAULT_DEVICES } from './constants';

function printDefaultDevicesMessage(): void {
  printMessage({
    type: 'success',
    message: `Added default devices: ${DEFAULT_DEVICES.map(
      ({ id }) => DEVICES[id].displayName
    ).join(', ')}`,
  });
}

export default printDefaultDevicesMessage;
