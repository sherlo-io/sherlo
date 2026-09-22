/**
 * THE TOOL'S HALF OF THE LETTERBOX - what `sherlo open` makes of what the bundler's address said.
 *
 * The address's own half is held in the SDK (`openStoryChannel.test.ts` there). What is held HERE
 * is the mapping this side owns: every answer becomes one of the named endings the screens print,
 * and so does every way of not getting an answer - a port with nothing on it, a port with something
 * else on it, a port that never replies. An unnamed ending is a stack trace in front of a developer
 * who asked to see a story.
 */
import * as http from 'http';
import { afterEach, describe, expect, it } from 'vitest';
import { liveLetterbox } from '../letterbox';
import { endingFor, storyIsOnScreen } from '../../commands/open/open';

const STORY = 'components-button--primary';

type PretendBundler = {
  port: number;
  asked: Array<{ method: string; posted: unknown }>;
  close: () => Promise<void>;
};

/** A bundler that answers the letterbox address with whatever this test wants it to say. */
async function pretendBundler(say: (posted: unknown) => unknown): Promise<PretendBundler> {
  const asked: PretendBundler['asked'] = [];

  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (request.url !== '/sherlo/letterbox') {
        response.writeHead(404);
        return response.end();
      }
      const posted = body ? JSON.parse(body) : undefined;
      asked.push({ method: request.method ?? '', posted });
      const answer = JSON.stringify(say(posted));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(answer);
    });
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));

  return {
    port: (server.address() as { port: number }).port,
    asked,
    close: () =>
      new Promise<void>((closed) => {
        // Cut any request still held open, so the server can actually close. Typed loosely
        // because older @types/node do not declare it.
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => closed());
      }),
  };
}

/** A bundler that accepts the request and then simply never answers it. */
async function silentBundler(): Promise<PretendBundler> {
  const held: http.ServerResponse[] = [];
  const server = http.createServer((_request, response) => {
    held.push(response);
  });

  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));

  return {
    port: (server.address() as { port: number }).port,
    asked: [],
    close: () =>
      new Promise<void>((closed) => {
        held.forEach((response) => response.destroy());
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => closed());
      }),
  };
}

/** A port nothing is serving on: one is opened and closed, so the number is certainly free. */
async function portWithNothingOnIt(): Promise<number> {
  const empty = await pretendBundler(() => ({}));
  await empty.close();
  return empty.port;
}

describe('the tool posting to the letterbox', () => {
  const running: PretendBundler[] = [];

  afterEach(async () => {
    while (running.length) await running.pop()!.close();
  });

  async function bundlerSaying(say: (posted: unknown) => unknown): Promise<PretendBundler> {
    const bundler = await pretendBundler(say);
    running.push(bundler);
    return bundler;
  }

  it('posts the story, the wait and the timeout, and reads back what happened to it', async () => {
    const bundler = await bundlerSaying(() => ({
      kind: 'handed-over',
      storyId: STORY,
      rendered: 'yes',
    }));

    const answer = await liveLetterbox.openStory({
      storyId: STORY,
      wait: true,
      port: bundler.port,
      timeoutSeconds: 5,
    });

    expect(bundler.asked).toEqual([
      { method: 'POST', posted: { storyId: STORY, wait: true, timeoutSeconds: 5 } },
    ]);
    expect(answer).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'yes' });
  });

  it('names the stories the app does have when it does not have the one asked for', async () => {
    const bundler = await bundlerSaying(() => ({
      kind: 'no-such-story',
      known: ['a--one', 'b--two'],
    }));

    expect(
      await liveLetterbox.openStory({
        storyId: STORY,
        wait: false,
        port: bundler.port,
        timeoutSeconds: 30,
      })
    ).toEqual({ kind: 'no-such-story', known: ['a--one', 'b--two'] });
  });

  it('a port with nothing on it is no bundler, not a crash', async () => {
    const port = await portWithNothingOnIt();

    expect(
      await liveLetterbox.openStory({ storyId: STORY, wait: false, port, timeoutSeconds: 30 })
    ).toEqual({ kind: 'no-bundler' });
  });

  it('a port serving something that is not this address has no app behind it', async () => {
    // A bundler nobody routed through Sherlo, or another server on the port entirely: something
    // answered, in words this tool cannot read, and there is no Sherlo app reachable through it.
    const somethingElse = await bundlerSaying(() => ({ hello: 'from somewhere else' }));

    expect(
      await liveLetterbox.openStory({
        storyId: STORY,
        wait: false,
        port: somethingElse.port,
        timeoutSeconds: 30,
      })
    ).toEqual({ kind: 'no-app' });
  });

  it('a bundler that never answers a wait is the same ending as a story that never drew', async () => {
    const silent = await silentBundler();
    running.push(silent);

    expect(
      await liveLetterbox.openStory({
        storyId: STORY,
        wait: true,
        port: silent.port,
        timeoutSeconds: 0.1,
      })
    ).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'timed-out' });
  });

  it('the tool reports a story that painted and threw, and still exits zero', async () => {
    const threw = { name: 'TypeError', message: "Cannot read property 'label' of undefined" };
    const bundler = await bundlerSaying(() => ({
      kind: 'handed-over',
      storyId: STORY,
      rendered: 'yes',
      threw,
    }));

    const answer = await liveLetterbox.openStory({
      storyId: STORY,
      wait: true,
      port: bundler.port,
      timeoutSeconds: 5,
    });

    // What the story itself threw, in its own words - the tool passes it along rather than
    // paraphrasing it, because the developer reading it is the one who has to go and fix it.
    expect(answer).toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'yes', threw });

    // And the ending it becomes is its own, named like every other ending this command has.
    const ending = endingFor(answer, {
      storyId: STORY,
      port: bundler.port,
      wait: true,
      seconds: 5,
    });
    expect(ending).toEqual({ kind: 'painted-and-threw', storyId: STORY, threw });

    // The story IS on screen - showing what it threw - so `sherlo open` did what it was asked and
    // exits zero. A non-zero ending here would say the tool failed, when what failed is the story.
    expect(storyIsOnScreen(ending)).toBe(true);
  });
});
