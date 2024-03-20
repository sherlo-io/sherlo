import { mkdir } from '../../nativeModule';
import { LogFn } from '../types';

const create = (path: string, log: LogFn) => async (): Promise<void> => {
  await mkdir(path).catch(() => {
    log('create:bridgeDirectoryExists', { path });
  });
};

export default create;
