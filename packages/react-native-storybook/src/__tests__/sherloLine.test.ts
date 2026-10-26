/**
 * THE SHERLO LINE - the server half of the app's connection (metro/sherloLine.js), over real
 * sockets on this machine's loopback: an app that says hello, and drivers that ask, either over a
 * socket of their own (the bundler's relay, which `sherlo open` and `sherlo capture` use) or in the
 * same process (`line.ask`).
 *
 * The line is mounted on a plain http server with `ws`'s own WebSocketServer, as the runner mounts
 * it; how the bundler mounts it is applySherloTransforms.test.ts's.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SherloLine } from '../../metro/sherloLine';

const { attach, LINE_PATH, PROTOCOL_VERSION } = require('../../metro/sherloLine.js');
const ws = require('ws');
const WebSocketServer = ws.WebSocketServer || ws.Server;

const STORY = 'components-button--primary';
const OTHER_STORY = 'components-button--secondary';
const SETTINGS = { requiredMatches: 3, minScreenshotsCount: 6, intervalMs: 500, timeoutMs: 20000 };

type Message = Record<string, any>;

/** Everything a test opened, closed after it. */
const toCloseAfterTheTest: Array<() => void> = [];

afterEach(() => {
  toCloseAfterTheTest.splice(0).forEach((close) => close());
});

/* ---- The line, an app and a driver ---------------------------------------------------------- */

/** A line on a fresh server on loopback, and a way to wait until it heard an app say something. */
async function startALine(settings?: {
  appHoldMs?: number;
  warn?: (message: string) => void;
  storyFileChangedSince?: (time: number) => boolean;
}) {
  const server = http.createServer();
  const line: SherloLine = attach(server, WebSocketServer, settings);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  toCloseAfterTheTest.push(() => server.close());

  const heardWaiters: Array<{ action: string; resolve: () => void }> = [];
  line.onApp((app) =>
    app.onMessage((message) => {
      const index = heardWaiters.findIndex((waiter) => waiter.action === message.action);
      if (index !== -1) heardWaiters.splice(index, 1)[0].resolve();
    })
  );

  return {
    line,
    port: (server.address() as AddressInfo).port,
    /** Resolves once the line hears an app's next message of `action`. Call before it is sent. */
    nextHeard(action: string): Promise<void> {
      return new Promise((resolve) => heardWaiters.push({ action, resolve }));
    },
  };
}

type RunningLine = Awaited<ReturnType<typeof startALine>>;

/** A socket on the line, and every message it is sent, to be taken in order. */
async function openSocket(port: number) {
  const socket = new ws(`ws://127.0.0.1:${port}${LINE_PATH}`);
  toCloseAfterTheTest.push(() => socket.terminate());
  await new Promise((resolve) => socket.once('open', resolve));

  const received: Message[] = [];
  const waiters: Array<{ matches: (message: Message) => boolean; resolve: (m: Message) => void }> =
    [];
  socket.on('message', (data: unknown) => {
    const message = JSON.parse(String(data));
    const index = waiters.findIndex((waiter) => waiter.matches(message));
    if (index === -1) received.push(message);
    else waiters.splice(index, 1)[0].resolve(message);
  });

  return {
    socket,
    send: (message: Message) => socket.send(JSON.stringify(message)),
    /** The first message sent to this socket that matches, now or once it arrives. */
    next(matches: (message: Message) => boolean): Promise<Message> {
      const index = received.findIndex(matches);
      if (index !== -1) return Promise.resolve(received.splice(index, 1)[0]);
      return new Promise((resolve) => waiters.push({ matches, resolve }));
    },
  };
}

