import { Snapshot } from '../../types';

export type RunnerState = {
  filteredViewIds: string[];
  snapshotIndex: number;
  updateTimestamp: number;
  retry?: boolean;
};

export type Config = {
  stabilization: {
    requiredMatches: number;
    intervalMs: number;
    timeoutMs: number;
  };
  overrideMode?: 'default' | 'storybook' | 'testing' | 'verification';
  expoUpdateDeeplink?: string;
};

export type LastState = {
  nextSnapshotIndex: number;
  nextSnapshot: Snapshot;
  filteredViewIds: string[];
  requestId: string;
};

export type LogFn = (key: string, parameters?: Record<string, any>) => void;
export type SendFn = (protocolItem: AppProtocolItem) => Promise<RunnerProtocolItem>;

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
  filteredViewIds: string[];
  nextSnapshotIndex: number;
  requestId: string;
};

export type AckRequestSnapshotProtocolItem = {
  action: 'ACK_REQUEST_SNAPSHOT';
  nextSnapshotIndex: number;
  requestId: string;
};

export type RunnerProtocolItem = AckStartProtocolItem | AckRequestSnapshotProtocolItem;
