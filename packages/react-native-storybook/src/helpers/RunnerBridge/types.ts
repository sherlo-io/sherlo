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
import type { StoryRecording } from '../../types';

/** A story's picture request as it goes to the runner: the seam's, with the story's recording. */
export type RequestSnapshotWithRecording = RequestSnapshotProtocolItem & {
  /** What the real phone did for this story; none on a phone that cannot record (old architecture). */
  recording?: StoryRecording;
};

export type AppProtocolItem =
  | LoadEventMessage
  | JsErrorMessage
  | StartMessage
  | RequestSnapshotWithRecording;
