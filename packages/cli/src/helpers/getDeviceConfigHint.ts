import { DEFAULT_CONFIG_FILENAME } from '../constants';

function getDeviceConfigHint(): string {
  return `Testing one platform? Remove unwanted devices from ${DEFAULT_CONFIG_FILENAME}`;
}

export default getDeviceConfigHint;
