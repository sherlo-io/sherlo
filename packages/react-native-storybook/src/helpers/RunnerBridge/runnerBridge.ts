import { create, getState, log, send } from './actions';
import { LogFn, RunnerState, SendFn } from './types';

const logPath = 'log.sherlo';
const statePath = 'state.sherlo';
const protocolPath = 'protocol.sherlo';
const snapshotsDirectory = 'snapshots';

export type RunnerBridge = {
  create: () => Promise<void>;
  getState: () => Promise<RunnerState>;
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(logPath);
const sendFn: SendFn = send(protocolPath, logFn);

const runnerBridge: RunnerBridge = {
  create: create(snapshotsDirectory, logFn),
  getState: getState(statePath, logFn),
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