/** An app on the line: it says hello, and waits for `sherlo open` and `sherlo capture`. */
async function connectAnApp(running: RunningLine) {
  const app = await openSocket(running.port);
  app.send({
    action: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    nativeVersion: '3.0.0',
    jsVersion: '3.0.0',
  });

  /** Send one of the app's messages, and resolve once the line has heard it. */
  async function say(message: Message): Promise<void> {
    const heard = running.nextHeard(message.action);
    app.send(message);
    await heard;
  }

  return {
    waitsForAStory: (saying: Message) => say({ action: 'waitForStory', ...saying }),
    waitsForACapture: (saying: Message) => say({ action: 'waitForACapture', ...saying }),
    logs: (line: string) => say({ action: 'log', line }),
    /** The JavaScript starts again on this same connection, as it does after a reload. */
    startsItsJavaScript: () => say({ action: 'JS_EVAL_COMPLETE' }),
    /** The app's socket closes. */
    leaves: () => app.socket.close(),
    /** The polyfill's word that this app's JavaScript died as it started. */
    startFails: (error: Message) => say({ action: 'start-failed', ...error }),
    /** The letterbox's next answer to this app, without its action. */
    nextLetterboxAnswer: () => app.next((m) => m.action === 'letterboxAnswer').then(withoutAction),
    /** The capture relay's next answer to this app, without its action. */
    nextCaptureInstruction: () =>
      app.next((m) => m.action === 'captureInstruction').then(withoutAction),
  };
}

/** A driver on a socket of its own, as `sherlo open` and `sherlo capture` are. */
async function connectADriver(running: RunningLine) {
  const driver = await openSocket(running.port);
  let questionsAsked = 0;

  function ask(question: Message): Promise<Message> {
    questionsAsked += 1;
    const askId = String(questionsAsked);
    driver.send({ ...question, askId });
    return driver.next((m) => m.action === 'reply' && m.askId === askId).then((m) => m.reply);
  }

  return {
    ask,
    /** Resolves once the line has taken every question asked before: it answers them in order. */
    settled: () => ask({ action: 'whatIsOnScreen' }).then(() => undefined),
  };
}

function withoutAction({ action: _action, ...rest }: Message): Message {
  return rest;
}

/** What an app says as it waits for a story: the stories it lists (null when it cannot) and where it stands. */
function appSays(
  stories: string[] | null,
  atTheStoryBrowser: boolean,
  showing: string | null = null
) {
  return { stories, atTheStoryBrowser, showing, threw: null };
}

/**
 * Type-check `source` as a file of its own, with `ws`'s and Node's types in reach, and return what
 * the TypeScript compiler (run as a program, `tsc`) says about it. `yarn typecheck` skips tests, so
 * a test makes this check itself.
 */
