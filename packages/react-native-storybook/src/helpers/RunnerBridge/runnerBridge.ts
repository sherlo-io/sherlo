import { create, getConfig, getState, log, send } from './actions';
import { Config, LogFn, RunnerState, SendFn } from './types';

const configPath = 'config.sherlo';
const logPath = 'log.sherlo';
const statePath = 'state.sherlo';
const protocolPath = 'protocol.sherlo';
const snapshotsDirectory = 'snapshots';

export type RunnerBridge = {
  create: () => Promise<void>;
  getConfig: () => Promise<Config>;
  getState: () => Promise<RunnerState>;
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(logPath);
const sendFn: SendFn = send(protocolPath, logFn);

const runnerBridge: RunnerBridge = {
  create: create(snapshotsDirectory, logFn),
  getConfig: getConfig(configPath, logFn),
  getState: getState(statePath, logFn),
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
