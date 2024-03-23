import sherloModule from '../../sherloModule';
import { LogFn } from '../types';

const create = (path: string, log: LogFn) => async (): Promise<void> => {
  await sherloModule.mkdir(path).catch(() => {
    log('create:bridgeDirectoryExists', { path });
  });
};

export default create;
