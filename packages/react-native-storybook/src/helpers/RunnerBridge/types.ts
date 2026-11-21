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

/**
 * A story's picture request as it goes to the runner: the seam's, which carries what the real phone
 * did for the story; none on a phone that cannot record (old architecture).
 */
export type RequestSnapshotWithRecording = RequestSnapshotProtocolItem;

export type AppProtocolItem =
  | LoadEventMessage
  | JsErrorMessage
  | StartMessage
  | RequestSnapshotWithRecording;
