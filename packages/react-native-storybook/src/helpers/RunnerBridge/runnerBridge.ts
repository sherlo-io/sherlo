import { log, send } from './actions';
import type { LogFn, RunnerProtocolItem } from '../../sealedCore/seam';
import type { AppProtocolItem } from './types';
import { LOG_FILE, PROTOCOL_FILE } from '../../constants';

export type RunnerBridge = {
  log: LogFn;
  send: (protocolItem: AppProtocolItem) => Promise<RunnerProtocolItem>;
};

const logFn: LogFn = log(LOG_FILE);
const sendFn = send(PROTOCOL_FILE, logFn);

const runnerBridge: RunnerBridge = {
  log: logFn,
  send: sendFn,
};

export default runnerBridge;
