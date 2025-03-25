import { log, send } from './actions';
import { LogFn, SendFn } from './types';

const logPath = 'log.sherlo';
const protocolPath = 'protocol.sherlo';

export type RunnerBridge = {
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(logPath);
const sendFn: SendFn = send(protocolPath, logFn);

const runnerBridge: RunnerBridge = {
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
