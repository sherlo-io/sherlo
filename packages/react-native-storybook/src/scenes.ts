import type { StoryMocks } from './mocking/mockDeclaration';
import type { ReadyRule } from './types/types';

/** A plain tap on a view, named by its `testID`, its visible text or its accessibility label. */
export type TapStep = {
  tap: string | { testID?: string; text?: string; label?: string; index?: number };
};

/** The app's own link, handed to the app as a link it received. */
export type OpenStep = { open: string };

export type PlayStep = TapStep | OpenStep;

/** One variant of one screen. */
export type Scene = {
  /** This scene's own mocks; they merge over the file's, and the scene's win. */
  mocks?: StoryMocks;
  /** Taps and links that take the app from its first screen to this one. */
  play?: PlayStep[];
  /**
   * When the screen is there: a `testID` whose showing means so, or a rule (ReadyRule) that also
   * names views that must be gone, a time limit and whether requests must be done.
   */
  ready?: string | ReadyRule;
};

/** What a scene file hands to `scenes()`. */
export type SceneFile = {
  /** Mocks every scene of the file shares. */
  mocks?: StoryMocks;
  /** The file's scenes by name; a name gives the scene its id, `chat--conversation`. */
  scenes: Record<string, Scene>;
};

/**
 * The one function a scene file calls: `export default scenes({ scenes: { Conversation: {...} } })`.
 * It records what it is given and runs nothing; the bundler lists the scene names while it bundles,
 * and the play steps are built from this record when a scene is opened.
 */
export function scenes(file: SceneFile): SceneFile {
  return file;
}