function typeErrorsIn(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-line-types-'));
  fs.writeFileSync(path.join(root, 'caller.ts'), source, 'utf8');

  const typesFolder = path.dirname(path.dirname(require.resolve('@types/ws/package.json')));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      files: ['caller.ts'],
      compilerOptions: {
        noEmit: true,
        strict: true,
        esModuleInterop: true,
        target: 'ES2018',
        module: 'ESNext',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        typeRoots: [typesFolder],
        types: ['node'],
        paths: { ws: [path.join(typesFolder, 'ws')] },
      },
    }),
    'utf8'
  );

  const compilerFile = path.join(
    path.dirname(require.resolve('typescript/package.json')),
    'bin/tsc'
  );
  try {
    execFileSync(process.execPath, [compilerFile, '--project', root, '--pretty', 'false'], {
      encoding: 'utf8',
    });
    return '';
  } catch (failure) {
    return (failure as { stdout: string }).stdout;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const LINE_MODULE = path.resolve(__dirname, '../../metro/sherloLine');

/* ---- The tests ------------------------------------------------------------------------------ */

describe('the Sherlo line', () => {
  it("the bundler's relay and an in-process driver are two callers of the same line", async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The driver on its own socket opens a story, and the app is handed it.
    await app.waitsForAStory(appSays([STORY, OTHER_STORY], true));
    await expect(driver.ask({ action: 'openStory', storyId: STORY })).resolves.toEqual({
      kind: 'handed-over',
      storyId: STORY,
      rendered: 'not-waited',
    });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: STORY });

    // A driver in the same process sees what that one did.
    await app.waitsForAStory(appSays([STORY, OTHER_STORY], true, STORY));
    await expect(running.line.ask({ action: 'whatIsOnScreen' })).resolves.toEqual({
      kind: 'showing',
      storyId: STORY,
    });

    // And the other way round: what the driver in the same process opens, the socket's sees.
    await expect(running.line.ask({ action: 'openStory', storyId: OTHER_STORY })).resolves.toEqual({
      kind: 'handed-over',
      storyId: OTHER_STORY,
      rendered: 'not-waited',
    });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: OTHER_STORY });
    await app.waitsForAStory(appSays([STORY, OTHER_STORY], true, OTHER_STORY));
    await expect(driver.ask({ action: 'whatIsOnScreen' })).resolves.toEqual({
      kind: 'showing',
      storyId: OTHER_STORY,
    });
  });

  it('a hello whose protocol version the line does not speak is refused, naming both versions', async () => {
    const warn = vi.fn();
    const running = await startALine({ warn });
    const appsHeardOf = vi.fn();
    running.line.onApp(appsHeardOf);

    const app = await openSocket(running.port);
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      app.socket.once('close', (code: number, reason: unknown) =>
        resolve({ code, reason: String(reason) })
      )
    );
    app.send({ action: 'hello', protocolVersion: 2, nativeVersion: '9.0.0', jsVersion: null });

    const { code, reason } = await closed;
    expect(code).toBe(4001);
    expect(reason).toBe("Sherlo's line speaks protocol 1, and the app said hello in protocol 2.");
    expect(warn).toHaveBeenCalledWith(reason);
    expect(appsHeardOf).not.toHaveBeenCalled();
  });

  it('requires no file and no package: another program keeps a byte copy of it', () => {
    const lineSource = fs.readFileSync(path.join(__dirname, '../../metro/sherloLine.js'), 'utf8');

    expect(lineSource).not.toMatch(/\brequire\s*\(/);
    expect(lineSource).not.toMatch(/^\s*import\b/m);
  });

  it("the ws package's own server class is accepted by attach's types with no cast", () => {
    const typeErrors = typeErrorsIn(`
      import * as http from 'http';
      import { WebSocketServer } from 'ws';
      import { attach } from '${LINE_MODULE}';

      attach(http.createServer(), WebSocketServer);
    `);

    expect(typeErrors).toBe('');
  });

  it('CONTROL: the type check refuses a class that is no WebSocket server', () => {
    const typeErrors = typeErrorsIn(`
      import * as http from 'http';
      import { attach } from '${LINE_MODULE}';

      class NotAServer {}
      attach(http.createServer(), NotAServer);
    `);

    expect(typeErrors).not.toBe('');
  });

  it('CONTROL: a hello in the protocol the line speaks makes the socket an app', async () => {
    const running = await startALine();
    const appsHeardOf = vi.fn();
    running.line.onApp(appsHeardOf);

    const app = await connectAnApp(running);
    await app.waitsForAStory(appSays([STORY], true));

    expect(appsHeardOf).toHaveBeenCalledOnce();
    expect(appsHeardOf.mock.calls[0][0].hello).toEqual({
      action: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      nativeVersion: '3.0.0',
      jsVersion: '3.0.0',
    });
  });

  it('a socket that never said hello is no app: what it says as one goes nowhere', async () => {
    const running = await startALine();
    const notYetAnApp = await openSocket(running.port);

    notYetAnApp.send({ action: 'waitForStory', ...appSays([STORY], true) });
    // The same socket then says hello and a log line: once the line hears the log line, it has
    // taken the wait before them, in order.
    const heardTheLogLine = running.nextHeard('log');
    notYetAnApp.send({
      action: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      nativeVersion: '3.0.0',
      jsVersion: null,
    });
    notYetAnApp.send({ action: 'log', line: 'after the hello' });
    await heardTheLogLine;

    await expect(running.line.ask({ action: 'whatIsOnScreen' })).resolves.toEqual({
      kind: 'no-app',
    });
  });
});

