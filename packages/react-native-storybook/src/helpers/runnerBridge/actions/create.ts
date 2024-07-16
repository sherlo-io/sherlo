import sherloModule from './sherloModule';
import { LogFn } from '../types';

function create(path: string, log: LogFn): () => Promise<void> {
  return async function (): Promise<void> {
    await sherloModule.mkdir(path).catch(() => {
      log('create:bridgeDirectoryExists', { path });
    });
  };
}

export default create;
