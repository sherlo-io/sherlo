/**
 * What helps a person or agent making scenes get one right fast: the screen the app stopped on, the
 * refused requests counted by address with the fake that answers them, the module fakes that did not
 * apply, the fields a partial left out, the last run set against this one. Colour is off; the whole
 * screens are the poses under poses/capture.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderSceneRunLine } from '../capturedAllScenes';
import { renderCapturedScene } from '../capturedScene';
import type { CapturedScene } from '../capturedScene';
import { explainRefusals, refusalLines } from '../refusalExplanation';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

function neverReached(more: Partial<Extract<CapturedScene, { kind: 'never-reached' }>>): string {
  return renderCapturedScene({
    kind: 'never-reached',
    sceneId: 'kindred--chat',
    ready: 'chat.header',
    stayedOn: ['AppStack', 'Chat'],
    ...more,
  }).join('\n');
}

const OFFLINE_CHECK = { method: 'GET', url: 'https://clients3.google.com/generate_204' };
const SUBSCRIPTIONS = {
  method: 'GET',
  url: 'https://api.adapty.io/api/v1/sdk/in-apps/purchase-containers/',
  library: 'react-native-adapty',
};

describe('requests refused by the hundred', () => {
  const refused = [OFFLINE_CHECK, ...Array.from({ length: 700 }, () => SUBSCRIPTIONS)];

  it('folds a retrying SDK into one line and hands over the rule that answers the online check', () => {
    const printed = neverReached({ unanswered: refused });

    expect(printed).toContain('701 requests had no mock, to 2 addresses');
    expect(printed).toContain(
      '700  GET https://api.adapty.io/api/v1/sdk/in-apps/purchase-containers/ from react-native-adapty'
    );
    expect(printed).toContain('The app thinks it is offline');
    expect(printed).toContain(
      "mockRequest({ url: 'https://clients3.google.com/generate_204' }, { status: 204 })"
    );
  });

  it('names the library by its host when the stack named none', () => {
    const lines = refusalLines([
      ...Array.from({ length: 10 }, () => ({
        method: 'POST',
        url: 'https://ingest.sentry.io/api/1/envelope/',
      })),
    ]);

    expect(lines?.join('\n')).toContain('from @sentry/react-native (by its host)');
  });

  it('gives one rule per host for three or more SDK hosts', () => {
    const hosts = ['api.segment.io', 'api2.amplitude.com', 'api.adapty.io', 'ingest.sentry.io'];
    const explained = explainRefusals(
      hosts.flatMap((host) =>
        Array.from({ length: 3 }, () => ({ method: 'POST', url: `https://${host}/x` }))
      )
    );

    const cause = explained?.causes.find(({ id }) => id === 'vendor-sdks-starting');
    expect(cause?.fakes).toHaveLength(4);
    expect(cause?.short).toBe('the services the app starts were refused');
  });

  it('lists a few refused requests one by one, as ever', () => {
    expect(refusalLines([OFFLINE_CHECK])).toBeUndefined();
  });
});

describe('a scene that stopped on another screen', () => {
  it('says what the screen said and, for a consent screen, the play step that taps through it', () => {
    const printed = neverReached({
      screen: { words: ['Before you continue', 'Accept all'], views: 9 },
      endedEarly: { afterMs: 4000, stuckOn: 'consent', button: 'Accept all' },
    });

    expect(printed).toContain('The screen said: "Before you continue", "Accept all"');
    expect(printed).toContain('Sherlo stopped after 4.0s');
    expect(printed).toContain('play: [{ tap: { label: "Accept all" } }]');
    expect(printed).not.toContain('Nothing faked who is logged in');
  });

  it('says the logged-in user is missing when the screen is a sign-in', () => {
    const printed = neverReached({ endedEarly: { afterMs: 4000, stuckOn: 'sign-in' } });

    expect(printed).toContain('Nothing faked who is logged in');
  });

  it('keeps the stock sign-in hint only when nothing else explains the stop', () => {
    expect(neverReached({})).toContain('Nothing faked who is logged in');
    expect(neverReached({ screen: { words: ['Hi'], views: 1 } })).not.toContain(
      'Nothing faked who is logged in'
    );
  });

  it('says a blank screen drew no views and points at the logs', () => {
    const printed = neverReached({ screen: { words: [], views: 0 } });

    expect(printed).toContain('The screen drew no views.');
    expect(printed).toContain('sherlo capture --scene kindred--chat --logs');
  });

  it('saves the picture of a stopped scene whose screen was read, and of no other', () => {
    const picture = { path: './out.png' };

    const withScreen = renderCapturedScene(
      {
        kind: 'never-reached',
        sceneId: 'a',
        ready: 'r',
        stayedOn: ['Home'],
        screen: { words: [], views: 0 },
      },
      picture
    ).join('\n');
    const without = renderCapturedScene(
      { kind: 'never-reached', sceneId: 'a', ready: 'r', stayedOn: ['Home'] },
      picture
    ).join('\n');

    expect(withScreen).toContain('Picture saved to ./out.png');
    expect(without).toContain('No picture saved: the scene was not captured');
  });
});

describe('what a scene left behind', () => {
  it('names a module fake that did not apply, with the reason when known', () => {
    const printed = neverReached({
      mockNotApplied: [{ module: 'components/chat/client', why: 'bundler-had-not-seen-it' }],
    });

    expect(printed).toContain('1 module fake declared, did not apply:');
    expect(printed).toContain('components/chat/client');
    expect(printed).toContain('the bundler had not seen the module when it started: restart it');
  });

  it('lists every partial field the scene does not name, then pastes them in one block', () => {
    const printed = neverReached({
      loggedErrors: {
        messages: ['isAnonymous', 'ageRange'].map((field) => ({
          message: `A scene read "${field}" of a partial object, and the scene does not name it. Add it to the partial.`,
          times: 1,
        })),
        moreLeftOut: 0,
      },
    });

    expect(printed).toContain(
      '2 fields were read of a partial object that the scene does not name:'
    );
    expect(printed).toContain('isAnonymous: /* fill in */,\n     ageRange: /* fill in */,');
    expect(printed).not.toContain('different error message');
  });

  it('names the object whose __typename is missing and pastes it', () => {
    const printed = neverReached({
      answerFindings: [
        {
          kind: 'typename-missing',
          operation: 'AccountHome',
          path: 'profile.photos.0',
          expected: 'Picture',
        },
      ],
    });

    expect(printed).toContain(
      'AccountHome at profile.photos.0: the mock answer has no __typename (expected Picture)'
    );
    expect(printed).toContain("__typename: 'Picture',");
  });

  it('says where the app threw, which fake gave the wrong shape, and the fix', () => {
    const printed = neverReached({
      threw: {
        name: 'TypeError',
        message: 'Invalid attempt to destructure non-iterable instance',
        file: 'src/hooks/useIdentity.ts',
        line: 325,
      },
      crashCause: { dataPath: 'account.profiles.0.ageRange', gave: 'object', appExpects: 'list' },
    });

    expect(printed).toContain('at src/hooks/useIdentity.ts:325');
    expect(printed).toContain(
      'A fake gave account.profiles.0.ageRange as an object, and the app reads it as a list.'
    );
    expect(printed).toContain('Fix: give account.profiles.0.ageRange as a list');
  });

  it('says what changed since the last run, only the rows that changed', () => {
    const printed = neverReached({
      stayedOn: ['ChatStack', 'ChatList'],
      lastRun: { ending: 'never-reached', route: ['ChatStack', 'ChatList'], refused: 0 },
      unanswered: [{ method: 'GET', url: '/a' }],
    });

    expect(printed).toContain('Since the last run of this scene:');
    expect(printed).toContain('refused  was 0, now 1');
    expect(printed).not.toContain('route');
  });

  it('warns that requests let through to the real network make the picture unsteady, with the rules to fake them', () => {
    const printed = renderCapturedScene({
      kind: 'scene',
      sceneId: 'a',
      bootMs: 1,
      reached: { route: ['Home'], ms: 1 },
      play: [],
      settled: { ms: 1, frames: 1 },
      tree: { primitive: 'View', components: [], children: [] },
      letThrough: [{ method: 'GET', url: 'https://api.kindred.example/v1/feed' }],
    }).join('\n');

    expect(printed).toContain('1 real request was made, so the picture may change between runs');
    expect(printed).toContain(
      "mockRequest({ method: 'GET', url: 'https://api.kindred.example/v1/feed' }"
    );
  });

  it('says before the scene runs that a phone setting was not written', () => {
    const [first] = renderCapturedScene({
      kind: 'never-reached',
      sceneId: 'a',
      ready: 'r',
      stayedOn: ['Home'],
      phoneNotApplied: [{ setting: 'tracking', wanted: 'granted', why: 'app-not-installed' }],
    });

    expect(first).toContain('The scene asks for tracking: granted');
    expect(first).toContain('the app is not installed there yet');
  });
});

