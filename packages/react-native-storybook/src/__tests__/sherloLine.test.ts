/**
 * THE SHERLO LINE - the server half of the app's connection (metro/sherloLine.js), over real
 * sockets on this machine's loopback: an app that says hello, and drivers that ask, either over a
 * socket of their own (the bundler's relay, which `sherlo open` and `sherlo capture` use) or in the
 * same process (`line.ask`).
 *
 * The line is mounted on a plain http server with `ws`'s own WebSocketServer, as the runner mounts
 * it; how the bundler mounts it is applySherloTransforms.test.ts's.
 */
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
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
async function startALine(settings?: { appHoldMs?: number; warn?: (message: string) => void }) {
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
 * TypeScript says about it. `yarn typecheck` skips tests, so a test makes this check itself.
 */
function typeErrorsIn(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-line-types-'));
  const sourcePath = path.join(root, 'caller.ts');
  fs.writeFileSync(sourcePath, source, 'utf8');

  const typesFolder = path.dirname(path.dirname(require.resolve('@types/ws/package.json')));
  const program = ts.createProgram([sourcePath], {
    noEmit: true,
    strict: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    skipLibCheck: true,
    typeRoots: [typesFolder],
    types: ['node'],
    baseUrl: root,
    paths: { ws: [path.join(typesFolder, 'ws')] },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  fs.rmSync(root, { recursive: true, force: true });

  return diagnostics
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
    .join('\n');
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

  it('a driver before any app ever waited is told there is no app', async () => {
    const running = await startALine();
    const driver = await connectADriver(running);

    await expect(
      driver.ask({ action: 'captureStory', storyId: STORY, settings: SETTINGS })
    ).resolves.toEqual({ kind: 'no-app' });
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
