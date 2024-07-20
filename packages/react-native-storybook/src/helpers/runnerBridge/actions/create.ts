import SherloModule from '../../SherloModule';
import { LogFn } from '../types';

function create(path: string, log: LogFn): () => Promise<void> {
  return async function (): Promise<void> {
    await SherloModule.mkdir(path).catch(() => {
      log('create:bridgeDirectoryExists', { path });
    });
  };
}

export default create;