describe('opening a story on an app that cannot list its stories', () => {
  it('an app that cannot list its stories leaves the story check to the story browser', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The app shows itself and cannot list its stories.
    await app.waitsForAStory(appSays(null, false));

    // The driver asks for a story the app might not have, and waits for it to be drawn. The app is
    // sent to the story browser to collect it.
    const reply = driver.ask({ action: 'openStory', storyId: STORY, wait: true });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ goToTheStoryBrowser: true });

    // The app comes back at the story browser, lists its stories, and the story is not among them.
    await app.waitsForAStory(appSays([OTHER_STORY], true));
    await expect(reply).resolves.toEqual({ kind: 'no-such-story', known: [OTHER_STORY] });

    // The story is forgotten: the app's next wait is handed nothing, and holds until the next
    // story is asked for.
    await app.waitsForAStory(appSays([OTHER_STORY], true));
    await running.line.ask({ action: 'openStory', storyId: OTHER_STORY });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: OTHER_STORY });
  });

  it('hands the story to the app at the story browser when it is among the stories it lists', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.waitsForAStory(appSays(null, false));
    const reply = driver.ask({ action: 'openStory', storyId: STORY, wait: true });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ goToTheStoryBrowser: true });

    await app.waitsForAStory(appSays([STORY], true));
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: STORY });

    // The driver is answered only once the app says it drew the story.
    await app.waitsForAStory(appSays([STORY], true, STORY));
    await expect(reply).resolves.toEqual({ kind: 'handed-over', storyId: STORY, rendered: 'yes' });
  });

  it('CONTROL: an app that lists no stories at all still gets no-such-story at once', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.waitsForAStory(appSays([], false));

    await expect(driver.ask({ action: 'openStory', storyId: STORY, wait: true })).resolves.toEqual({
      kind: 'no-such-story',
      known: [],
    });
  });

  it('a wait from the JavaScript started after a reload replaces the one before it on the same connection', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The JavaScript waits, then is reloaded; the new JavaScript waits on the same connection.
    await app.waitsForAStory(appSays([STORY], true));
    await app.waitsForAStory(appSays([STORY], true));

    await driver.ask({ action: 'openStory', storyId: STORY });

    // One answer, for the JavaScript listening now - not a second one, to a wait nobody hears: the
    // answer after it is the next story's.
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: STORY });
    await app.waitsForAStory(appSays([STORY, OTHER_STORY], true, STORY));
    await running.line.ask({ action: 'openStory', storyId: OTHER_STORY });
    await expect(app.nextLetterboxAnswer()).resolves.toEqual({ storyId: OTHER_STORY });
  });
});

describe('the relay hands the restart a story to land on, from whichever side asked for it first', () => {
  it('carries the story when the tool was already waiting and the app arrives not yet in testing mode', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // An app has to have waited at least once before a driver is anything but "no-app": a wait
    // that carries an answer is answered at once and holds nothing, which is enough for that.
    await app.waitsForACapture({ mode: 'default', stories: [STORY], answer: { kind: 'captured' } });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({});

    // The driver asks first. No app is waiting, so it waits.
    void driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await driver.settled();

    // Now the app arrives, not in testing mode, and finds the driver already waiting.
    await app.waitsForACapture({ mode: 'default', stories: [STORY], answer: null });

    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: STORY,
    });
  });

  it('carries the story when the app was already held and the tool arrives not yet in testing mode', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The app arrives first and waits for a capture.
    await app.waitsForACapture({ mode: 'default', stories: [STORY], answer: null });

    // The driver's question finds that waiting app directly - the other way to the same order.
    void driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });

    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: STORY,
    });
  });

  it('carries no story when the app is already in testing mode - there is nothing to restart into', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });
    const reply = driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });

    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      storyId: STORY,
      settings: SETTINGS,
    });

    // The app's next wait carries the answer, and the driver is handed it.
    const answer = { kind: 'crashed', storyId: STORY };
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer });
    await expect(reply).resolves.toEqual(answer);
  });

  it('hands the app a scene asked for as a scene as its sceneId, and a story as its storyId', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    const SCENE = 'inbox--full';

    // An app not yet in testing mode reloads onto the scene, the way it lands on a story.
    await app.waitsForACapture({ mode: 'default', stories: [STORY], answer: null });
    void driver.ask({ action: 'captureStory', sceneId: SCENE, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: SCENE,
    });

    // Back in testing mode it is handed the scene as a scene, never checked against its stories.
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: { kind: 'captured' } });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({});

    // A story is still handed as a story.
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });
    void driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      storyId: STORY,
      settings: SETTINGS,
    });
  });

  it("refuses a scene the app's bundle does not hold once the app is in testing mode, naming the scenes it holds", async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    const HELD = ['home--welcome', 'inbox--full'];
    const MISSING = 'inbox--menu-open';

    // An app not yet in testing mode reloads first: the reload brings the bundle as it is now.
    await app.waitsForACapture({ mode: 'default', stories: null, scenes: HELD, answer: null });
    const reply = driver.ask({ action: 'captureStory', sceneId: MISSING, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: MISSING,
    });

    // Back in testing mode on a bundle that still lacks it, the scene is never handed over.
    await app.waitsForACapture({ mode: 'testing', stories: null, scenes: HELD, answer: null });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({});
    await expect(reply).resolves.toEqual({ kind: 'no-such-story', known: HELD });
  });
});

