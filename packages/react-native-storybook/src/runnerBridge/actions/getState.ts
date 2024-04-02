import sherloModule from '../../sherloModule';
import { getGlobalStates } from '../../utils';
import { LogFn, RunnerState } from '../types';

const { readFile } = sherloModule;

const getState = (path: string, log: LogFn) => async (): Promise<RunnerState> => {
  if (getGlobalStates().testConfig) {
    throw new Error("We're not using cached state in render test mode");
  }

  const stateFile = await readFile(path);
  const state = JSON.parse(stateFile) as RunnerState;

  log('getState:response', { state });

  return state;
};

export default getState;
