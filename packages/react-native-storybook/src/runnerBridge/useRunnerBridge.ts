import { Mode } from '../hoc/withStorybook/ModeProvider';
import { create, getConfig, getState, log, send, updateState } from './actions';
import { Config, LogFn, RunnerState, SendFn } from './types';

export const configPath = 'config.sherlo';

const logPath = 'log.sherlo';
const statePath = 'state.sherlo';
const protocolPath = 'protocol.sherlo';
const snapshotsDirectory = 'snapshots';

export interface RunnerBridge {
  create: () => Promise<void>;
  getConfig: () => Promise<Config>;
  getState: () => Promise<RunnerState>;
  log: LogFn;
  send: SendFn;
  updateState: (state: RunnerState, onlyFile?: boolean) => Promise<void>;
}

const useRunnerBridge = (mode: Mode | undefined): RunnerBridge => {
  const logFn = log(logPath, mode === 'testing');
  const sendFn = send(protocolPath, logFn);

  return {
    create: create(snapshotsDirectory, logFn),
    getConfig: getConfig(configPath, logFn),
    getState: getState(statePath, logFn),
    log: logFn,
    send: sendFn,
    updateState: updateState(statePath, sendFn, logFn),
  };
};

export default useRunnerBridge;
