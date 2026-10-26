/**
 * THE READERS OF THE APP'S ANSWER - the small readers both the story road (captureSocket) and the
 * scene road (liveScene) use to take a list of strings or a list of unanswered requests off the
 * wire. They live apart so the two roads can share them without importing each other.
 */
import { keepStrings } from './appLog';

/** A request a story made that no mock answered; the app lists it whether the story refused it or let it through. */
export type UnansweredRequest = { method: string; url: string };

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
