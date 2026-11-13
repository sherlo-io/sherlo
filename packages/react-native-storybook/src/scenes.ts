import type { Given } from './preconditions';
import type { ReadyRule } from './types/types';

/**
 * The view a tap names: by `testID` (with an `index` among the visible matches, topmost first), by
 * its visible `text`, or by its accessibility `label`. A bare string is a `testID`.
 */
export type TapTarget = { testID?: string; text?: string; label?: string; index?: number };

/** A plain tap on a view. */
export type TapStep = { tap: string | TapTarget };

/** A finger held on a view long enough to open a menu; the target is named as a tap's is. */
export type LongPressStep = { longPress: string | TapTarget };

/**
 * Text put into the text field with that `testID`, as if typed: the field's change handlers get it
 * and the field shows it. The typed text is never recorded or logged.
 */
export type TypeStep = { type: { testID: string; text: string } };

/**
 * A finger dragged from the middle of the view with that `testID` (the `index`-th visible match,
 * topmost first) toward its edge in `direction`, so a row's swipe actions open.
 */
export type SwipeStep = {
  swipe: { testID: string; direction: 'left' | 'right' | 'up' | 'down'; index?: number };
};

/** The app's own link, handed to the app as a link it received. */
export type OpenStep = { open: string };

/** A wait for a view between two steps. */
export type ReadyStep = { ready: string | ReadyRule };

export type PlayStep = TapStep | LongPressStep | TypeStep | SwipeStep | OpenStep | ReadyStep;

export type { SceneDevice, SceneMember, ScenePermission, ScenePhone } from './sceneDeviceTypes';
export { freshInstall, given, signedOut } from './preconditions';
export type { Given, Precondition, PreconditionParts } from './preconditions';

/** One variant of one screen. */
export type Scene = {
  /**
   * What the scene starts from, in order, a later entry winning over an earlier one:
   * `given: [signedIn(member), withInbox(threads), mock(...)]`. Each entry is a precondition, a
   * plain function result the team writes once and imports; no scene file has setup of its own.
   */
  given?: Given;
  /** Taps and links that take the app from its first screen to this one. */
  play?: PlayStep[];
  /**
   * When the screen is there: a `testID` whose showing means so, or a rule (ReadyRule) that names
   * views by `text` or `label` as well, views that must be gone, a time limit and whether requests
   * must be done.
   */
  ready?: string | ReadyRule;
};

/** What a scene file hands to `scenes()`. */
export type SceneFile = {
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
