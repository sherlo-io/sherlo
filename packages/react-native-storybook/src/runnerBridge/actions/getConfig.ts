import { getSherloModule } from '../../nativeModule';
import { getGlobalStates, isObject } from '../../utils';
import { LogFn } from '../types';
import { verifySignature } from '../utils';

const sherloModule = getSherloModule();

// TODO: change name to getDeviceConfig? + return type fix
const getConfig = (path: string, log?: LogFn) => async (): Promise<any> => {
  if (getGlobalStates().isIntegrationTest) {
    return getGlobalStates().testConfig;
  }

  // TODO: add comment to explain replaceAll code
  const configString = (await sherloModule.readFile(path)).replaceAll('\n', '');
  const signature = (await sherloModule.readFile(`${path}.sig`)).replaceAll('\n', '');

  const isSignatureValid = verifySignature(configString, signature);
  if (!isSignatureValid) {
    throw new Error('Invalid config signature');
  }

  const config = JSON.parse(configString);

  if (!isObject(config)) {
    throw new Error('Invalid config');
  }

  log?.('getConfig:response', { config });

  return config;
};

export default getConfig;