describe('a capture of an app whose story files changed after its code loaded', () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 30));

  /** A line told of one story file on disk, as the bundler tells it. */
  async function startALineWatchingAStoryFile() {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-line-story-'));
    toCloseAfterTheTest.push(() => fs.rmSync(folder, { recursive: true, force: true }));
    const storyFile = path.join(folder, 'Button.stories.tsx');
    fs.writeFileSync(storyFile, 'export default {};\n');
    const running = await startALine({
      storyFileChangedSince: (time: number) => fs.statSync(storyFile).mtimeMs > time,
    });
    return { running, storyFile };
  }

  it("a capture asked after a story file changed since the app's code loaded reloads the app into testing mode first", async () => {
    const { running, storyFile } = await startALineWatchingAStoryFile();
    await pause();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });

    await pause();
    fs.writeFileSync(storyFile, 'export default { title: "Edited" };\n');
    const reply = driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });

    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: STORY,
    });
    void reply;
  });

  it("a capture with no story file changed since the app's code loaded walks the story at once", async () => {
    const { running } = await startALineWatchingAStoryFile();
    await pause();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });

    void driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });

    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      storyId: STORY,
      settings: SETTINGS,
    });
  });

  it('the app that comes back from the reload is not reloaded again', async () => {
    const { running, storyFile } = await startALineWatchingAStoryFile();
    await pause();
    const firstApp = await connectAnApp(running);
    const driver = await connectADriver(running);
    await firstApp.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });

    await pause();
    fs.writeFileSync(storyFile, 'export default { title: "Edited" };\n');
    void driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await expect(firstApp.nextCaptureInstruction()).resolves.toMatchObject({
      restartIntoTesting: true,
    });

    // The reloaded JavaScript starts on the same connection, after the edit: native code says no
    // second hello, only the JavaScript's own start message.
    await pause();
    await firstApp.startsItsJavaScript();
    await firstApp.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });

    await expect(firstApp.nextCaptureInstruction()).resolves.toEqual({
      storyId: STORY,
      settings: SETTINGS,
    });
  });
});

