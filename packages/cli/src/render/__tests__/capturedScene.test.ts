/**
 * What `sherlo capture --scene` prints for a scene whose play could not go on: the words name what
 * the missed step looked for. Colour is off; the bytes are pinned in renderLayerLiterals.test.ts.
 */
import chalk from 'chalk';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderCapturedScene } from '../capturedScene';
import type { CapturedScene } from '../capturedScene';

beforeAll(() => {
  (chalk as unknown as { level: number }).level = 0;
});

function missedTap(tap: string): string {
  return renderCapturedScene({
    kind: 'play-target-missing',
    sceneId: 'inbox--full',
    route: ['SignIn'],
    done: [],
    missing: { tap },
    limitMs: 10_000,
  }).join('\n');
}

describe('a scene whose app crashed after it booted', () => {
  it('a scene that crashed after its app booted prints its own headline and its error', () => {
    const lines = renderCapturedScene({
      kind: 'crashed-mid-capture',
      sceneId: 'inbox--full',
      error: { name: 'TypeError', message: 'boom' },
      stillReal: ['src/api.ts'],
      unanswered: [{ method: 'GET', url: 'https://x.test/a' }],
    }).join('\n');

    expect(lines).toContain(
      '✖  inbox--full failed after it booted - the capture stopped before it finished'
    );
    expect(lines).not.toContain('never booted');
    expect(lines).toContain('TypeError: boom');
    expect(lines).toContain('src/api.ts');
    expect(lines).toContain('GET https://x.test/a');
  });

  it('a scene that crashed with no error says the app said nothing before it died', () => {
    const lines = renderCapturedScene({ kind: 'crashed-mid-capture', sceneId: 'inbox--full' });

    expect(lines.join('\n')).toContain(
      'The app said nothing before it died - a native crash, or the app was closed.'
    );
  });
});

describe('a scene whose app started over while it was captured', () => {
  const restarted = (restarts: number) =>
    renderCapturedScene({ kind: 'restarted-mid-capture', sceneId: 'inbox--full', restarts });

  it('a scene whose app started over prints the approved line, with 1 time when once, and the hint', () => {
    expect(restarted(3)[0]).toContain(
      'Scene inbox--full never finished: the app started over 3 times while Sherlo captured it'
    );
    expect(restarted(1)[0]).toContain(
      'Scene inbox--full never finished: the app started over 1 time while Sherlo captured it'
    );
    expect(restarted(1)).toContain(
      '  Add --json or --logs to see the log lines of each restart and what the bundler saw before it.'
    );
  });
});

describe('a scene that never got ready', () => {
  const neverReached = (left: object) =>
    renderCapturedScene({
      kind: 'never-reached',
      sceneId: 'inbox--full',
      ready: 'inbox',
      stayedOn: ['Home'],
      ...left,
    }).join('\n');

  it('a scene that never got ready because it threw prints the error and the requests no mock answered', () => {
    const printed = neverReached({
      threw: { name: 'UnmockedRequestError', message: 'no mock rule matches POST /graphql Me' },
      unanswered: [{ method: 'POST', url: '/graphql' }],
      stillReal: ['src/auth'],
    });

    expect(printed).toContain('  UnmockedRequestError: no mock rule matches POST /graphql Me');
    expect(printed).toContain('1 request had no mock:');
    expect(printed).toContain('POST /graphql');
    expect(printed).toContain("1 of the app's own modules ran as real code");
    expect(printed).not.toContain('logged-in');
  });

  it('a scene that never got ready and did not throw prints the logged-in hint as before', () => {
    expect(neverReached({})).toContain("Add a logged-in user to the scene's mocks.");
  });
});

describe('a discover capture lists what the scene needs', () => {
  const discovered = (left: object) =>
    renderCapturedScene({
      kind: 'never-reached',
      sceneId: 'inbox--full',
      ready: 'inbox',
      stayedOn: ['Home'],
      discover: true,
      ...left,
    }).join('\n');

  it('a discover capture prints every unanswered request as a ready-to-paste rule', () => {
    const printed = discovered({
      unanswered: [
        { method: 'GET', url: 'https://x.test/a' },
        {
          method: 'POST',
          url: '/graphql',
          operation: 'Me',
          contentType: 'application/json',
          bodyExcerpt: '{"query":"***"}',
        },
        { method: 'GET', url: 'https://x.test/a' },
        { method: 'GET', url: "https://x.test/it's" },
      ],
    });

    expect(printed).toContain('3 requests had no mock - add these rules to the scene file:');
    expect(printed).toContain(
      "mockRequest({ method: 'GET', url: 'https://x.test/a' }, { body: /* fill in */ })"
    );
    expect(printed).toContain(
      'mockRequest({ method: \'POST\', operationName: \'Me\' }, { body: /* fill in */ })  // application/json, body {"query":"***"}'
    );
    expect(printed).toContain("url: 'https://x.test/it\\'s'");
    expect(printed.split("url: 'https://x.test/a'")).toHaveLength(2);
    expect(printed.indexOf("url: 'https://x.test/a'")).toBeLessThan(
      printed.indexOf('operationName')
    );
    expect(printed).not.toContain('request had no mock:');
  });

  it('a discover capture prints the early ready view, the likely cause and each faked-answer finding', () => {
    const printed = discovered({
      likelyCause: ['unanswered-requests', 'logged-errors'],
      readyTooEarly: { atStep: 1, of: 3 },
      answerFindings: [
        { kind: 'field-missing', operation: 'Me', path: 'me.name', expected: 'String' },
        { kind: 'typename-missing', operation: 'Me', path: 'me' },
        { kind: 'typename-matches-no-fragment', operation: 'Me', path: 'me', expected: 'User' },
        { kind: 'no-query-text', operation: 'Feed' },
      ],
    });

    expect(printed).toContain('The ready view showed after step 1 of 3');
    expect(printed).toContain('Likely cause: requests no mock answered and errors the app logged.');
    expect(printed).toContain(
      'Me at me.name: the faked answer has no such field (expected String)'
    );
    expect(printed).toContain('Me at me: the faked answer has no __typename');
    expect(printed).toContain('its __typename matches no fragment of the query (expected User)');
    expect(printed).toContain('Feed: skipped, the request sent no query text');
  });

  it('a capture that is not a discover capture prints none of the discover lines', () => {
    const printed = neverReachedPlain({
      unanswered: [{ method: 'GET', url: '/a', operation: 'X' }],
      readyTooEarly: { atStep: 1, of: 3 },
      answerFindings: [{ kind: 'no-query-text' }],
    });

    expect(printed).toContain('1 request had no mock:');
    expect(printed).not.toContain('mockRequest');
    expect(printed).not.toContain('ready view showed');
    expect(printed).not.toContain('Faked answers');
  });

  function neverReachedPlain(left: object): string {
    return renderCapturedScene({
      kind: 'never-reached',
      sceneId: 'inbox--full',
      ready: 'inbox',
      stayedOn: ['Home'],
      ...left,
    }).join('\n');
  }
});

