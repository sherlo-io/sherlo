export type RunnerState = {
  index: number;
  storyDisplayName: string;
  storyId: string;
  timestamp: number;
  launchTimestamp?: number;
  retry?: boolean;
};

export type Config = {
  exclude: string[] | string;
  include: string[] | string;
  initSnapshotIndex: number;
};

export type LogFn = (key: string, parameters?: Record<string, any>) => void;
export type SendFn = (protocolItem: AppProtocolItem) => Promise<void>;

export type AppProtocolItem =
  | {
      action: 'START';
      stories: string;
    }
  | {
      action: 'REQUEST_SNAPSHOT';
      displayName: string;
      id: string;
      nextState: RunnerState;
      figmaUrl?: string;
      hasError?: boolean;
      restart?: boolean;
    }
  | {
      action: 'UPDATE_STATE';
      index: number;
      storyDisplayName: string;
      storyId: string;
      timestamp: number;
      launchTimestamp?: number;
    }
  | {
      action: 'END';
    };

export type RunnerProtocolItem =
  | {
      action: 'ACK_START';
    }
  | {
      action: 'ACK_UPDATE_STATE';
    }
  | {
      action: 'ACK_REQUEST_SNAPSHOT';
    }
  | {
      action: 'ACK_END';
    };
