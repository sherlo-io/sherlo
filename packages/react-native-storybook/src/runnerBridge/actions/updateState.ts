import { writeFile } from '../../nativeModule';
import { getGlobalStates } from '../../utils';
import { LogFn, SendFn, RunnerState } from '../types';

const updateState =
  (path: string, send: SendFn, log: LogFn) =>
  async (state: RunnerState, onlyFile?: boolean): Promise<void> => {
    if (!getGlobalStates().isIntegrationTest) {
      const stateString = JSON.stringify(state);

      await Promise.all([
        writeFile(path, stateString),
        ...(onlyFile ? [] : [send({ action: 'UPDATE_STATE', ...state })]),
      ]);

      log('updateState', { state });
    }
  };

export default updateState;
