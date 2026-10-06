/**
 * The protocol lines the app writes for the runner. The two the sealed core sends, START and
 * REQUEST_SNAPSHOT, and the runner's answers to them are the seam's (../../sealedCore/seam); the
 * rest are written by native code.
 */
import type { RequestSnapshotProtocolItem, StartProtocolItem } from '../../sealedCore/seam';

export type RunnerState = {
  filteredViewIds: string[];
  snapshotIndex: number;
  updateTimestamp: number;
  retry?: boolean;
};

export type ProtocolItemMetadata = {
  timestamp: number;
  entity: 'app' | 'runner';
};

/**
 * Which sealed core ran in this launch, as START reports it to the runner in testing mode: where
 * the JS core came from (`none` when no core ran), the JS core's version, and the C core's.
 */
export type CoreReport = {
  origin: 'shipped' | 'override' | 'none';
  version: string | null;
  cVersion: string | null;
};

export type AppProtocolItem =
  | {
      action: 'NATIVE_INIT_STARTED';
    }
  | {
      action: 'JS_EVAL_COMPLETE';
    }
  | {
      action: 'STORYBOOK_LOADED';
    }
  | {
      action: 'STORYBOOK_RENDERED';
      requestId?: string;
    }
  | {
      action: 'JS_ERROR';
      data: {
        name: string;
        message: string;
        stack: string;
        componentStack: string;
      };
    }
  /** The core's START, with the report of which core ran that the SDK adds in testing mode. */
  | (StartProtocolItem & { core?: CoreReport })
  | RequestSnapshotProtocolItem;
