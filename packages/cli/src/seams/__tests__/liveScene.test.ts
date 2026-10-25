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
import { afterEach, describe, expect, it } from 'vitest';
import { liveCaptureSocket, STABILIZATION_SETTINGS } from '../captureSocket';
import { liveLetterbox } from '../letterbox';
import { captureLiveScene, readSceneAnswer } from '../liveScene';
import { installDeviceState, posedDeviceState } from '../deviceState';
import type { SceneTarget } from '../deviceState';
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

type Bundler = { port: number; asked: unknown[]; close: () => Promise<void> };
const open: Bundler[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((bundler) => bundler.close()));
});

/** A bundler with the line on it, answering every question as `say` decides. */
async function pretendBundler(say: (question: { action: string }) => unknown): Promise<Bundler> {
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
      const { askId, ...question } = JSON.parse(data.toString());
      asked.push(question);
      socket.send(JSON.stringify({ action: 'reply', askId, reply: say(question) }));
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
    expect(bundler.asked[0]).toMatchObject({ action: 'captureStory', sceneId: SCENE });
    expect(bundler.asked[0]).not.toHaveProperty('storyId');

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

  it('a scene the app does not have, a boot that threw and a missing ready view each end in their own words', () => {
    expect(readSceneAnswer({ kind: 'no-such-story', known: ['a--b'] }, SCENE)).toEqual({
      kind: 'no-such-scene',
      sceneId: SCENE,
      known: ['a--b'],
    });
    expect(
      readSceneAnswer(
        {
          kind: 'crashed',
          error: { name: 'TypeError', message: 'boom', stack: 'at start (/app/index.js:12:3)' },
        },
        SCENE
      )
    ).toMatchObject({ kind: 'crashed-at-boot', error: { file: '/app/index.js', line: 12 } });
    expect(
      readSceneAnswer({ kind: 'never-reached', ready: 'chat-list', stayedOn: ['Auth'] }, SCENE)
    ).toEqual({
      kind: 'never-reached',
      sceneId: SCENE,
      ready: 'chat-list',
      stayedOn: ['Auth'],
    });
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
    const server = http.createServer((request, response) => {
      response.writeHead(request.url === LINE_PATH ? 200 : 404, {
        'Content-Type': 'application/json',
      });
      response.end(JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
    });
    attach(server, WebSocketServer as unknown as WebSocketServerClass);
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    const port = (server.address() as { port: number }).port;

    // The app lists its scenes as its stories, as the START snapshot does, and waits for a capture.
    const app = new WebSocket(`ws://127.0.0.1:${port}${LINE_PATH}`);
    const instruction = new Promise<Record<string, unknown>>((got) => {
      app.on('message', (data) => {
        const { action, ...rest } = JSON.parse(data.toString());
        if (action === 'captureInstruction') got(rest);
      });
    });
    await new Promise((opened) => app.once('open', opened));
    app.send(
      JSON.stringify({
        action: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        nativeVersion: 'test',
        jsVersion: null,
      })
    );
    app.send(
      JSON.stringify({ action: 'waitForACapture', mode: 'testing', stories: [SCENE], answer: null })
    );
    await new Promise((landed) => setTimeout(landed, 50));

    const { uninstall } = recordingDevice();
    try {
      const asked = captureLiveScene({
        sceneId: SCENE,
        port,
        settings: STABILIZATION_SETTINGS,
        target: PHONE,
      });
      // The core walks a scene only when handed it as `sceneId`: as a story it is never walked.
      expect(await instruction).toEqual({ sceneId: SCENE, settings: STABILIZATION_SETTINGS });
      app.send(
        JSON.stringify({
          action: 'waitForACapture',
          mode: 'testing',
          stories: [SCENE],
          answer: SCENE_RECORD,
        })
      );
      expect(await asked).toMatchObject({ kind: 'scene', sceneId: SCENE });
    } finally {
      uninstall();
      app.terminate();
      (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      server.close();
    }
  });

  it('a command with no device ends as no app attached, without asking the bundler', async () => {
    const bundler = await pretendBundler(() => SCENE_RECORD);

    const answer = await captureLiveScene({
      sceneId: SCENE,
      port: bundler.port,
      settings: STABILIZATION_SETTINGS,
      target: undefined,
    });

    expect(answer).toEqual({ kind: 'no-app' });
    expect(bundler.asked).toEqual([]);
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
    ]);
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
    expect(xml).not.toContain('showFab');
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
    expect(bundler.asked).toEqual([]);
  });
});
