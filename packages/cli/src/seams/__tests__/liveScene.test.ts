/**
 * THE LIVE HALF OF A SCENE - what `sherlo capture --scene` and `sherlo open --scene` do against a
 * bundler with the Sherlo line on it, and a device that only records what it was told to run.
 */
import * as http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  attach,
  LINE_PATH,
  PROTOCOL_VERSION,
} from '../../../../react-native-storybook/metro/sherloLine';
import type { WebSocketServerClass } from '../../../../react-native-storybook/metro/sherloLine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STABILIZATION_SETTINGS } from '../bundlerLine';
import { liveCaptureSocket } from '../captureSocket';
import { liveLetterbox } from '../letterbox';
import { captureLiveScene, readSceneAnswer } from '../liveScene';
import { installDeviceState, posedDeviceState } from '../deviceState';
import type { NoTarget, SceneTarget } from '../deviceState';
import { renderCapturedScene } from '../../render/capturedScene';
import { renderOpenedScene } from '../../render/openedScene';
import { renderCapturedLog } from '../../render/capturedLog';
import { capturedSceneEnding } from '../../commands/capture/capture';
import { openedSceneEnding } from '../../commands/open/open';

const SCENE = 'chat--conversation';
const PHONE: SceneTarget = {
  device: { platform: 'ios', udid: 'UDID-1' },
  app: { id: 'com.example.chat' },
};
const ANDROID: SceneTarget = {
  device: { platform: 'android', serial: 'emulator-5554' },
  app: { id: 'com.example.chat' },
};
const NO_PHONE: NoTarget = { cause: 'no-phone', found: [] };

/** What the app records for a scene that came up, in the app's own words. */
const SCENE_RECORD = {
  kind: 'scene',
  sceneId: SCENE,
  bootMs: 1800,
  reached: { route: ['ChatStack', 'Chat'], ms: 900 },
  play: [{ tap: 'chat-row' }, { open: 'chat://room/1' }],
  settled: { ms: 1500, frames: 6 },
  tree: { primitive: 'RCTView', components: [], children: [] },
};

/** What a pretend bundler's `say` returns for a question the line never answers. */
const NO_ANSWER = Symbol('no answer');

type Bundler = { port: number; asked: unknown[]; close: () => Promise<void> };
const open: Bundler[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((bundler) => bundler.close()));
});

/** Whether a question the pretend bundler heard is the capture's own, not the feed being read. */
const isTheCapture = (question: unknown) =>
  (question as { action?: string }).action === 'captureStory';

/** A bundler with the line on it, answering every question as `say` decides. */
async function pretendBundler(
  say: (question: { action: string }) => unknown,
  closeWith?: number,
  breakOnly?: string
): Promise<Bundler> {
  const asked: unknown[] = [];
  const server = http.createServer((request, response) => {
    if (request.url !== '/sherlo/line') {
      response.writeHead(404);
      return response.end();
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ protocolVersion: 1 }));
  });
  const sockets = new WebSocketServer({ server, path: '/sherlo/line' });
  sockets.on('connection', (socket) => {
    socket.on('message', (data) => {
      // A line that breaks on the question closes the socket with the code it was given.
      const { askId, ...question } = JSON.parse(data.toString());
      if (closeWith !== undefined && (breakOnly === undefined || question.action === breakOnly)) {
        return socket.close(closeWith);
      }
      asked.push(question);
      const reply = say(question);
      if (reply === NO_ANSWER) return;
      socket.send(JSON.stringify({ action: 'reply', askId, reply }));
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));

  const bundler: Bundler = {
    port: (server.address() as { port: number }).port,
    asked,
    close: () =>
      new Promise<void>((closed) => {
        sockets.clients.forEach((socket) => socket.terminate());
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => closed());
      }),
  };
  open.push(bundler);
  return bundler;
}

/** What the phone prints for the launcher activity of the example app. */
const LAUNCHER_ANSWER =
  'priority=0 preferredOrder=0 match=0x108000\ncom.example.chat/.ChatActivity\n';

/**
 * A device that records every command it is told to run and answers each with nothing, except what
 * `answers` gives for a command that contains the key.
 */
