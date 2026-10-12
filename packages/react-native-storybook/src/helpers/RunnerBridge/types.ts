/**
 * The messages the app sends for the runner. Every message's shape is the seam's
 * (../../sealedCore/seam), as are the runner's answers.
 */
import type {
  JsErrorMessage,
  LoadEventMessage,
  RequestSnapshotProtocolItem,
  StartMessage,
} from '../../sealedCore/seam';

export type AppProtocolItem =
  | LoadEventMessage
  | JsErrorMessage
  | StartMessage
  | RequestSnapshotProtocolItem;
