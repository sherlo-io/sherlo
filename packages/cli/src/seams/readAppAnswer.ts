/**
 * THE READERS OF THE APP'S ANSWER - the small readers both the story road (captureSocket) and the
 * scene road (liveScene) use to take a list of strings or a list of unanswered requests off the
 * wire. They live apart so the two roads can share them without importing each other.
 */
import type { RefusedRequest } from '../../../react-native-storybook/src/mocking/refusedRequest';
import { UNUSED_FAKE_LINE } from '../../../react-native-storybook/src/mocking/unusedFakeLine';
import type { SceneLeft } from '../render/capturedScene';
import { readAppError } from './appError';
import { keepStrings } from './appLog';

/**
 * A request that no mock answered; the app lists it whether the story refused it or let it through.
 * The details are what a discover capture sends (masked, never a whole body); a story record keeps none.
 */
export type UnansweredRequest = RefusedRequest & {
  /** The npm package whose code made the request, when the app's call stack names one. */
  library?: string;
  /** Set on the Mac, never by the app: the package under node_modules whose code holds the host (see ./senderByCode). */
  codeNames?: string;
};

/** What the SDK finds wrong in a faked GraphQL answer, as the app lists it. */
export type AnswerFinding = {
  kind:
    | 'field-missing'
    | 'typename-missing'
    | 'typename-matches-no-fragment'
    | 'no-query-text'
    | 'field-extra'
    | 'field-wrong-type';
  operation?: string;
  path?: string;
  expected?: string;
};

const FINDING_KINDS: AnswerFinding['kind'][] = [
  'field-missing',
  'typename-missing',
  'typename-matches-no-fragment',
  'no-query-text',
  'field-extra',
  'field-wrong-type',
];

/** What a never-reached scene's record points to as its likely cause. */
export type LikelyCause = ('unanswered-requests' | 'logged-errors')[];

/** The errors the app logged during a scene: distinct messages with counts, and how many more were left out. */
type ErrorsTheAppLogged = { messages: { message: string; times: number }[]; moreLeftOut: number };

/** The logged errors off the wire; a malformed message is dropped, and nothing when none is left. */
export function readLoggedErrors(value: unknown): ErrorsTheAppLogged | undefined {
  const { messages, moreLeftOut } = (value ?? {}) as { messages?: unknown; moreLeftOut?: unknown };
  if (!Array.isArray(messages)) return undefined;
  const read: ErrorsTheAppLogged['messages'] = [];
  for (const entry of messages) {
    const { message, times } = (entry ?? {}) as { message?: unknown; times?: unknown };
    if (typeof message === 'string' && typeof times === 'number') read.push({ message, times });
  }
  if (read.length === 0) return undefined;
  return { messages: read, moreLeftOut: typeof moreLeftOut === 'number' ? moreLeftOut : 0 };
}

/** A list of strings off the wire, or nothing when the wire sent no list or only empty ones. */
export function readStrings(value: unknown): string[] | undefined {
  const read = keepStrings(value);
  return read.length > 0 ? read : undefined;
}

/**
 * The requests no mock answered, each a method and an address; a malformed entry is dropped. With
 * `details`, the content type, GraphQL operation and masked body excerpt ride along as the app sent them.
 */
export function readUnanswered(value: unknown, details = false): UnansweredRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const read: UnansweredRequest[] = [];
  for (const entry of value) {
    const { method, url, ...more } = (entry ?? {}) as Record<string, unknown>;
    if (typeof method !== 'string' || typeof url !== 'string') continue;
    const kept = details
      ? keepStringFields(more, [
          'contentType',
          'operation',
          'bodyExcerpt',
          'library',
          'scope',
          'rule',
          'fakeAt',
          'stack',
        ])
      : {};
    read.push({ method, url, ...kept });
  }
  return read.length > 0 ? read : undefined;
}

/** The named fields of `from` that are strings, and no others. */
function keepStringFields(from: Record<string, unknown>, names: string[]): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of names) {
    const value = from[name];
    if (typeof value === 'string') kept[name] = value;
  }
  return kept;
}

