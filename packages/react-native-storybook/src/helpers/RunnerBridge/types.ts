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
    minScreenshotsCount: number;
    intervalMs: number;
    timeoutMs: number;
    saveScreenshots?: boolean;
  };
  overrideMode?: 'default' | 'storybook' | 'testing';
  expoUpdateDeeplink?: string;
  overrideLastState?: LastState;
};

export type LastState = {
  nextSnapshot: Snapshot;
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
      action: 'JS_LOADED';
      requestId?: string;
    }
  | {
      action: 'START';
      snapshots: Snapshot[];
    }
  | {
      action: 'REQUEST_SNAPSHOT';
      hasError?: boolean;
      inspectorData?: string;
      isStable?: boolean;
      requestId: string;
      rendersRemoteImages?: boolean;
      safeAreaMetadata?: {
        shouldAddSafeArea: boolean;
        insetBottom: number;
        insetTop: number;
        isStorybook7: boolean;
      };
    };

export type AckStartProtocolItem = {
  action: 'ACK_START';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type AckRequestSnapshotProtocolItem = {
  action: 'ACK_REQUEST_SNAPSHOT';
  nextSnapshot: Snapshot;
  requestId: string;
};

export type RunnerProtocolItem = AckStartProtocolItem | AckRequestSnapshotProtocolItem;
