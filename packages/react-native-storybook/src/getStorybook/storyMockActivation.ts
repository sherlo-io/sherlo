/**
 * The one path that installs ONE story's merged mock set. Sherlo's decorator
 * (./sherloAnnotation) calls it for every story Storybook is about to render, in testing mode and
 * Storybook mode alike, and the sealed core reaches it through its host.
 *
 * Its three levels - the project's, the file's and the story's - all come from what Storybook's
 * start() was handed (../mocking/storyMocksOf), so they are all there on the first pass.
 */
import { storyMocksOf } from '../mocking/storyMocksOf';
import {
  activateNetworkMocks,
  activateStoryMocks,
  networkMocksOf,
  resolveDeclarations,
  UnmockedRequestError,
} from '../mocking';
import { recordStoryError } from './storyErrorRegistry';

// Monotonic id for the latest attempt to install a story's mocks. A declaration names its
// module by import, so its name is only known once that import resolves - and an attempt whose
// resolution finishes after a newer attempt has already installed must not overwrite it.
let latestInstall = 0;
// What the latest attempt answered: what a superseded attempt hands its caller to wait on instead.
let latestInstalled: Promise<void> | null = null;

/**
 * Install `storyId`'s merged mocks, and say when they ARE installed: null when that has already
 * happened - the object form, and a story with no mocks at all - or the promise that settles
 * once it has, for declarations, whose modules are only named once their imports resolve.
 *
 * THE STORY MUST NOT RENDER WHILE THAT PROMISE IS OUTSTANDING. A story that renders first reads
 * the real module, and a capture that renders once and never again would record the real value.
 * Sherlo's decorator renders the story only once the promise settles.
 */
export function activateMocksForStory(storyId: string | undefined): Promise<void> | null {
  if (!storyId) return null;

  const mocks = storyMocksOf(storyId);
  const install = (latestInstall += 1);

  // Network rules are plain values the story wrote, so they are in effect at once - no import to
  // wait for. A story that declares none puts the real fetch and XMLHttpRequest back.
  activateNetworkMocks(networkMocksOf(mocks), (refusal) => recordRefusal(storyId, refusal));

  // The object form already names every module it mocks, so it installs at once.
  if (!Array.isArray(mocks)) {
    activateStoryMocks(mocks);
    latestInstalled = null;
    return null;
  }

  // An attempt a newer one overtook installs nothing, and settles only once the newer one has
  // installed: its caller - Sherlo's decorator, say - renders the story when it settles, and a
  // story rendered before then reads the real module. On a dev server each attempt's import
  // fetches its own lazy bundle, so the newer attempt's can arrive after the first attempt's.
  latestInstalled = resolveDeclarations(mocks).then((resolvedMocks) => {
    if (install !== latestInstall) return latestInstalled ?? undefined;
    activateStoryMocks(resolvedMocks);
  });
  return latestInstalled;
}

/**
 * A request no rule matched is recorded exactly the way a render error is, in the one registry the
 * error boundary fills (./storyErrorRegistry). That is what makes the capture and the test run
 * both report the story as one that threw, with the refusal's own name and message: there is ONE
 * way of knowing a story is broken in this SDK, and a refused request is another writer of it.
 *
 * This is also the only place a refusal meets a story: the interceptor itself knows nothing but
 * the rules in effect.
 */
function recordRefusal(storyId: string, refusal: UnmockedRequestError): void {
  recordStoryError(storyId, {
    name: refusal.name,
    message: refusal.message,
    stack: refusal.stack ?? '',
    componentStack: '',
  });
}
