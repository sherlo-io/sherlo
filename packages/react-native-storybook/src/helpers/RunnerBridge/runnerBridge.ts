import { create, getLastState, log, send } from './actions';
import sendHeartbeat from './actions/sendHeartbeat';
import { GetLastStateFn, LogFn, SendFn } from './types';

const logPath = 'log.sherlo';
const protocolPath = 'protocol.sherlo';
const heartbeatPath = 'heartbeat.sherlo';
const snapshotsDirectory = 'snapshots';

export type RunnerBridge = {
  create: () => Promise<void>;
  getLastState: GetLastStateFn;
  log: LogFn;
  send: SendFn;
  sendHeartbeat: () => Promise<void>;
};

const logFn: LogFn = log(logPath);
const sendFn: SendFn = send(protocolPath, logFn);

const runnerBridge: RunnerBridge = {
  create: create(snapshotsDirectory, logFn),
  getLastState: getLastState(protocolPath, logFn),
  log: logFn,
  send: sendFn,
  sendHeartbeat: () => sendHeartbeat(heartbeatPath),
};

export default runnerBridge;
