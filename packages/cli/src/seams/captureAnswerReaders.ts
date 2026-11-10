/**
 * The small readers of a capture answer: how the app's story settled, how many screenfuls it was,
 * how its waits went and what its tree is rooted at. Each reads straight off the wire and answers
 * nothing for a value an older app does not send.
 */
import type { WindowReason } from './windowReason';
import { readWindowReason } from './windowReason';
import type { WaitOutcome } from './captureSocket';

/** How the stabilization ended, or `timed-out` when the relay said nothing readable about it. */
export function readSettled(value: unknown): { ms: number; frames: number } | 'timed-out' {
  if (value === 'timed-out') return 'timed-out';
  const settled = value as { ms?: unknown; frames?: unknown } | null | undefined;
  if (typeof settled?.ms === 'number' && typeof settled?.frames === 'number') {
    return { ms: settled.ms, frames: settled.frames };
  }
  return 'timed-out';
}

/**
 * How many screenfuls the app said the story was, or nothing when it said nothing readable about
 * it. Nothing is a real answer - an app older than this field has no such number to give - and the
 * screen says no more for it than it says for a story that fits one screen.
 */
export function readParts(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

/**
 * How the app's two waits for this story went, or nothing when it said nothing readable about
 * them - an app older than this field does. Read straight off the wire, never reconstructed: a
 * value read only here and nowhere inferred is the whole point of carrying it across the socket.
 */
export function readWaited(
  value: unknown
): { metadata: WaitOutcome; storyViews: WaitOutcome & { rereads: number } } | undefined {
  const waited = value as { metadata?: unknown; storyViews?: unknown } | null | undefined;
  const metadata = readWaitOutcome(waited?.metadata);
  const storyViews = readStoryViewsWait(waited?.storyViews);
  if (!metadata || !storyViews) return undefined;
  return { metadata, storyViews };
}

function readWaitOutcome(value: unknown): WaitOutcome | undefined {
  const outcome = value as { outcome?: unknown; ms?: unknown } | null | undefined;
  if (
    (outcome?.outcome === 'first-check' ||
      outcome?.outcome === 'polled' ||
      outcome?.outcome === 'timed-out') &&
    typeof outcome.ms === 'number'
  ) {
    return { outcome: outcome.outcome, ms: outcome.ms };
  }
  return undefined;
}

function readStoryViewsWait(value: unknown): (WaitOutcome & { rereads: number }) | undefined {
  const outcome = readWaitOutcome(value);
  const rereads = (value as { rereads?: unknown } | null | undefined)?.rereads;
  if (!outcome || typeof rereads !== 'number') return undefined;
  return { ...outcome, rereads };
}

/**
 * What the tree the app recorded is rooted at, and how many nodes it holds - or nothing when the
 * app said nothing readable about it, for the same reason `waited` can be absent.
 */
export function readRoot(
  value: unknown
): { at: 'story' | 'window'; nodeCount: number; reason?: WindowReason } | undefined {
  const root = value as { at?: unknown; nodeCount?: unknown; reason?: unknown } | null | undefined;
  if (!(root?.at === 'story' || root?.at === 'window') || typeof root.nodeCount !== 'number') {
    return undefined;
  }
  const reason = readWindowReason(root.reason);
  return { at: root.at, nodeCount: root.nodeCount, ...(reason && { reason }) };
}
