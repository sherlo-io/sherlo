import { create, getLastState, log, send } from './actions';
import { LogFn, SendFn, GetLastStateFn } from './types';

const logPath = 'log.sherlo';
const protocolPath = 'protocol.sherlo';
const snapshotsDirectory = 'snapshots';

export type RunnerBridge = {
  create: () => Promise<void>;
  getLastState: GetLastStateFn;
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(logPath);

const runnerBridge: RunnerBridge = {
  log: logFn,
  create: create(snapshotsDirectory, logFn),
  getLastState: getLastState(protocolPath, logFn),
  send: send(protocolPath, logFn),
};

export default runnerBridge;
