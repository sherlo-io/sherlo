/**
 * The single path for installing ONE story's merged mock set, shared by both
 * activation entry points: the testing-capture path (TestingMode.tsx) and the
 * interactive initial-story path (interactiveMockActivation.ts). Routing both
 * through here means global-level mocks can never activate in one but not the other.
 *
 * WHY GLOBAL MOCKS NEED A SECOND PASS
 * A story's mocks are merged from three levels (global > meta > story - see
 * enumerateStories / mergeStoryMocks). Meta- and story-level mocks come from the story
 * exports, which are loaded synchronously, so they apply on the first pass. Global-level
 * mocks live ONLY in the app's `.rnstorybook/preview.ts`, which Storybook composes into
 * view._preview.storyStoreValue.projectAnnotations ASYNCHRONOUSLY during preview init.
 *
 * On a fresh boot (the single-story release capture, or an interactive session that
 * lands directly on a mocked story) the first pass runs BEFORE that composition, so
 * enumerateStories reads empty project params and global mocks resolve to {}. We
 * therefore re-apply once view._preview.ready() resolves - the exact point Storybook
 * populates storyStoreValue.projectAnnotations - which lands before the story renders.
 */
import { StorybookView } from '../types';
import { enumerateStories } from '../storybook/adapter';
import {
  activateNetworkMocks,
  activateStoryMocks,
  networkMocksOf,
  resolveDeclarations,
  UnmockedRequestError,
} from '../mocking';
import { recordStoryError } from './storyErrorRegistry';

// The live preview fields we rely on. `ready()` resolves once the StoryStore -
// and thus projectAnnotations (global params) - exists; `storyStoreValue` is
// present iff that has already happened. Reached through a cast, like the other
// internal preview access in adapter.ts / getStorybook.tsx.
interface PreviewInternal {
  ready?: () => Promise<unknown>;
  storyStoreValue?: unknown;
}

function getPreview(view: StorybookView): PreviewInternal | undefined {
  return (view as unknown as { _preview?: PreviewInternal })._preview;
}

// Monotonic id for the latest attempt to install a story's mocks. A declaration names its
// module by import, so its name is only known once that import resolves - and an attempt whose
// resolution finishes after a newer attempt has already installed must not overwrite it.
let latestInstall = 0;

// Installs one pass of `storyId`'s mocks. Returns null once they ARE installed, or the promise
// that settles when they are - which is the whole difference a declaration makes: it names its
// module by import, so nothing can be installed until that import resolves. A caller that is
// about to render the story must not render while a promise is outstanding.
function applyStoryMocks(view: StorybookView, storyId: string): Promise<void> | null {
  const storyMeta = enumerateStories(view).find((story) => story.id === storyId);
  const mocks = storyMeta?.mocks ?? {};
  const install = (latestInstall += 1);

  // Network rules are plain values the story wrote, so they are in effect at once - no import to
  // wait for. A story that declares none puts the real fetch and XMLHttpRequest back.
  activateNetworkMocks(networkMocksOf(mocks), (refusal) => recordRefusal(storyId, refusal));

  // The object form already names every module it mocks, so it installs at once.
  if (!Array.isArray(mocks)) {
    activateStoryMocks(mocks);
    return null;
  }

  return resolveDeclarations(mocks).then((resolvedMocks) => {
    if (install !== latestInstall) return;
    activateStoryMocks(resolvedMocks);
  });
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

// Monotonic id for the latest activation. Each activateMocksForStory call bumps it and
// captures its own value; a deferred ready() continuation only re-applies when its captured
// value is still the latest. Without this, the async re-apply for a story that was already
// superseded/torn down could re-install its mocks on top of the current story (SHERLO-1765 B3),
// producing a wrong-screenshot capture.
let activationGeneration = 0;

/**
 * Install `storyId`'s merged mocks, and say when they ARE installed: null when that has already
 * happened - the object form, and a story with no mocks at all - or the promise that settles
 * once it has, for declarations, whose modules are only named once their imports resolve.
 *
 * THE CALLER MUST NOT RENDER THE STORY WHILE THAT PROMISE IS OUTSTANDING. A story that renders
 * first reads the real module, and a capture that renders once and never again would record the
 * real value - which is the whole point of the mock. TestingMode holds its Storybook tree back
 * on exactly this promise.
 *
 * Global mocks still fold in later, once the preview is ready (see the file header); the
 * returned promise covers the meta/story pass, which is the one that has to beat the render -
 * the same guarantee the object form has always had by installing synchronously.
 */
export function activateMocksForStory(
  view: StorybookView,
  storyId: string | undefined
): Promise<void> | null {
  if (!storyId) return null;

  const generation = (activationGeneration += 1);

  const installing = applyStoryMocks(view, storyId);

  // If the preview has not yet composed its project (global) params, the pass above
  // saw none - re-apply once it has, so global-level mocks are included.
  const preview = getPreview(view);
  if (preview && !preview.storyStoreValue && typeof preview.ready === 'function') {
    preview.ready().then(
      () => {
        // A newer activation ran while we awaited ready() - this one is stale, so
        // re-applying now would clobber the current story's mocks. Bail out.
        if (generation !== activationGeneration) return;
        applyStoryMocks(view, storyId);
      },
      () => {
        // best effort - meta/story mocks are already active from the first pass
      }
    );
  }

  return installing;
}
