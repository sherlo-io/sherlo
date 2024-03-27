import { Snapshot } from '../types';

export type RunnerState = {
  snapshotIndex: number;
  updateTimestamp: number;
  retry?: boolean;
};

export type Config = {
  exclude: string[] | string;
  include: string[] | string;
  initSnapshotIndex: number;
};

export type LogFn = (key: string, parameters?: Record<string, any>) => void;
export type SendFn = (protocolItem: AppProtocolItem) => Promise<RunnerProtocolItem | undefined>;

export type AppProtocolItem =
  | {
      action: 'START';
      snapshots: Snapshot[];
    }
  | {
      action: 'REQUEST_SNAPSHOT';
      snapshotIndex: number;
      // if error we want to restart the app before going to next snapshot
      hasError?: boolean;
    }
  | {
      action: 'END';
    };

export type RunnerProtocolItem =
  | {
      action: 'ACK_START';
    }
  | {
      action: 'ACK_REQUEST_SNAPSHOT';
      nextSnapshotIndex?: number;
      // finish is dumb, runner should just finish the app
      finish?: boolean;
    }
  | {
      action: 'ACK_END';
    };
