/**
 * THE LETTERBOX AND AN APP THAT CANNOT LIST ITS STORIES - on Storybook's default setup an app
 * showing itself has no Storybook loaded, so it says `stories: null` ("not known"), which is not
 * `[]` ("an app with no stories"). The letterbox cannot check a story against a list it was not
 * given, so it hands the story over and lets the next list it gets settle the question.
 *
 * Driven directly against the middleware with minimal request/response doubles, the way the
 * capture relay is in captureSocketRelay.test.ts: no real HTTP socket, no bundler.
 */
import { describe, expect, it } from 'vitest';
import { createOpenStoryLetterbox } from '../../metro/openStoryLetterbox.js';
import { fakeRequest as requestTo, fakeRes, noop } from './__mocks__/fakeBundlerExchange';

const STORY = 'components-button--primary';
const OTHER_STORY = 'components-button--secondary';

describe('opening a story on an app that cannot list its stories', () => {
  it('an app that cannot list its stories leaves the story check to the story browser', () => {
    const { middleware } = createOpenStoryLetterbox();

    // The app shows itself and cannot list its stories. The first PUT is answered at once with
    // nothing to hand over, so it holds.
    middleware(fakeRequest('PUT', appSays(null, false)), fakeRes(), noop);

    // The tool asks for a story the app might not have, and waits for it to be painted.
    const toolRes = fakeRes();
    middleware(fakeRequest('POST', { storyId: STORY, wait: true }), toolRes, noop);
    expect(toolRes.written()).toBe(false);

    // The app comes back at the story browser, lists its stories, and the story is not among them.
    const appRes = fakeRes();
    middleware(fakeRequest('PUT', appSays([OTHER_STORY], true)), appRes, noop);

    expect(toolRes.json()).toEqual({ kind: 'no-such-story', known: [OTHER_STORY] });

    // The story is forgotten: the next app to ask is handed nothing.
    const nextAppRes = fakeRes();
    middleware(fakeRequest('PUT', appSays([OTHER_STORY], true)), nextAppRes, noop);
    expect(nextAppRes.written()).toBe(false);
  });

  it('hands the story to the app at the story browser when it is among the stories it lists', () => {
    const { middleware } = createOpenStoryLetterbox();

    middleware(fakeRequest('PUT', appSays(null, false)), fakeRes(), noop);

    const toolRes = fakeRes();
    middleware(fakeRequest('POST', { storyId: STORY, wait: true }), toolRes, noop);

    const appRes = fakeRes();
    middleware(fakeRequest('PUT', appSays([STORY], true)), appRes, noop);

    expect(appRes.json()).toEqual({ storyId: STORY });
    expect(toolRes.written()).toBe(false);
  });

  it('CONTROL: an app that lists no stories at all still gets no-such-story at once', () => {
    const { middleware } = createOpenStoryLetterbox();

    middleware(fakeRequest('PUT', appSays([], false)), fakeRes(), noop);

    const toolRes = fakeRes();
    middleware(fakeRequest('POST', { storyId: STORY, wait: true }), toolRes, noop);

    expect(toolRes.json()).toEqual({ kind: 'no-such-story', known: [] });
  });
});

/* ========================================================================== */

/** What an app says in its PUT: the stories it lists (null when it cannot) and where it stands. */
function appSays(stories: string[] | null, atTheStoryBrowser: boolean) {
  return { stories, atTheStoryBrowser, showing: null, threw: null };
}

function fakeRequest(method: string, body: unknown) {
  return requestTo(method, '/sherlo/letterbox', body);
}
