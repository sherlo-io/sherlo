/**
 * The protocol lines the app writes for the runner. Every message's shape is the seam's
 * (../../sealedCore/seam), as are the runner's answers.
 */
import type {
  JsErrorMessage,
  LoadEventMessage,
  RequestSnapshotProtocolItem,
  StartMessage,
} from '../../sealedCore/seam';

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

export type AppProtocolItem =
  | LoadEventMessage
  | JsErrorMessage
  | StartMessage
  | RequestSnapshotProtocolItem;
