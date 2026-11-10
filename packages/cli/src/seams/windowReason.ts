/**
 * WHY A CAPTURE IS ROOTED AT THE WINDOW - the reason the app gives for answering with its whole
 * window rather than the story's own views, and its reader off the wire. ./captureSocket carries it
 * in a captured story's `root`.
 */
import { keepStrings } from './appLog';

/**
 * WHY the app's answer is rooted at the window rather than the story, as it reports it - see the
 * SDK's own WindowReason (packages/react-native-storybook/src/captureTransport.ts).
 */
export type WindowReason =
  /** The app never published any reading of its views, of any story, at any point the poll ran. */
  | {
      cause: 'nothing-published';
      /**
       * How the app's MetadataProvider first rendering relates to when its poll began: positive is
       * that many ms after, negative is that many ms before, `undefined` is that it never rendered
       * at all - or rendered once, earlier in the same boot, and was withdrawn before this poll ran.
       */
      providerRenderedRelativeToPollMs?: number;
    }
  /** A reading WAS published - the app's poll got an answer at some point - but it never named this story. */
  | {
      cause: 'story-unnamed';
      /** Whether the app had published any reading of its views the moment the app's poll began. */
      publishedAtPollStart: boolean;
      /**
       * How the app's MetadataProvider first rendering relates to when its poll began: positive is
       * that many ms after, negative is that many ms before, `undefined` is that it had not
       * rendered at all by the time the poll gave up.
       */
      providerRenderedRelativeToPollMs?: number;
      /**
       * The distinct testIDs the reading held when the app's poll gave up, never this story's own -
       * see the SDK's own WindowReason.testIdsAtGiveUp. Empty means the reading held no story's
       * testID at all; one or more means it held a DIFFERENT story's - two different bugs the record
       * could not otherwise tell apart.
       */
      testIdsAtGiveUp: string[];
    }
  | { cause: 'story-broken'; source: 'error-registry' }
  | { cause: 'story-broken'; source: 'fallback-text'; generation: 'live' | 'merged' }
  | { cause: 'story-not-in-tree' };

/**
 * WHY a window root was reported, read straight off the wire the way `readRoot`'s own fields are -
 * or nothing when the app said nothing readable about it, which an app older than this field does,
 * and which a story root always does (it is never asked why).
 */
export function readWindowReason(value: unknown): WindowReason | undefined {
  const reason = value as
    | {
        cause?: unknown;
        source?: unknown;
        generation?: unknown;
        publishedAtPollStart?: unknown;
        providerRenderedRelativeToPollMs?: unknown;
        testIdsAtGiveUp?: unknown;
      }
    | null
    | undefined;

  if (reason?.cause === 'nothing-published') {
    return {
      cause: 'nothing-published',
      ...(typeof reason.providerRenderedRelativeToPollMs === 'number' && {
        providerRenderedRelativeToPollMs: reason.providerRenderedRelativeToPollMs,
      }),
    };
  }
  if (reason?.cause === 'story-unnamed') {
    return {
      cause: 'story-unnamed',
      publishedAtPollStart: reason.publishedAtPollStart === true,
      ...(typeof reason.providerRenderedRelativeToPollMs === 'number' && {
        providerRenderedRelativeToPollMs: reason.providerRenderedRelativeToPollMs,
      }),
      testIdsAtGiveUp: keepStrings(reason.testIdsAtGiveUp),
    };
  }
  if (reason?.cause === 'story-not-in-tree') return { cause: 'story-not-in-tree' };

  if (reason?.cause === 'story-broken') {
    if (reason.source === 'error-registry') {
      return { cause: 'story-broken', source: 'error-registry' };
    }
    if (
      reason.source === 'fallback-text' &&
      (reason.generation === 'live' || reason.generation === 'merged')
    ) {
      return { cause: 'story-broken', source: 'fallback-text', generation: reason.generation };
    }
  }

  return undefined;
}
