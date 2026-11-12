import type { MockDeclaration, StoryMocks } from './mocking/mockDeclaration';
import type { StartState } from './mocking/startState';
import type { SceneDevice, SceneMember } from './sceneDeviceTypes';

/**
 * Where a precondition was written: in the scene file itself, or in a file the team shares between
 * scene files. A fake the scene file itself lists must be reached by the scene; a shared one is a
 * default the scene may leave alone.
 */
export type PreconditionOrigin = 'scene file' | 'shared';

/**
 * What a scene starts from, as a plain function result the team writes once and imports into the
 * scenes that need it: fakes of a library and of requests, real objects' start states, the phone's
 * settings, and the member.
 */
export type PreconditionParts = {
  /** Fakes of a library (`mock`, `mockClock`, `mockRandom`) and of requests (`mockRequest`). */
  mocks?: StoryMocks;
  /** Real objects that start already holding the state the scene needs. */
  startStates?: StartState[];
  /** The phone's permissions and location, set before the app starts. */
  device?: SceneDevice;
  /** Who the app starts for: signed out, or on a fresh install. */
  member?: SceneMember;
  /** Set by `given` and by the scene's reader, never written by hand. */
  origin?: PreconditionOrigin;
};

/** One entry of a `given` list: a precondition's parts, a fake, or a start state. */
export type Precondition = PreconditionParts | MockDeclaration | StartState;

/** A `given` list: preconditions, and lists of them nested as deep as the team's functions go. */
export type Given = Precondition | Given[];

function isFake(entry: Precondition): entry is MockDeclaration {
  return 'kind' in entry;
}

function isStartState(entry: Precondition): entry is StartState {
  return 'activate' in entry;
}

/**
 * Which entries of a scene's `given` list a file other than the scene file built, worked out while
 * bundling (metro/givenReader.js): true for such an entry, a list for a nested list, false for an
 * entry the scene file wrote itself. Written by the bundler, never by hand.
 */
export type SharedMark = boolean | SharedMark[];

/**
 * Flattens nested lists in order, into the parts each entry stands for. Entries not yet marked take
 * `origin`, or 'shared' where `shared` marks them as built in another file.
 */
export function partsOf(
  list: Given,
  origin: PreconditionOrigin,
  shared: SharedMark = false
): PreconditionParts[] {
  if (Array.isArray(list)) {
    return list.flatMap((entry, index) =>
      partsOf(entry, origin, Array.isArray(shared) ? shared[index] : shared)
    );
  }
  const where = shared === true ? 'shared' : origin;
  if (isFake(list)) return [{ mocks: [list], origin: where }];
  if (isStartState(list)) return [{ startStates: [list], origin: where }];
  return [{ ...list, origin: list.origin ?? where }];
}

/**
 * Puts preconditions together as one, for a shared function that stands for several
 * (`signedInWithInbox = () => given(signedIn(), withInbox())`). The order is kept and the parts are
 * marked as shared; the scene reads the list as it was handed.
 */
export function given(...parts: Given[]): PreconditionParts[] {
  return partsOf(parts, 'shared');
}

/** The member is signed out: the app starts at its signed-out screens. */
export function signedOut(): PreconditionParts {
  return { member: 'signed-out' };
}

/** The member is on a fresh install: no sign-in, no saved data, no answered permission dialog. */
export function freshInstall(): PreconditionParts {
  return { member: 'fresh-install' };
}