describe('a scene that was not captured, asked for with --png', () => {
  const NO_PICTURE = 'No picture saved: the scene was not captured';
  const id = 'inbox--full';
  const endings: CapturedScene[] = [
    { kind: 'no-such-scene', sceneId: id, known: [] },
    {
      kind: 'crashed-at-boot',
      sceneId: id,
      error: { name: 'Error', message: 'boom', file: 'App.tsx', line: 3 },
    },
    { kind: 'never-reached', sceneId: id, ready: 'inbox-list', stayedOn: ['SignIn'] },
    {
      kind: 'play-target-missing',
      sceneId: id,
      route: ['SignIn'],
      done: [],
      missing: { tap: 'Inbox' },
      limitMs: 10_000,
    },
    { kind: 'restarted-mid-capture', sceneId: id, restarts: 2 },
    { kind: 'no-bundler', port: 8081 },
    { kind: 'no-app', port: 8081 },
  ];

  it('a scene that was not captured says no picture was saved', () => {
    for (const ending of endings) {
      const printed = renderCapturedScene(ending, { path: 'out.png' });

      expect(printed.filter((line) => line === NO_PICTURE)).toHaveLength(1);
      expect(printed.join('\n')).not.toContain('Picture saved to');
      expect(renderCapturedScene(ending).join('\n')).not.toContain(NO_PICTURE);
    }
  });

  it('a captured scene says where its picture was saved, and a failed save says why', () => {
    const captured: CapturedScene = {
      kind: 'scene',
      sceneId: id,
      bootMs: 1000,
      reached: { route: ['Inbox'], ms: 500 },
      play: [],
      settled: { ms: 400, frames: 3 },
      tree: { primitive: 'View', components: [], children: [] },
    };

    expect(renderCapturedScene(captured, { path: 'out.png' })).toContain(
      'Picture saved to out.png'
    );
    expect(
      renderCapturedScene(captured, { path: 'out.png', error: 'no space' }).join('\n')
    ).toContain('No picture saved: no space');
  });
});

describe('the errors the app logged during a scene', () => {
  it("a scene's ending is followed by the errors the app logged, in the content's words", () => {
    const crashed = renderCapturedScene({
      kind: 'crashed-mid-capture',
      sceneId: 'inbox--full',
      loggedErrors: {
        messages: [{ message: 'Both secret and user tokens are not set', times: 1 }],
        moreLeftOut: 0,
      },
    }).join('\n');
    const never = renderCapturedScene({
      kind: 'never-reached',
      sceneId: 'inbox--full',
      ready: 'inbox',
      stayedOn: ['SignIn'],
      loggedErrors: {
        messages: [
          { message: 'TypeError: a', times: 33 },
          { message: 'b', times: 1 },
        ],
        moreLeftOut: 3,
      },
    }).join('\n');

    expect(crashed).toContain(
      'The app logged 1 different error message during this scene:\n  Both secret and user tokens are not set\n'
    );
    expect(never).toContain(
      'The app logged 5 different error messages during this scene:\n  TypeError: a (logged 33 times)\n  b\n  ... and 3 more\n'
    );
  });

  it('a scene whose app logged no errors prints no such lines', () => {
    const printed = renderCapturedScene({ kind: 'crashed-mid-capture', sceneId: 'inbox--full' });

    expect(printed.join('\n')).not.toContain('The app logged');
  });
});

describe('a scene whose play could not go on', () => {
  it('a missed tap by test id names the testID', () => {
    expect(missedTap('Inbox')).toContain('tap Inbox found no view with that testID within 10s.');
  });

  it('a missed tap by text names the text, not a testID', () => {
    const printed = missedTap('text "Row"');

    expect(printed).toContain('tap Row found no view with that text within 10s.');
    expect(printed).not.toContain('testID');
  });
});