function recordingDevice(answers: Record<string, string> = {}): {
  ran: string[];
  uninstall: () => void;
} {
  const ran: string[] = [];
  const uninstall = installDeviceState({
    ...posedDeviceState(),
    run: async (tool, args) => {
      const command = `${tool} ${args.join(' ')}`;
      ran.push(command);
      const key = Object.keys(answers).find((part) => command.includes(part));
      return key ? answers[key] : '';
    },
  });
  return { ran, uninstall };
}

/** A device whose launch of the app runs `launch`, as the app's start on a real phone does. */
function launchingDevice(launch: () => Promise<void>): () => void {
  return installDeviceState({
    ...posedDeviceState(),
    run: async (tool, args) => {
      if (tool === 'xcrun' && args[1] === 'launch') await launch();
      return '';
    },
  });
}

/** A bundler with the real Sherlo line on it. */
async function realLine(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((request, response) => {
    response.writeHead(request.url === LINE_PATH ? 200 : 404, {
      'Content-Type': 'application/json',
    });
    response.end(JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  });
  attach(server, WebSocketServer as unknown as WebSocketServerClass);
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  return {
    port: (server.address() as { port: number }).port,
    close: () => {
      (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      server.close();
    },
  };
}

type Instruction = Record<string, unknown>;

/** An app that said hello on the line, handing each capture instruction it gets to `told`. */
async function appOnTheLine(
  port: number,
  told: (instruction: Instruction) => void
): Promise<{ say: (message: Record<string, unknown>) => void; leave: () => void }> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${LINE_PATH}`);
  socket.on('message', (data) => {
    const { action, ...rest } = JSON.parse(data.toString());
    if (action === 'captureInstruction') told(rest);
  });
  await new Promise((opened) => socket.once('open', opened));
  const say = (message: Record<string, unknown>) => socket.send(JSON.stringify(message));
  say({
    action: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    nativeVersion: 'test',
    jsVersion: null,
  });
  return { say, leave: () => socket.terminate() };
}

/** An app's wait for a capture, in `mode`, with the scene in its bundle. */
function waitForACapture(mode: string, answer: unknown) {
  return { action: 'waitForACapture', mode, stories: [SCENE], scenes: [SCENE], answer };
}

/** Long enough for what an app sent to land on the line. */
const landed = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('a scene is captured and opened live', () => {
  it('capture --scene boots, plays, settles and prints the signed picture', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice();

    let answer;
    try {
      answer = await liveCaptureSocket.captureScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    // The app is launched fresh with the scene's id in the launch, before anything is asked of it.
    expect(ran).toEqual([
      'xcrun simctl terminate UDID-1 com.example.chat',
      'xcrun simctl get_app_container UDID-1 com.example.chat',
      `xcrun simctl launch UDID-1 com.example.chat -sherloCapture ${SCENE}`,
    ]);
    // The scene is asked for as a scene, so the line hands the app a scene to walk.
    expect(bundler.asked[0]).toEqual({ action: 'readLogLines' });
    expect(bundler.asked[1]).toMatchObject({ action: 'captureStory', sceneId: SCENE });
    expect(bundler.asked[1]).not.toHaveProperty('storyId');

    const screen = renderCapturedScene(capturedSceneEnding(answer, bundler.port)).join('\n');
    expect(screen).toContain('captured, the way a test run records it');
    expect(screen).toContain('played tap chat-row');
    expect(screen).toContain('played open chat://room/1');
    expect(screen).toContain('reached ChatStack › Chat');
    expect(screen).toContain('settled in 1.5s over 6 frames');
  });

  it('open --scene shows the scene and prints the signed picture', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });

    let answer;
    try {
      answer = await liveLetterbox.openScene({
        sceneId: SCENE,
        port: bundler.port,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    const start = ran.find((command) => command.includes('am start'));
    expect(start).toContain(`--es sherloCapture ${SCENE}`);

    const screen = renderOpenedScene(
      openedSceneEnding(answer, { sceneId: SCENE, port: bundler.port })
    );
    expect(screen.join('\n')).toContain(`${SCENE} is on screen, booted fresh at ChatStack › Chat`);
  });

  it("a scene's log lines are Sherlo's own, at most 1000, emptied on each read", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: ['12:00:00: chat opened'] } : SCENE_RECORD
    );
    const { uninstall } = recordingDevice();

    let answer;
    try {
      answer = await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    expect(answer.logs).toEqual(['12:00:00: chat opened']);
    expect(renderCapturedLog(answer.logs ?? []).join('\n')).toContain('12:00:00: chat opened');
  });

  it('the errors the app logged are kept with the record, and a malformed entry is dropped', () => {
    const crashed = readSceneAnswer(
      {
        kind: 'crashed',
        loggedErrors: {
          messages: [{ message: 'no token', times: 2 }, { message: 7 }, null],
          moreLeftOut: 1,
        },
      },
      SCENE
    );

    expect(crashed).toMatchObject({
      loggedErrors: { messages: [{ message: 'no token', times: 2 }], moreLeftOut: 1 },
    });
    expect(readSceneAnswer({ kind: 'crashed', loggedErrors: 'x' }, SCENE)).not.toHaveProperty(
      'loggedErrors'
    );
  });

  it('a scene that crashed after its app booted is never read as one that never booted', () => {
    const crashed = readSceneAnswer(
      {
        kind: 'crashed',
        error: { name: 'TypeError', message: 'boom', stack: 'at start (/app/index.js:12:3)' },
        threw: { name: 'TypeError', message: 'boom' },
        stillReal: ['src/api.ts'],
        unanswered: [{ method: 'GET', url: 'https://x.test/a' }],
      },
      SCENE
    );

    expect(crashed).toEqual({
      kind: 'crashed-mid-capture',
      sceneId: SCENE,
      error: { name: 'TypeError', message: 'boom' },
      threw: { name: 'TypeError', message: 'boom' },
      stillReal: ['src/api.ts'],
      unanswered: [{ method: 'GET', url: 'https://x.test/a' }],
    });
    expect(readSceneAnswer({ kind: 'crashed' }, SCENE)).toEqual({
      kind: 'crashed-mid-capture',
      sceneId: SCENE,
    });
  });

  it('a scene the app does not have and a missing ready view each end in their own words', () => {
    expect(readSceneAnswer({ kind: 'no-such-story', known: ['a--b'] }, SCENE)).toEqual({
      kind: 'no-such-scene',
      sceneId: SCENE,
      known: ['a--b'],
    });
    expect(
      readSceneAnswer({ kind: 'never-reached', ready: 'chat-list', stayedOn: ['Auth'] }, SCENE)
    ).toEqual({
      kind: 'never-reached',
      sceneId: SCENE,
      ready: 'chat-list',
      stayedOn: ['Auth'],
    });
  });

  it("a captured scene's answer keeps the phone's density and font scale", () => {
    const ending = readSceneAnswer({ ...SCENE_RECORD, density: 2.625, fontScale: 1.3 }, SCENE);

    expect(ending).toMatchObject({ kind: 'scene', density: 2.625, fontScale: 1.3 });
    expect(readSceneAnswer(SCENE_RECORD, SCENE)).not.toHaveProperty('density');
  });

  it('the test ids on screen reach the json reply of a scene that never got ready', () => {
    const seen = { testIDs: ['inbox-list', 'row-1'], more: 4 };

    expect(
      readSceneAnswer({ kind: 'never-reached', ready: 'inbox', stayedOn: ['Home'], seen }, SCENE)
    ).toEqual({ kind: 'never-reached', sceneId: SCENE, ready: 'inbox', stayedOn: ['Home'], seen });
    expect(
      readSceneAnswer({ kind: 'never-reached', ready: 'inbox', stayedOn: ['Home'], seen: 7 }, SCENE)
    ).not.toHaveProperty('seen');
  });

  it('every scene ending read from the app keeps what it threw, what ran real and what no mock answered', () => {
    const left = {
      threw: { name: 'UnmockedRequestError', message: 'no mock rule matches POST /graphql Me' },
      stillReal: ['src/auth'],
      unanswered: [{ method: 'POST', url: '/graphql' }],
    };

    expect(
      readSceneAnswer({ kind: 'never-reached', ready: 'inbox', stayedOn: ['Home'], ...left }, SCENE)
    ).toMatchObject({ kind: 'never-reached', ...left });
    expect(
      readSceneAnswer(
        { kind: 'play-target-missing', route: [], done: [], missing: { tap: 'a' }, ...left },
        SCENE
      )
    ).toMatchObject({ kind: 'play-target-missing', ...left });
    expect(readSceneAnswer({ ...SCENE_RECORD, ...left }, SCENE)).toMatchObject({
      kind: 'scene',
      ...left,
    });
    expect(
      readSceneAnswer({ ...SCENE_RECORD, settled: 'timed-out', ready: 'x', ...left }, SCENE)
    ).toMatchObject({ kind: 'never-reached', ...left });
    expect(readSceneAnswer(SCENE_RECORD, SCENE)).not.toHaveProperty('threw');
    expect(readSceneAnswer(SCENE_RECORD, SCENE)).not.toHaveProperty('unanswered');
  });

  it('a missing long-press step is read back as a long-press, not as a tap', () => {
    const answer = readSceneAnswer(
      { kind: 'play-target-missing', route: [], done: [], missing: { longPress: 'row' } },
      SCENE
    );

    expect(answer).toMatchObject({ kind: 'play-target-missing', missing: { longPress: 'row' } });
    expect(answer).not.toHaveProperty('missing.tap');
  });

  it('a scene whose ready wait timed out ends as never got ready, never as settled', () => {
    const ending = readSceneAnswer(
      { ...SCENE_RECORD, settled: 'timed-out', ready: 'chat-list' },
      SCENE
    );

    expect(ending).toEqual({
      kind: 'never-reached',
      sceneId: SCENE,
      ready: 'chat-list',
      stayedOn: ['ChatStack', 'Chat'],
    });
  });

  it('the app is handed the scene as a scene, and answers with the scene record', async () => {
    const line = await realLine();
    const told: Instruction[] = [];
    let app: Awaited<ReturnType<typeof appOnTheLine>> | undefined;

    // The launched app lists its scenes as its stories, as the START snapshot does, and waits.
    const uninstall = launchingDevice(async () => {
      app = await appOnTheLine(line.port, (instruction) => {
        told.push(instruction);
        if (instruction.sceneId) app?.say(waitForACapture('testing', SCENE_RECORD));
      });
      app.say(waitForACapture('testing', null));
      await landed();
    });
    try {
      const ending = await captureLiveScene({
        sceneId: SCENE,
        port: line.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
      // The core walks a scene only when handed it as `sceneId`: as a story it is never walked.
      expect(told[0]).toEqual({ sceneId: SCENE, settings: STABILIZATION_SETTINGS });
      expect(ending).toMatchObject({ kind: 'scene', sceneId: SCENE });
    } finally {
      uninstall();
      app?.leave();
      line.close();
    }
  });

  it('a capture whose app reloads into testing mode is still paired and captured', async () => {
    const line = await realLine();

    // The app the last capture launched: stopped, but its socket not closed yet. Whatever it is
    // handed, it answers with the last capture's record.
    const LAST_RECORD = { ...SCENE_RECORD, bootMs: 99999 };
    const leftover = await appOnTheLine(line.port, (instruction) => {
      if (instruction.sceneId) leftover.say(waitForACapture('testing', LAST_RECORD));
    });
    leftover.say(waitForACapture('testing', null));
    await landed();

    // The launched app starts out of testing mode, so the line reloads it there: its JavaScript
    // starts again on the same socket, and waits in testing mode.
    const told: Instruction[] = [];
    let launched: Awaited<ReturnType<typeof appOnTheLine>> | undefined;
    const uninstall = launchingDevice(async () => {
      launched = await appOnTheLine(line.port, (instruction) => {
        told.push(instruction);
        if (instruction.restartIntoTesting) {
          launched?.say({ action: 'JS_EVAL_COMPLETE' });
          launched?.say(waitForACapture('testing', null));
        } else if (instruction.sceneId) {
          launched?.say(waitForACapture('testing', SCENE_RECORD));
        }
      });
      launched.say(waitForACapture('default', null));
      await landed();
      // The leftover's wait lands after the launched app's: the retry of a wait that failed.
      leftover.say(waitForACapture('testing', null));
      await landed();
    });
    try {
      const ending = await captureLiveScene({
        sceneId: SCENE,
        port: line.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
      expect(ending).toMatchObject({ kind: 'scene', sceneId: SCENE, bootMs: SCENE_RECORD.bootMs });
      // One launch, one reload into testing mode, then the scene.
      expect(told.slice(0, 2)).toEqual([
        { restartIntoTesting: true, storyId: SCENE },
        { sceneId: SCENE, settings: STABILIZATION_SETTINGS },
      ]);
    } finally {
      uninstall();
      leftover.leave();
      launched?.leave();
      line.close();
    }
  });

  it('a command with no device ends as no app attached, without asking the bundler', async () => {
    const bundler = await pretendBundler(() => SCENE_RECORD);

    const answer = await captureLiveScene({
      sceneId: SCENE,
      port: bundler.port,
      settings: STABILIZATION_SETTINGS,
      target: NO_PHONE,
    });

    expect(answer).toEqual({ kind: 'no-app', why: 'no-phone', found: [] });
    expect(bundler.asked).toEqual([]);
  });

  it('a capture with no target says whether no phone, several phones or no app id was found', async () => {
    const bundler = await pretendBundler(() => SCENE_RECORD);
    const phones = [
      { platform: 'ios' as const, appId: 'com.example.chat', hasApp: false },
      { platform: 'android' as const, appId: 'com.example.chat', hasApp: false },
    ];
    const causes: NoTarget[] = [
      NO_PHONE,
      { cause: 'several-phones', found: phones },
      { cause: 'no-app-id', found: [{ platform: 'ios', hasApp: false }] },
    ];

    for (const cause of causes) {
      const answer = await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: cause,
      });
      expect(answer).toEqual({ kind: 'no-app', why: cause.cause, found: cause.found });
    }
    expect(bundler.asked).toEqual([]);
  });

  it("a scene's log lines hold none of the scene before it, and a broken line keeps the lines the app sent", async () => {
    const settings = STABILIZATION_SETTINGS;
    // The feed holds a line the scene before it left; each read of it drains it.
    const feed = ['the scene before it'];
    const say = (question: { action: string }) =>
      question.action === 'readLogLines' ? { lines: feed.splice(0) } : SCENE_RECORD;
    // The app's launch sends a line, as the app does once it starts.
    const uninstall = launchingDevice(async () => {
      feed.push('the app launched now');
    });
    try {
      const fine = await pretendBundler(say);
      const scene = await captureLiveScene({
        sceneId: SCENE,
        port: fine.port,
        settings,
        target: PHONE,
      });
      expect(scene).toMatchObject({ kind: 'scene', logs: ['the app launched now'] });

      // The line answers outside Sherlo's words to the capture alone; the feed still reads.
      feed.push('the scene before it');
      const broken = await pretendBundler(say, 4001, 'captureStory');
      expect(
        await captureLiveScene({ sceneId: SCENE, port: broken.port, settings, target: PHONE })
      ).toEqual({
        kind: 'no-app',
        why: 'line-broke',
        detail: 'the socket closed with code 4001',
        logs: ['the app launched now'],
      });
    } finally {
      uninstall();
    }
  });

  it('a capture with no app names whether the phone had no target, the line broke, or the app never said hello', async () => {
    const settings = STABILIZATION_SETTINGS;
    const { uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });
    try {
      // No target: the phone has nothing to launch on.
      const quiet = await pretendBundler(() => ({ kind: 'no-app' }));
      expect(
        await captureLiveScene({ sceneId: SCENE, port: quiet.port, settings, target: NO_PHONE })
      ).toEqual({ kind: 'no-app', why: 'no-phone', found: [] });

      // The line broke: its socket closes on the question, and the close code is kept.
      const broken = await pretendBundler(() => ({ kind: 'no-app' }), 4001);
      expect(
        await captureLiveScene({ sceneId: SCENE, port: broken.port, settings, target: ANDROID })
      ).toEqual({
        kind: 'no-app',
        why: 'line-broke',
        detail: 'the socket closed with code 4001',
      });

      // The app never said hello: the line keeps saying no app until the hello wait is over.
      // Each look at the clock is 40 seconds later than the last, so the hello wait runs out.
      let now = 0;
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 40_000));
      try {
        expect(
          await captureLiveScene({ sceneId: SCENE, port: quiet.port, settings, target: ANDROID })
        ).toEqual({ kind: 'no-app', why: 'never-said-hello' });
      } finally {
        clock.mockRestore();
      }
    } finally {
      uninstall();
    }
  });

  it('a capture that ends with no app or gave up waiting carries the stage lines the app logged', async () => {
    const settings = STABILIZATION_SETTINGS;
    const stage = '@sherlo/react-native-storybook: scene chat--conversation capture asked for';
    const { uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });
    try {
      // The app never said hello, yet the feed holds the lines it logged.
      const silent = await pretendBundler((question) =>
        question.action === 'readLogLines' ? { lines: [stage] } : { kind: 'no-app' }
      );
      let now = 0;
      const clock = vi.spyOn(Date, 'now').mockImplementation(() => (now += 40_000));
      try {
        expect(
          await captureLiveScene({ sceneId: SCENE, port: silent.port, settings, target: ANDROID })
        ).toEqual({ kind: 'no-app', why: 'never-said-hello', logs: [stage] });
      } finally {
        clock.mockRestore();
      }

      // The wait ran out: the lines are carried the same way.
      const slow = await pretendBundler((question) =>
        question.action === 'readLogLines' ? { lines: [stage] } : NO_ANSWER
      );
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const ending = captureLiveScene({
          sceneId: SCENE,
          port: slow.port,
          settings,
          target: ANDROID,
        });
        // Let the real sockets carry the question, then let the patience run out.
        while (!slow.asked.some(isTheCapture)) await new Promise((next) => setImmediate(next));
        await vi.advanceTimersByTimeAsync(130_000);
        expect(await ending).toEqual({ kind: 'no-app', why: 'gave-up-waiting', logs: [stage] });
      } finally {
        vi.useRealTimers();
      }
    } finally {
      uninstall();
    }
  });

  it('a capture that gave up after its app restarted ends as restarted mid-capture, not no app', async () => {
    const stage =
      'Sherlo bundler: the app took the capture instruction for inbox--full and started over (restart 3). Sherlo did not ask for it.';
    const { uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });
    try {
      // The app took the instruction and started over; the capture is never answered.
      const looping = await pretendBundler((question) =>
        question.action === 'readLogLines' ? { lines: [stage], restarts: 3 } : NO_ANSWER
      );
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const ending = captureLiveScene({
          sceneId: SCENE,
          port: looping.port,
          settings: STABILIZATION_SETTINGS,
          target: ANDROID,
        });
        while (!looping.asked.some(isTheCapture)) await new Promise((next) => setImmediate(next));
        await vi.advanceTimersByTimeAsync(130_000);
        const restarted = {
          kind: 'restarted-mid-capture',
          sceneId: SCENE,
          restarts: 3,
          logs: [stage],
        };
        expect(await ending).toEqual(restarted);
        const printed = renderCapturedScene(capturedSceneEnding(restarted as never, 8081));
        expect(printed.join('\n')).toContain('started over 3 times');
      } finally {
        vi.useRealTimers();
      }
    } finally {
      uninstall();
    }
  });

  it("an iOS capture of an Expo development build opens the bundler's bundle through the development launcher's link", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      get_app_container: '/Devices/UDID-1/Bundle/Application/X/Chat.app\n',
      plutil: '{\n  "CFBundleURLSchemes" => [\n    0 => "exp+chat"\n  ]\n}\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    const url = encodeURIComponent(`http://localhost:${bundler.port}`);
    expect(ran).toContain(
      `xcrun simctl launch UDID-1 com.example.chat --initialUrl exp+chat://expo-development-client/?url=${url} -sherloCapture ${SCENE}`
    );
  });

  it('a discover capture launches the app with the discover flag on both platforms', async () => {
    const launched: Record<string, string[]> = {};
    for (const [platform, target] of [
      ['ios', PHONE],
      ['android', ANDROID],
    ] as const) {
      const bundler = await pretendBundler((question) =>
        question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
      );
      const { ran, uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });
      try {
        await captureLiveScene({
          sceneId: SCENE,
          port: bundler.port,
          settings: STABILIZATION_SETTINGS,
          target,
          discover: true,
        });
      } finally {
        uninstall();
      }
      launched[platform] = ran;
    }

    expect(launched.ios).toContain(
      `xcrun simctl launch UDID-1 com.example.chat -sherloCapture ${SCENE} -sherloDiscover YES`
    );
    expect(launched.android.join('\n')).toContain(
      `--es sherloCapture ${SCENE} --ez sherloDiscover true`
    );
  });

  it('a capture that is not a discover capture adds no discover flag to the launch', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice();
    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    expect(ran.join('\n')).not.toContain('sherloDiscover');
  });

  it('a scene answer keeps the early ready view, likely cause, answer findings and request details', () => {
    const request = {
      method: 'POST',
      url: '/graphql',
      contentType: 'application/json',
      operation: 'Chat',
      bodyExcerpt: '{"q":"***"}',
    };
    const ending = readSceneAnswer(
      {
        kind: 'never-reached',
        ready: 'chat-ready',
        stayedOn: ['Chat'],
        likelyCause: ['unanswered-requests', 'nonsense'],
        readyTooEarly: { atStep: 1, of: 2 },
        answerFindings: [
          { kind: 'field-missing', operation: 'Chat', path: 'chat.id' },
          { kind: 'bogus' },
        ],
        unanswered: [request],
      },
      SCENE
    );

    expect(ending).toMatchObject({
      likelyCause: ['unanswered-requests'],
      readyTooEarly: { atStep: 1, of: 2 },
      answerFindings: [{ kind: 'field-missing', operation: 'Chat', path: 'chat.id' }],
      unanswered: [request],
    });
  });

  it('an iOS capture of an app with no development launcher starts it as before', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      get_app_container: '/Devices/UDID-1/Bundle/Application/X/Chat.app\n',
      plutil: '{\n  "CFBundleURLSchemes" => [\n    0 => "chat"\n  ]\n}\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    expect(ran).toContain(`xcrun simctl launch UDID-1 com.example.chat -sherloCapture ${SCENE}`);
    expect(ran.join('\n')).not.toContain('--initialUrl');
  });

  it('an Android capture launch is a main launcher start so a development build reopens its bundle', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({ 'resolve-activity': LAUNCHER_ANSWER });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    expect(ran[0]).toContain('resolve-activity');
    expect(ran).toContain(
      `adb -s emulator-5554 shell am start -n com.example.chat/.ChatActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --es sherloCapture ${SCENE}`
    );
    expect(ran.join('\n')).not.toContain('-p com.example.chat');
  });

  it("an Android capture of an Expo development build opens the bundler's bundle through the development launcher's link", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'dumpsys package':
        'Activity expo.modules.devlauncher.launcher.DevLauncherActivity\n  Scheme: "exp+chat"\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    const url = encodeURIComponent(`http://localhost:${bundler.port}`);
    expect(ran).toContain(`adb -s emulator-5554 reverse tcp:${bundler.port} tcp:${bundler.port}`);
    expect(ran).toContain(
      `adb -s emulator-5554 shell am start -n com.example.chat/.ChatActivity -a android.intent.action.VIEW -d 'exp+chat://expo-development-client/?url=${url}' --es sherloCapture ${SCENE}`
    );
  });

  it('an Android capture of an app with no development launcher starts it as before', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'dumpsys package': 'Activity com.example.chat.ChatActivity\n  Scheme: "chat"\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    expect(ran.join('\n')).not.toContain('reverse');
    expect(ran).toContain(
      `adb -s emulator-5554 shell am start -n com.example.chat/.ChatActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --es sherloCapture ${SCENE}`
    );
  });

  it("an iOS clean-device start of an Expo development build marks the developer menu's first-run sheet as seen", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      get_app_container: '/Devices/UDID-1/Bundle/Application/X/Chat.app\n',
      plutil: '{\n  "CFBundleURLSchemes" => [\n    0 => "exp+chat"\n  ]\n}\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    const mark =
      'xcrun simctl spawn UDID-1 defaults write com.example.chat EXDevMenuIsOnboardingFinished -bool YES';
    const launch = ran.findIndex((command) => command.startsWith('xcrun simctl launch'));
    expect(ran.indexOf(mark)).toBeGreaterThan(-1);
    expect(ran.indexOf(mark)).toBeLessThan(launch);
    expect(ran.filter((command) => command.includes('defaults write'))).toEqual([
      mark,
      'xcrun simctl spawn UDID-1 defaults write com.example.chat EXDevMenuShowsAtLaunch -bool NO',
      'xcrun simctl spawn UDID-1 defaults write com.example.chat EXDevMenuShowFloatingActionButton -bool NO',
    ]);
  });

  it("an iPhone scene launch writes the dev menu's Tools button off before it launches", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      get_app_container: '/Devices/UDID-1/Bundle/Application/X/Chat.app\n',
      plutil: '{\n  "CFBundleURLSchemes" => [\n    0 => "exp+chat"\n  ]\n}\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    const hide =
      'xcrun simctl spawn UDID-1 defaults write com.example.chat EXDevMenuShowFloatingActionButton -bool NO';
    const launch = ran.findIndex((command) => command.startsWith('xcrun simctl launch'));
    expect(ran.indexOf(hide)).toBeGreaterThan(-1);
    expect(ran.indexOf(hide)).toBeLessThan(launch);
  });

  it('an iOS clean-device start of an Expo development build keeps the developer menu closed at launch', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      get_app_container: '/Devices/UDID-1/Bundle/Application/X/Chat.app\n',
      plutil: '{\n  "CFBundleURLSchemes" => [\n    0 => "exp+chat"\n  ]\n}\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
    } finally {
      uninstall();
    }

    const hide =
      'xcrun simctl spawn UDID-1 defaults write com.example.chat EXDevMenuShowsAtLaunch -bool NO';
    const launch = ran.findIndex((command) => command.startsWith('xcrun simctl launch'));
    expect(ran.indexOf(hide)).toBeGreaterThan(-1);
    expect(ran.indexOf(hide)).toBeLessThan(launch);
  });

  it('an Android clean-device start of an Expo development build keeps the developer menu closed at launch', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'dumpsys package':
        'Activity expo.modules.devlauncher.launcher.DevLauncherActivity\n  Scheme: "exp+chat"\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    const writes = ran.filter((command) => command.includes('run-as com.example.chat sh -c'));
    expect(writes).toHaveLength(1);
    const encoded = /echo (\S+) \| base64 -d/.exec(writes[0])?.[1] ?? '';
    const xml = Buffer.from(encoded, 'base64').toString('utf-8');
    expect(xml).toContain('<boolean name="showsAtLaunch" value="false" />');
    expect(xml).toContain('<boolean name="isOnboardingFinished" value="true" />');
  });

  it("an Android clean-device start of an Expo development build marks the developer menu's first-run sheet as seen", async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'dumpsys package':
        'Activity expo.modules.devlauncher.launcher.DevLauncherActivity\n  Scheme: "exp+chat"\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    const write = ran.findIndex((command) => command.includes('run-as com.example.chat sh -c'));
    const start = ran.findIndex((command) => command.includes('shell am start'));
    const stop = ran.findIndex((command) => command.includes('am force-stop'));
    expect(stop).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(stop);
    expect(write).toBeLessThan(start);
    const encoded = /echo (\S+) \| base64 -d/.exec(ran[write])?.[1] ?? '';
    const xml = Buffer.from(encoded, 'base64').toString('utf-8');
    expect(xml).toContain('<boolean name="isOnboardingFinished" value="true" />');
    expect(xml).not.toContain('motionGestureEnabled');
    expect(ran[write]).toContain('expo.modules.devmenu.sharedpreferences.xml');
  });

  it('an Android clean-device start of an app with no development launcher writes no preferences', async () => {
    const bundler = await pretendBundler((question) =>
      question.action === 'readLogLines' ? { lines: [] } : SCENE_RECORD
    );
    const { ran, uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'dumpsys package': 'Activity com.example.chat.ChatActivity\n  Scheme: "chat"\n',
    });

    try {
      await captureLiveScene({
        sceneId: SCENE,
        port: bundler.port,
        settings: STABILIZATION_SETTINGS,
        target: ANDROID,
      });
    } finally {
      uninstall();
    }

    expect(ran.join('\n')).not.toContain('run-as');
  });

  it('an Android launch the phone refuses stops the capture with what the phone printed', async () => {
    const bundler = await pretendBundler(() => SCENE_RECORD);
    const refusal =
      'Error: Activity not started, unable to resolve Intent { cmp=com.example.chat/.ChatActivity }';
    const { uninstall } = recordingDevice({
      'resolve-activity': LAUNCHER_ANSWER,
      'am start': `Starting: Intent { cmp=com.example.chat/.ChatActivity }\n${refusal}\n`,
    });

    try {
      await expect(
        captureLiveScene({
          sceneId: SCENE,
          port: bundler.port,
          settings: STABILIZATION_SETTINGS,
          target: ANDROID,
        })
      ).rejects.toThrow(refusal);
    } finally {
      uninstall();
    }
    // The feed was emptied before the launch, which is the only thing asked.
    expect(bundler.asked).toEqual([{ action: 'readLogLines' }]);
  });
});
