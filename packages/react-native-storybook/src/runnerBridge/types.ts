import { Snapshot } from '../types';

export type RunnerState = {
  snapshotIndex: number;
  updateTimestamp: number;
  retry?: boolean;
};

export type Config = {
  exclude: string[] | string;
  include: string[] | string;
};

export type LogFn = (key: string, parameters?: Record<string, any>) => void;
export type SendFn = (protocolItem: AppProtocolItem) => Promise<RunnerProtocolItem>;

export type ProtocolItemMetadata = {
  timestamp: number;
  time: string;
  entity: 'app' | 'runner';
};

export type AppProtocolItem =
  | {
      action: 'START';
      snapshots: Snapshot[];
    }
  | {
      action: 'REQUEST_SNAPSHOT';
      snapshotIndex: number;
      hasError?: boolean;
    };

export type RunnerProtocolItem =
  | {
      action: 'ACK_START';
      nextSnapshotIndex: number;
    }
  | {
      action: 'ACK_REQUEST_SNAPSHOT';
      nextSnapshotIndex: number;
    };
