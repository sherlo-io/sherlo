import { getGlobalStates, isObject } from '../../../utils';
import SherloModule from '../../SherloModule';
import { verifySignature } from '../utils';
import { LogFn } from '../types';

// TODO: change name to getDeviceConfig? + return type fix
function getConfig(path: string, log?: LogFn): () => Promise<any> {
  return async function (): Promise<any> {
    const { testConfig } = getGlobalStates();

    if (testConfig) {
      return testConfig;
    }

    // TODO: add comment to explain replaceAll code
    const configString = (await SherloModule.readFile(path)).replaceAll('\n', '');
    const signature = (await SherloModule.readFile(`${path}.sig`)).replaceAll('\n', '');

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
}

export default getConfig;
