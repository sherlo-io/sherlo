import { getGlobalStates } from '../../../utils';
import SherloModule from '../../SherloModule';
import { LogFn, RunnerState } from '../types';

function getState(path: string, log: LogFn): () => Promise<RunnerState> {
  return async function (): Promise<RunnerState> {
    if (getGlobalStates().testConfig) {
      throw new Error("We're not using cached state in render test mode");
    }

    const stateFile = await SherloModule.readFile(path);
    const state = JSON.parse(stateFile) as RunnerState;

    log('getState:response', { state });

    return state;
  };
}

export default getState;
