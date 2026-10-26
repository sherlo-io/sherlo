/**
 * THE ERRORS THE APP LOGGED DURING A SCENE: a scene launch keeps the first argument of each
 * console.error call, so an error the app caught and only logged still shows beside the scene it
 * broke. Distinct messages, first seen first, with how many times each was logged; the core reads
 * them through the host's loggedErrors call (./sealedCore/sceneCalls) into the scene's record.
 *
 * Only the first argument's text is ever kept, never an object, a request body or any other app
 * data. The wrap calls through, so the app's own logging is unchanged. Scenes only: a story's
 * testing mode silences console.error itself (./getStorybook/components/TestingMode).
 */

const MOST_MESSAGES = 5;
const MOST_CHARACTERS = 200;
/** What Sherlo's own console lines start with; they are not the app's errors. */
const SHERLOS_OWN = ['@sherlo/', 'Sherlo:'];

/** How often each distinct message was logged, in the order first seen. */
const timesOf = new Map<string, number>();
let wrapped = false;

/**
 * Apollo Client without its error messages loaded logs a link whose fragment is URL-encoded JSON
 * holding the error code and arguments; the arguments sit past the length cap, so the link is
 * replaced by the same text made readable. Text that does not decode comes back as it was.
 */
function decodedApollo(text: string): string {
  const link = text.match(/https:\/\/go\.apollo\.dev\/c\/err#(\S+)/);
  if (!link) return text;
  try {
    const data = JSON.parse(decodeURIComponent(link[1]));
    if (typeof data?.message !== 'number' || !Array.isArray(data.args)) return text;
    return `Apollo Client error ${data.message}: ${data.args.map(String).join(', ')}`;
  } catch {
    return text; // not the JSON Apollo encodes: keep the text as it was logged
  }
}

/** The one-line text of a console.error call's first argument, or nothing when it keeps none. */
function messageOf(first: unknown): string | undefined {
  let text: string | undefined;
  if (first instanceof Error) text = `${first.name}: ${first.message}`;
  else if (typeof first === 'string') text = first;
  const firstLine = text?.trim().split('\n')[0].trim();
  const line = (firstLine && decodedApollo(firstLine))?.slice(0, MOST_CHARACTERS);
  if (!line || SHERLOS_OWN.some((start) => line.startsWith(start))) return undefined;
  return line;
}

/** Wrap console.error once, from here on: keep what is logged and call through to what was there. */
export function startKeepingLoggedErrors(): void {
  if (wrapped) return;
  wrapped = true;
  const logError = console.error;
  console.error = (...args: unknown[]) => {
    const message = messageOf(args[0]);
    if (message) timesOf.set(message, (timesOf.get(message) ?? 0) + 1);
    return logError.apply(console, args);
  };
}

/** The distinct messages logged so far, at most five, and how many distinct ones were left out. */
export function loggedErrors(): {
  messages: { message: string; times: number }[];
  moreLeftOut: number;
} {
  const all = [...timesOf].map(([message, times]) => ({ message, times }));
  return {
    messages: all.slice(0, MOST_MESSAGES),
    moreLeftOut: Math.max(0, all.length - MOST_MESSAGES),
  };
}