/** The findings about the faked GraphQL answers; a malformed entry is dropped, and nothing when none is left. */
export function readAnswerFindings(value: unknown): AnswerFinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const read: AnswerFinding[] = [];
  for (const entry of value) {
    const { kind, ...more } = (entry ?? {}) as Record<string, unknown>;
    const known = FINDING_KINDS.find((one) => one === kind);
    if (!known) continue;
    read.push({ kind: known, ...keepStringFields(more, ['operation', 'path', 'expected']) });
  }
  return read.length > 0 ? read : undefined;
}

/** The step the ready view showed at, of the steps the play has; nothing when the app said none. */
export function readReadyTooEarly(value: unknown): { atStep: number; of: number } | undefined {
  const { atStep, of } = (value ?? {}) as { atStep?: unknown; of?: unknown };
  return typeof atStep === 'number' && typeof of === 'number' ? { atStep, of } : undefined;
}

/**
 * The declared module fakes the app never used, as the record names them; a malformed entry is
 * dropped, and nothing when none is left.
 */
export function readMockNotApplied(value: unknown): SceneLeft['mockNotApplied'] {
  if (!Array.isArray(value)) return undefined;
  const read: NonNullable<SceneLeft['mockNotApplied']> = [];
  for (const entry of value) {
    const { module, why } = (entry ?? {}) as { module?: unknown; why?: unknown };
    if (typeof module !== 'string') continue;
    read.push(why === 'bundler-had-not-seen-it' ? { module, why } : { module });
  }
  return read.length > 0 ? read : undefined;
}

/**
 * The logged errors without the lines that say a fake was never used (the app logs those at the end
 * of a scene), and the fakes those lines name. The errors keep their order; nothing is left when no
 * message remains.
 */
function takeUnusedFakes(logged: ErrorsTheAppLogged | undefined): {
  loggedErrors?: ErrorsTheAppLogged;
  unused: { module: string }[];
} {
  if (!logged) return { unused: [] };
  const unused = logged.messages.flatMap(({ message }) => {
    const module = UNUSED_FAKE_LINE.exec(message)?.[1];
    return module ? [{ module }] : [];
  });
  const messages = logged.messages.filter(({ message }) => !UNUSED_FAKE_LINE.test(message));
  return { unused, ...(messages.length > 0 && { loggedErrors: { ...logged, messages } }) };
}

/** What the scene threw, ran as real code and left unanswered, as the story's record reads them. */
export function keptLeft(answer: Record<string, unknown>): SceneLeft {
  const threw = readAppError(answer.threw);
  const stillReal = readStrings(answer.stillReal);
  const unanswered = readUnanswered(answer.unanswered, true);
  const { loggedErrors, unused } = takeUnusedFakes(readLoggedErrors(answer.loggedErrors));
  const notApplied = [...(readMockNotApplied(answer.mockNotApplied) ?? []), ...unused];
  const mockNotApplied = notApplied.length > 0 ? notApplied : undefined;
  const readyTooEarly = readReadyTooEarly(answer.readyTooEarly);
  const answerFindings = readAnswerFindings(answer.answerFindings);
  return {
    ...(threw && { threw: { name: threw.name, message: threw.message } }),
    ...(stillReal && { stillReal }),
    ...(unanswered && { unanswered }),
    ...(readyTooEarly && { readyTooEarly }),
    ...(answerFindings && { answerFindings }),
    ...(loggedErrors && { loggedErrors }),
    ...(mockNotApplied && { mockNotApplied }),
  };
}

/** The likely causes of a scene that never got ready; nothing when the app named none. */
export function readLikelyCause(value: unknown): LikelyCause | undefined {
  if (!Array.isArray(value)) return undefined;
  const read = value.filter(
    (cause): cause is LikelyCause[number] =>
      cause === 'unanswered-requests' || cause === 'logged-errors'
  );
  return read.length > 0 ? read : undefined;
}