describe('a capture of an app that cannot list its stories', () => {
  it('a capture of an app that cannot list its stories is checked after the restart', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The app shows itself and cannot list its stories (null, not []). It waits.
    await app.waitsForACapture({ mode: 'default', stories: null, answer: null });

    // The driver asks: the story cannot be checked yet, so the app is told to move with it.
    const reply = driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: STORY,
    });

    // The app is back in testing mode, lists its stories, and the story is not among them.
    await app.waitsForACapture({ mode: 'testing', stories: [OTHER_STORY], answer: null });

    await expect(reply).resolves.toEqual({ kind: 'no-such-story', known: [OTHER_STORY] });
  });

  it('CONTROL: an app that lists no stories at all still gets no-such-story at once', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.waitsForACapture({ mode: 'default', stories: [], answer: null });

    await expect(
      driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS })
    ).resolves.toEqual({ kind: 'no-such-story', known: [] });
  });

  it('the story files the app says threw as it loaded ride unchanged with the no-such-story answer', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    const brokenFiles = [
      { file: './src/Bad.stories.tsx', error: { name: 'TypeError', message: 'boom' } },
    ];

    await app.waitsForACapture({ mode: 'default', stories: [], brokenFiles, answer: null });

    await expect(
      driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS })
    ).resolves.toEqual({ kind: 'no-such-story', known: [], brokenFiles });
  });

  it('the relay names only the broken file whose recorded title is the asked story id title part', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    const error = { name: 'TypeError', message: 'boom' };

    // The id's title part names neither file; only the recorded title ties the id to Cart.
    await app.waitsForACapture({
      mode: 'default',
      stories: [],
      brokenFiles: [
        { file: './src/Cart.stories.tsx', title: 'Shop/Checkout', error },
        { file: './src/Other.stories.tsx', title: 'Other', error },
      ],
      answer: null,
    });

    await expect(
      driver.ask({ action: 'captureStory', storyId: 'shop-checkout--primary', settings: SETTINGS })
    ).resolves.toEqual({
      kind: 'no-such-story',
      known: [],
      brokenFiles: [{ file: './src/Cart.stories.tsx', error }],
    });
  });

  it('every broken file is named when none has the title of the story asked for, without its title', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);
    const error = { name: 'TypeError', message: 'boom' };

    await app.waitsForACapture({
      mode: 'default',
      stories: [],
      brokenFiles: [
        { file: './src/Cart.stories.tsx', title: 'Shop/Checkout', error },
        { file: './src/Unread.stories.tsx', error },
      ],
      answer: null,
    });

    await expect(
      driver.ask({ action: 'captureStory', storyId: 'nowhere--primary', settings: SETTINGS })
    ).resolves.toEqual({
      kind: 'no-such-story',
      known: [],
      brokenFiles: [
        { file: './src/Cart.stories.tsx', error },
        { file: './src/Unread.stories.tsx', error },
      ],
    });
  });

  it('a driver before any app ever waited is told there is no app', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);

    await expect(
      driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS })
    ).resolves.toEqual({ kind: 'no-app' });
  });
});

