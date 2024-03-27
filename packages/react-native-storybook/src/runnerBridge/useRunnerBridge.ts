import { Mode } from '../hoc/withStorybook/ModeProvider';
import { create, getConfig, getState, log, send } from './actions';
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
}

const useRunnerBridge = (mode: Mode | undefined): RunnerBridge => {
  const logFn = mode === 'testing' ? log(logPath) : () => {};
  const sendFn = send(protocolPath, logFn);

  return {
    create: create(snapshotsDirectory, logFn),
    getConfig: getConfig(configPath, logFn),
    getState: getState(statePath, logFn),
    log: logFn,
    send: sendFn,
  };
};

export default useRunnerBridge;
