import { log, send } from './actions';
import { LogFn, SendFn } from './types';
import { LOG_FILE, PROTOCOL_FILE } from '../../constants';

export type RunnerBridge = {
  log: LogFn;
  send: SendFn;
};

const logFn: LogFn = log(LOG_FILE);
const sendFn: SendFn = send(PROTOCOL_FILE, logFn);

const runnerBridge: RunnerBridge = {
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
