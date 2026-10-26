/**
 * THE READERS OF THE APP'S ANSWER - the small readers both the story road (captureSocket) and the
 * scene road (liveScene) use to take a list of strings or a list of unanswered requests off the
 * wire. They live apart so the two roads can share them without importing each other.
 */
import { keepStrings } from './appLog';

/** A request a story made that no mock answered; the app lists it whether the story refused it or let it through. */
export type UnansweredRequest = { method: string; url: string };

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

/** The requests no mock answered, each a method and an address; a malformed entry is dropped. */
export function readUnanswered(value: unknown): UnansweredRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const read: UnansweredRequest[] = [];
  for (const entry of value) {
    const { method, url } = (entry ?? {}) as { method?: unknown; url?: unknown };
    if (typeof method === 'string' && typeof url === 'string') read.push({ method, url });
  }
  return read.length > 0 ? read : undefined;
}
