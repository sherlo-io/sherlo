/**
 * WHAT THE PHONE DID FOR EACH STORY, as the polyfill's recorder (metro/polyfill.js) wrote it down:
 * every native module call with its answer, every event a native view sent, the commits and the
 * picture moment, and the roads it could not see.
 *
 * The polyfill makes the recorder only when the JavaScript starts in testing mode on the new
 * architecture. Anywhere else there is none, and every function here answers nothing. Recording
 * must never break what it records, so each one swallows its own failure.
 */
import { storyOfTheAppFiber } from './componentNames';
import type { StoryRecording } from './sealedCore/seam';

/** A fiber as much as finding a view's place under the story reads. */
type PlacedFiber = { index?: number; return?: PlacedFiber | null; alternate?: PlacedFiber | null };

type Recorder = {
  startStory: (storyId: string, placeOfView: (target: unknown) => number[] | null) => void;
  readStory: (storyId: string) => StoryRecording;
};

function recorder(): Recorder | undefined {
  return (globalThis as { __sherloNativeRecorder?: Recorder }).__sherloNativeRecorder;
}

/**
 * The place of the view `target` (the fiber an event names) under the top of the story: the index
 * among its siblings at each level down. Null when the view is not under the story.
 */
function placeUnderTheStory(target: unknown): number[] | null {
  const story = storyOfTheAppFiber() as PlacedFiber | undefined;
  if (!story) return null;
  // React keeps two copies of every fiber; a view's way up may pass through either.
  const tops = [story, story.alternate];
  const place: number[] = [];
  for (let fiber = target as PlacedFiber | null | undefined; fiber; fiber = fiber.return) {
    if (tops.includes(fiber)) return place.reverse();
    place.push(fiber.index ?? 0);
  }
  return null;
}

/** The story `storyId` is about to start: what it records from here on is its own. */
export function startStoryRecording(storyId: string): void {
  try {
    recorder()?.startStory(storyId, placeUnderTheStory);
  } catch (_) {
    // Recording never breaks the story: it is then left unrecorded.
  }
}

/**
 * What the phone did for the story `storyId` so far. The first read marks the picture moment.
 * Undefined when nothing is recorded.
 */
export function storyRecordingOf(storyId: string): StoryRecording | undefined {
  try {
    return recorder()?.readStory(storyId);
  } catch (_) {
    // Recording never breaks the story: a recording that cannot be read is no recording.
    return undefined;
  }
}
