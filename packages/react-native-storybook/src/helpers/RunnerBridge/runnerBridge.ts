import { create, getLastState, getState, log, send } from './actions';
import { GetLastStateFn, LogFn, RunnerState, SendFn } from './types';

const logPath = 'log.sherlo';
const statePath = 'state.sherlo';
const protocolPath = 'protocol.sherlo';
const snapshotsDirectory = 'snapshots';

export type RunnerBridge = {
  create: () => Promise<void>;
  getState: () => Promise<RunnerState>;
  getLastState: GetLastStateFn;
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(logPath);
const sendFn: SendFn = send(protocolPath, logFn);

const runnerBridge: RunnerBridge = {
  create: create(snapshotsDirectory, logFn),
  getState: getState(statePath, logFn),
  getLastState: getLastState(protocolPath, logFn),
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
