import sherloModule from '../../sherloModule';
import { getGlobalStates, isObject } from '../../utils';
import { LogFn } from '../types';
import { verifySignature } from '../utils';

const { readFile } = sherloModule;

// TODO: change name to getDeviceConfig? + return type fix
const getConfig = (path: string, log?: LogFn) => async (): Promise<any> => {
  const { testConfig } = getGlobalStates();

  if (testConfig) {
    return testConfig;
  }

  // TODO: add comment to explain replaceAll code
  const configString = (await readFile(path)).replaceAll('\n', '');
  const signature = (await readFile(`${path}.sig`)).replaceAll('\n', '');

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