describe('captures asked one after another on one bundler, each of the app it launched', () => {
  const SCENE = 'inbox--full';
  const LAST_RECORD = { kind: 'scene', sceneId: SCENE, bootMs: 1 };
  const NEW_RECORD = { kind: 'scene', sceneId: SCENE, bootMs: 2 };
  const START_ERROR = { name: 'TypeError', message: 'undefined is not a function' };

  /** A wait of an app in testing mode with this scene in its bundle. */
  const waitInTesting = (answer: Message | null) => ({
    mode: 'testing',
    stories: null,
    scenes: [SCENE],
    answer,
  });

  /** Long enough for the clock to move past the last hello. */
  const aMoment = () => new Promise((resolve) => setTimeout(resolve, 5));

  /** The driver's reply when the line answers it at once, or 'parked' when it keeps it waiting. */
  function replyOrParked(
    reply: Promise<Message>,
    driver: Awaited<ReturnType<typeof connectADriver>>
  ): Promise<Message | 'parked'> {
    return Promise.race([reply, driver.settled().then(() => 'parked' as const)]);
  }

  it("a second capture on one bundler is paired with the app it launched, not the first capture's leftovers", async () => {
    const running = await startALine();
    let hellos = 0;
    running.line.onApp(() => (hellos += 1));
    const driver = await connectADriver(running);

    // The first capture: the app it launched is handed the scene, and answers with its record.
    const firstLaunchedAt = Date.now();
    const firstApp = await connectAnApp(running);
    await firstApp.waitsForACapture(waitInTesting(null));
    const firstReply = driver.ask({
      action: 'captureStory',
      sceneId: SCENE,
      settings: SETTINGS,
      launchedAt: firstLaunchedAt,
    });
    await expect(firstApp.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });
    await firstApp.waitsForACapture(waitInTesting(LAST_RECORD));
    await expect(firstReply).resolves.toEqual(LAST_RECORD);
    await expect(firstApp.nextCaptureInstruction()).resolves.toEqual({});

    // The first app comes back for the next capture: its process is stopped, its socket not closed.
    await firstApp.waitsForACapture(waitInTesting(null));

    // The second capture launches the app again. Until the launched app waits, there is no app yet,
    // as on the first try: the first app's wait is no wait of the launched one.
    await aMoment();
    const launchedAt = Date.now();
    const question = {
      action: 'captureStory',
      sceneId: SCENE,
      settings: SETTINGS,
      launchedAt,
    };
    await expect(replyOrParked(driver.ask(question), driver)).resolves.toEqual({ kind: 'no-app' });

    // The launched app waits, then the first app's wait lands late, the retry of a wait that failed.
    const secondApp = await connectAnApp(running);
    await secondApp.waitsForACapture(waitInTesting(null));
    await firstApp.waitsForACapture(waitInTesting(null));
    const secondReply = driver.ask(question);
    await expect(secondApp.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });

    // The first app says its last answer again: it is no answer to the capture the second walks.
    await firstApp.waitsForACapture(waitInTesting(LAST_RECORD));
    await expect(firstApp.nextCaptureInstruction()).resolves.toEqual({});
    await secondApp.waitsForACapture(waitInTesting(NEW_RECORD));
    await expect(secondReply).resolves.toEqual(NEW_RECORD);

    // One launch per capture, and the second app was never told to reload.
    expect(hellos).toBe(2);
  });

  it('a start failure of an app from before the launch is no crash of the launched app', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);
    const earlierApp = await connectAnApp(running);
    await earlierApp.startFails(START_ERROR);

    await aMoment();
    const question = { action: 'captureStory', sceneId: SCENE, launchedAt: Date.now() };
    await expect(driver.ask(question)).resolves.toEqual({ kind: 'no-app' });

    const launchedApp = await connectAnApp(running);
    await launchedApp.waitsForACapture(waitInTesting(null));
    void driver.ask(question);
    await expect(launchedApp.nextCaptureInstruction()).resolves.toEqual({ sceneId: SCENE });
  });

  it('CONTROL: a capture that names no launch is paired with whichever app waits, as before', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);
    const app = await connectAnApp(running);
    await app.waitsForACapture(waitInTesting(null));

    await aMoment();
    void driver.ask({ action: 'captureStory', sceneId: SCENE, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });
  });
});

describe('a capture of an app whose JavaScript died as it started', () => {
  const START_ERROR = { name: 'TypeError', message: 'undefined is not a function' };

  it("a capture asked of an app whose start failed is answered crashed with the app's error at once", async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The app never reached a wait: its JavaScript died first, and only the polyfill spoke.
    await app.startFails(START_ERROR);

    await expect(
      driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS })
    ).resolves.toEqual({ kind: 'crashed', storyId: STORY, error: START_ERROR });
  });

  it("a capture asked before the app's start error arrives is answered as soon as it does", async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    // The capture moves the app into testing mode; the JavaScript it restarts dies as it starts.
    await app.waitsForACapture({ mode: 'default', stories: null, answer: null });
    const reply = driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await app.nextCaptureInstruction();
    await app.startFails(START_ERROR);

    await expect(reply).resolves.toEqual({ kind: 'crashed', storyId: STORY, error: START_ERROR });
  });

  it('CONTROL: an app whose JavaScript reached a wait again is captured, not answered crashed', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.startFails(START_ERROR);
    // The developer fixed the error and the app reloaded: the JavaScript running now is alive.
    await app.waitsForACapture({ mode: 'testing', stories: [STORY], answer: null });

    driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS });
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      storyId: STORY,
      settings: SETTINGS,
    });
  });
});

