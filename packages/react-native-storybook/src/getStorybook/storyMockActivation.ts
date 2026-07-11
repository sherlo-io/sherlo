/**
 * The single path for installing ONE story's merged mock set, shared by both
 * activation entry points: the testing-capture path (TestingMode.tsx) and the
 * interactive initial-story path (interactiveMockActivation.ts). Routing both
 * through here means global-level mocks can never activate in one but not the other.
 *
 * WHY GLOBAL MOCKS NEED A SECOND PASS
 * A story's mocks are merged from three levels (global > meta > story - see
 * enumerateStories / mergeMockSet). Meta- and story-level mocks come from the story
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
import { activateStoryMocks } from '../mocking';

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

function applyStoryMocks(view: StorybookView, storyId: string): void {
  const storyMeta = enumerateStories(view).find((story) => story.id === storyId);
  activateStoryMocks(storyMeta?.mocks ?? {});
}

/**
 * Install `storyId`'s merged mock set. Meta/story mocks apply immediately; global
 * mocks fold in once the preview is ready (see file header). Safe to call before the
 * story renders - the ready() re-apply completes ahead of the render.
 */
export function activateMocksForStory(view: StorybookView, storyId: string | undefined): void {
  if (!storyId) return;

  applyStoryMocks(view, storyId);

  // If the preview has not yet composed its project (global) params, the pass above
  // saw none - re-apply once it has, so global-level mocks are included.
  const preview = getPreview(view);
  if (preview && !preview.storyStoreValue && typeof preview.ready === 'function') {
    preview.ready().then(
      () => applyStoryMocks(view, storyId),
      () => {
        // best effort - meta/story mocks are already active from the first pass
      }
    );
  }
}