describe('a bundle that does not build', () => {
  it('shows the place, the code frame and the tsconfig teaching line', () => {
    const printed = renderCapturedScene({
      kind: 'bundle-does-not-build',
      sceneId: 'a',
      failure: {
        kind: 'unresolved-import',
        message: 'Unable to resolve "scenes/mocks/flags"',
        file: 'src/screens/Chat/Chat.scenes.tsx',
        line: 11,
        column: 23,
        frame: ["> 11 | import { flags } from 'scenes/mocks/flags';"],
        importPath: 'scenes/mocks/flags',
        knownToTheTypeCheck: 'baseUrl "src"',
      },
    }).join('\n');

    expect(printed).toContain('src/screens/Chat/Chat.scenes.tsx:11:23');
    expect(printed).toContain("> 11 | import { flags } from 'scenes/mocks/flags';");
    expect(printed).toContain('Metro does not read tsconfig.json.');
  });
});

describe('a run of every scene', () => {
  it('warns once, on the scene that fails the way the one before did, with the fake', () => {
    const [line, warning, fake] = renderSceneRunLine({
      sceneId: 'b',
      ending: 'never-reached',
      refused: 1,
      sameCause: {
        remaining: 4,
        cause: 'the app thinks it is offline',
        fake: "mockRequest({ url: 'x' }, { status: 204 })",
      },
    });

    expect(line).toContain('never reached');
    expect(warning).toContain('4 more scenes may fail the same way: the app thinks it is offline');
    expect(fake).toContain('mockRequest');
  });

  it('gives the launch, ready and settle timings of a captured scene', () => {
    const [line] = renderSceneRunLine({
      sceneId: 'a',
      ending: 'scene',
      launchMs: 1400,
      readyMs: 2100,
      settledMs: 600,
      refused: 0,
    });

    expect(line).toContain('launched in 1.4s · ready in 2.1s · settled in 0.6s');
  });
});