describe("the app's log lines land in the feed for the next reader", () => {
  it('hands a reader every line posted so far, oldest first', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);
    const driver = await connectADriver(running);

    await app.logs('first line');
    await app.logs('second line');

    await expect(driver.ask({ action: 'readLogLines' })).resolves.toEqual({
      lines: ['first line', 'second line'],
    });
  });

  it('the feed is drained by a read, not merely peeked - a second read finds nothing left over', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);

    await app.logs('only line');
    await running.line.ask({ action: 'readLogLines' });

    await expect(running.line.ask({ action: 'readLogLines' })).resolves.toEqual({ lines: [] });
  });

  it('a reader before anything was ever posted finds an empty feed, not an error', async () => {
    const running = await startALine();

    await expect(running.line.ask({ action: 'readLogLines' })).resolves.toEqual({ lines: [] });
  });

  it('drops the oldest lines once the cap is reached', async () => {
    const running = await startALine();
    const app = await connectAnApp(running);

    for (let lineNumber = 1; lineNumber < 1001; lineNumber += 1) {
      void app.logs(`line ${lineNumber}`);
    }
    await app.logs('line 1001');

    const { lines } = (await running.line.ask({ action: 'readLogLines' })) as { lines: string[] };
    expect(lines).toHaveLength(1000);
    expect(lines[0]).toBe('line 2');
    expect(lines[999]).toBe('line 1001');
  });
});

describe('a scene capture whose app starts over after taking its instruction', () => {
  const SCENE = 'inbox--full';
  const inMode = (mode: string) => ({ mode, stories: null, scenes: [SCENE], answer: null });
  const launch = { action: 'captureStory', sceneId: SCENE, settings: SETTINGS, launchedAt: 1 };

  /** What a driver that gave up reads off the feed: the lines, and the restarts counted. */
  async function readFeed(running: RunningLine) {
    return (await running.line.ask({ action: 'readLogLines' })) as {
      lines: string[];
      restarts?: number;
    };
  }
  const feedLines = async (running: RunningLine) => (await readFeed(running)).lines;

  it("a capture whose app says hello again after taking the instruction is counted as a restart, with the bundler's own cause when it has one", async () => {
    const running = await startALine();
    const driver = await connectADriver(running);
    const app = await connectAnApp(running);
    await app.waitsForACapture(inMode('default'));
    void driver.ask(launch);
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      restartIntoTesting: true,
      storyId: SCENE,
    });

    // The bundler asked for this restart: the app was not in testing mode.
    await app.startsItsJavaScript();
    await app.waitsForACapture(inMode('testing'));
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });

    // Nobody asked for this one: the app took the scene and started over.
    await app.startsItsJavaScript();
    await app.waitsForACapture(inMode('testing'));
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });

    // The capture is given up: the read of the feed carries what the bundler counted.
    const { lines, restarts } = await readFeed(running);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('restart 1');
    expect(lines[0]).toContain('the bundler asked for it');
    expect(lines[0]).toContain('default');
    expect(lines[1]).toContain('restart 2');
    expect(lines[1]).toContain('the bundler did not ask for it');
    expect(restarts).toBe(2);
  });

  it('an app that leaves after taking the instruction is counted once, and a capture without a restart is not blamed on one', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);
    const app = await connectAnApp(running);
    await app.waitsForACapture(inMode('testing'));
    await expect(readFeed(running)).resolves.toEqual({ lines: [] });

    void driver.ask(launch);
    await expect(app.nextCaptureInstruction()).resolves.toEqual({
      sceneId: SCENE,
      settings: SETTINGS,
    });
    app.leaves();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const feed = await readFeed(running);
    expect(feed.lines).toHaveLength(1);
    expect(feed.restarts).toBe(1);
  });

  it('files the bundler sees change while a scene capture waits are written on the feed, by path under the project root', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);
    const app = await connectAnApp(running);
    await app.waitsForACapture(inMode('testing'));

    running.line.filesChanged(['src/before.ts']);
    void driver.ask(launch);
    await app.nextCaptureInstruction();
    running.line.filesChanged(['src/inbox/Inbox.scene.tsx']);

    expect(await feedLines(running)).toEqual([
      expect.stringContaining('src/inbox/Inbox.scene.tsx'),
    ]);
  });
});
