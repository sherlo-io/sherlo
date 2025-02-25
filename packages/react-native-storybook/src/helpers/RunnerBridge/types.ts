import { Snapshot } from '../../types';

export type RunnerState = {
  filteredViewIds: String[];
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
export type GetLastStateFn = () => Promise<
  | {
      nextSnapshotIndex: number;
      filteredViewIds: String[];
      requestId: string;
    }
  | undefined
>;

export type ProtocolItemMetadata = {
  timestamp: number;
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
      inspectorData?: string;
      isStable?: boolean;
      requestId: string;
    };

export type AckStartProtocolItem = {
  action: 'ACK_START';
  filteredViewIds: String[];
  nextSnapshotIndex: number;
  requestId: string;
};

export type AckRequestSnapshotProtocolItem = {
  action: 'ACK_REQUEST_SNAPSHOT';
  nextSnapshotIndex: number;
  requestId: string;
};

export type RunnerProtocolItem = AckStartProtocolItem | AckRequestSnapshotProtocolItem;
