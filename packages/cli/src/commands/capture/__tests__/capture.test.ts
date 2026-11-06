/**
 * THE CAPTURE COMMAND - every ending its screen draws, reached from an answer the app can really
 * give, and the settings the command sends.
 *
 * THE SETTINGS ARE THE RUNNER'S, NOT THE COMMAND'S. A capture walks the same story a test run
 * walks, so the numbers it stabilizes with have to be the run's numbers - the command sends the one
 * copy written down beside the seam (../../seams/captureSocket) rather than its own. The first case
 * pins both halves of that: what the command sends, and which numbers those are.
 *
 * EVERY ENDING IS REACHED FROM AN ANSWER, THROUGH THE REAL COMMAND. The cases below do not call the
 * renderer or the ending mapper by hand: they hand the command an answer and read the bytes it puts
 * on stdout, so an ending the command cannot reach - a branch behind a condition that never holds -
 * fails here rather than in front of a developer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import capture from '../capture';
import { EXIT_BLOCK } from '../../../helpers/exitCodes';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { STABILIZATION_SETTINGS } from '../../../seams/bundlerLine';
import { installCaptureSocket } from '../../../seams/captureSocket';
import type { CaptureResult, CaptureSocket } from '../../../seams/captureSocket';
import { installDeviceState, posedDeviceState } from '../../../seams/deviceState';
import { readKeptCaptures } from '../../../seams/localCaptures';
import { installProjectFiles } from '../../../seams/projectFiles';
import type { CapturedView } from '../../../render/capturedStory';
import {
  ALL_SCENES_OPTION,
  DISCOVER_OPTION,
  JSON_OPTION,
  LOGS_OPTION,
  PNG_OPTION,
  SCENE_OPTION,
  STOP_ON_REPEAT_OPTION,
  STORY_OPTION,
} from '../../../constants';
import type { SceneTarget } from '../../../seams/deviceState';
import type { SceneCaptureResult } from '../../../seams/liveScene';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** What the emulator's proxy has refused during the scene now running; a case fills it. */
const proxyRefusals = vi.hoisted(() => ({ now: [] as unknown[] }));

vi.mock('../../../seams/refusingProxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../seams/refusingProxy')>()),
  refusedByTheProxy: () => proxyRefusals.now,
}));

const STORY = 'components-button--primary';

/** A story that fits one screen: one view, no children. */
const ONE_VIEW: CapturedView = { primitive: 'View', components: ['Button'], children: [] };

/** A story the app watched settle, and then answered about. */
const SETTLED = { ms: 1400, frames: 6 };

/** The app stopped answering mid-capture: a fatal error, a native crash, or the app being closed. */
const A_CRASH = { name: 'RangeError', message: 'Maximum call stack size exceeded' };

/** Thrown by the stubbed `process.exit`, so the case that expects a refusal can still read the screen. */
class LeftTheProcess extends Error {}

/** One answer the app can give, and what the screen made of it says. */
type Ending = {
  /** The ending, as the screen names it. */
  ending: string;
  answer: CaptureResult;
  /** Text the screen carries for this ending. */
  prints: string[];
  /** Text the screen must NOT carry - the line of a neighbouring ending. */
  silent?: string[];
  /** The code the command leaves the process with - `undefined` when it leaves it alone. */
  exits?: number;
};

const ENDINGS: Ending[] = [
  {
    ending: 'no bundler',
    answer: { kind: 'no-bundler' },
    prints: ['No bundler on port', 'Start your app with the bundler running, then try again.'],
    exits: EXIT_BLOCK,
  },
  {
    ending: 'no app',
    answer: { kind: 'no-app' },
    prints: [', and no Sherlo app is attached to it', 'Open the app on a device or simulator'],
    exits: EXIT_BLOCK,
  },
  {
    ending: 'no such story',
    answer: { kind: 'no-such-story', known: ['foundation-typography--scales'] },
    prints: ['in this app', 'This app has:', '  foundation-typography--scales'],
    exits: EXIT_BLOCK,
  },
  {
    ending: 'captured',
    answer: { kind: 'captured', storyId: STORY, settled: SETTLED, tree: ONE_VIEW },
    prints: [
      'captured, the way a test run records it',
      'settled in 1.4s over 6 frames',
      '<Button>',
    ],
    // An app older than the two facts says nothing about them, and the screen says no more.
    silent: ['screenfuls', 'loaded over the network'],
  },
  {
    ending: 'captured, in more than one screenful and carrying a network image',
    answer: {
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      parts: 3,
      hasNetworkImage: true,
      tree: ONE_VIEW,
    },
    prints: [
      'captured in 3 screenfuls - the story scrolls past the first',
      'has images loaded over the network - a cloud capture depends on them',
    ],
  },
  {
    ending: 'captured, in one screenful and carrying no network image',
    answer: {
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      parts: 1,
      hasNetworkImage: false,
      tree: ONE_VIEW,
    },
    prints: ['captured, the way a test run records it'],
    // One screenful is not news: a screen that said "captured in 1 screenfuls" would be noise on
    // every story that fits the screen.
    silent: ['screenfuls', 'loaded over the network'],
  },
  {
    ending: 'never settled',
    answer: { kind: 'captured', storyId: STORY, settled: 'timed-out', tree: ONE_VIEW },
    prints: [
      'never stopped changing within 20s',
      'A test run of this story would stop at the same limit. What it read then:',
    ],
  },
  {
    ending: 'captured and threw',
    answer: {
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      threw: { name: 'TypeError', message: "Cannot read property 'label' of undefined" },
      tree: ONE_VIEW,
    },
    prints: [
      'captured, and it threw while rendering',
      "  TypeError: Cannot read property 'label' of undefined",
    ],
    silent: ['never stopped changing'],
  },
  {
    ending: 'crashed, and the app said why',
    answer: { kind: 'crashed', storyId: STORY, error: A_CRASH },
    prints: [
      'captured to a crash - the app stopped answering',
      '  RangeError: Maximum call stack size exceeded',
    ],
    exits: EXIT_BLOCK,
  },
  {
    ending: 'crashed, and the app said nothing',
    answer: { kind: 'crashed', storyId: STORY },
    prints: [
      'captured to a crash - the app stopped answering',
      'The app said nothing before it died - a native crash, or the app was closed.',
    ],
    exits: EXIT_BLOCK,
  },
];

/** Every capture is kept in a project folder, so none of these cases may keep one in the working folder. */
let keptIn: string;
let uninstallKeptIn: () => void;
let uninstallNoDevice: () => void;
beforeEach(() => {
  keptIn = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-kept-in-'));
  uninstallKeptIn = installProjectFiles({ root: () => keptIn });
  // A story capture looks for a phone to keep a picture from; these cases have none unless they install one.
  uninstallNoDevice = installDeviceState(posedDeviceState());
});
afterEach(() => {
  uninstallNoDevice();
  uninstallKeptIn();
  fs.rmSync(keptIn, { recursive: true, force: true });
});

describe("the settings a capture sends are the runner's stabilization values", () => {
  it("sends the runner's stabilization values to the app", async () => {
    const { asked, screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree: ONE_VIEW,
    });

    expect(asked).toEqual({ storyId: STORY, settings: STABILIZATION_SETTINGS });
    expect(screen).toContain('captured, the way a test run records it');

    // The numbers themselves, written out: the runner's, not this command's to choose. Changing one
    // is changing what a capture means, so it is a diff a reader gets to see rather than a copy that
    // drifts. `timeoutMs` is also what the `never settled` screen says out loud, one case above, and
    // `threshold` and `includeAA` are what decide whether two frames count as the same frame: a
    // capture that left those two to the app's own config would call a story never-settled that a
    // test run would have settled.
    //
    // `saveScreenshots` is the one runner setting deliberately not here, and its absence is the
    // point: the runner sets it true, and a capture writes nothing to the device, so the app turns
    // it off itself rather than being told to.
    expect(STABILIZATION_SETTINGS).toEqual({
      requiredMatches: 3,
      minScreenshotsCount: 6,
      intervalMs: 500,
      timeoutMs: 20_000,
      threshold: 0.02,
      includeAA: true,
    });
  });
});

describe('every ending the capture screen draws is reached from an answer the app can give', () => {
  it.each(ENDINGS.map((ending) => [ending.ending, ending] as const))(
    '%s',
    async (_name, ending) => {
      const { screen, exitCode } = await captureOneStory(ending.answer);

      for (const line of ending.prints) expect(screen).toContain(line);
      for (const line of ending.silent ?? []) expect(screen).not.toContain(line);
      expect(exitCode).toBe(ending.exits);
    }
  );

  it('a story that came back with a record leaves with zero, however badly it went', async () => {
    // The exit code answers ONE question - did a record come back - because that is the one thing a
    // caller branches on. A story that threw, or that never settled, is the developer's news: what
    // they asked for arrived. Only an answer with no record in it refuses.
    const wentBadly: CaptureResult[] = [
      { kind: 'captured', storyId: STORY, settled: 'timed-out', tree: ONE_VIEW },
      {
        kind: 'captured',
        storyId: STORY,
        settled: SETTLED,
        threw: { name: 'TypeError', message: 'nope' },
        tree: ONE_VIEW,
      },
    ];

    for (const answer of wentBadly) {
      const { exitCode } = await captureOneStory(answer);
      expect(exitCode).toBeUndefined();
    }
  });
});

describe('a scene capture can save the screen it captured', () => {
  const CHAT_PNG = path.join(os.tmpdir(), 'sherlo-capture-png-test', 'chat.png');
  beforeEach(() => fs.mkdirSync(path.dirname(CHAT_PNG), { recursive: true }));
  afterEach(() => fs.rmSync(path.dirname(CHAT_PNG), { recursive: true, force: true }));

  const ON_ONE_PHONE: SceneTarget = {
    device: { platform: 'ios', udid: 'SIM-1' },
    app: { id: 'com.example.app' },
  };
  const ON_ANDROID: SceneTarget = {
    device: { platform: 'android', serial: 'emulator-5554' },
    app: { id: 'com.example.app' },
  };
  const A_SCENE: SceneCaptureResult = {
    kind: 'scene',
    sceneId: 'chat--open',
    bootMs: 900,
    reached: { route: ['Chat'], ms: 300 },
    play: [],
    settled: SETTLED,
    tree: ONE_VIEW,
  };

  /** Capture one scene on a recording simulator; `events` is the order of what happened to it. */
  async function captureOneScene(
    answer: SceneCaptureResult,
    options: Record<string, string | boolean>,
    {
      target = ON_ONE_PHONE,
      failScreenshot = false,
      projectRoot,
    }: { target?: SceneTarget; failScreenshot?: boolean; projectRoot?: string } = {}
  ) {
    const events: string[] = [];
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-png-test-'));
    const uninstallDevice = installDeviceState({
      sceneTarget: async () => target,
      simulatorFolder: () => folder,
      makeSaveFolder: () => fs.mkdtempSync(path.join(folder, 'save-')),
      run: async (tool, args, { stdoutTo } = {}) => {
        const line = `${tool} ${args.join(' ')}`;
        events.push(line);
        // What the tool prints goes to the file it was handed, as the real runner does.
        if (stdoutTo) fs.writeFileSync(stdoutTo, 'bytes');
        if (line.includes('screenshot') && !failScreenshot) {
          fs.writeFileSync(args[args.length - 1], 'bytes');
        }
        if (/screenshot|screencap/.test(line) && failScreenshot) {
          throw new Error('screenshot failed');
        }
        if (line.includes('pm path')) return 'package:/data/app/base.apk\n';
        // The app's Info.plist, declaring nothing.
        if (tool === 'plutil') return '{}';
        return line.includes('get_app_container') ? `${folder}\n` : '';
      },
    });
    const uninstallSocket = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async () => {
        events.push('the app answered');
        return answer;
      },
    });
    let exitedWith: number | undefined;
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitedWith = code;
      throw new LeftTheProcess('process.exit');
    }) as never);
    const uninstallFiles = installProjectFiles({ root: () => projectRoot ?? folder });
    try {
      const { stdout } = await captureTranscript(async () => {
        try {
          await capture({ [SCENE_OPTION]: 'chat--open', ...options });
        } catch (error) {
          if (!(error instanceof LeftTheProcess)) throw error;
        }
      });
      return {
        screen: stdout,
        events,
        exitedWith,
        kept: readKeptCaptures(projectRoot ?? folder),
      };
    } finally {
      exit.mockRestore();
      uninstallFiles();
      uninstallSocket();
      uninstallDevice();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }

  it('a captured scene with --png saves the screen before the device is put back', async () => {
    const { screen, events } = await captureOneScene(A_SCENE, { [PNG_OPTION]: CHAT_PNG });

    const screenshot = events.findIndex((line) => line.includes('simctl io SIM-1 screenshot'));
    // The picture is written beside the path and renamed onto it only when the save worked.
    expect(events[screenshot]).toMatch(
      new RegExp(
        `^xcrun simctl io SIM-1 screenshot ${path.dirname(CHAT_PNG)}/\\.sherlo-\\d+-chat\\.png$`
      )
    );
    expect(screenshot).toBeGreaterThan(events.indexOf('the app answered'));
    // Cleaning the device stops the app first too; the put-back is the stop that comes last.
    const terminates = events.filter((line) => line.includes('simctl terminate'));
    expect(events.lastIndexOf(terminates[terminates.length - 1])).toBeGreaterThan(screenshot);
    expect(screen).toContain(`Picture saved to ${CHAT_PNG}`);
    expect(fs.readFileSync(CHAT_PNG, 'utf8')).toBe('bytes');
  });

  it('a scene that was not captured saves no picture and says so', async () => {
    const { screen, events, kept } = await captureOneScene(
      { kind: 'no-such-scene', sceneId: 'chat--open', known: [] },
      { [PNG_OPTION]: CHAT_PNG }
    );

    // The only frame taken is the one the app ended on, kept beside the record and never as the picture.
    const screenshots = events.filter((line) => line.includes('screenshot'));
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toContain('ended-on.png');
    expect(kept[0].screenPath).toBeUndefined();
    expect(kept[0].endedPath).toBeDefined();
    expect(screen).toContain('No picture saved: the scene was not captured');
  });

  it('a failed save prints the error and leaves the scene captured', async () => {
    const { screen } = await captureOneScene(
      A_SCENE,
      { [PNG_OPTION]: CHAT_PNG },
      { failScreenshot: true }
    );

    expect(screen).toContain('No picture saved: screenshot failed');
    expect(screen).toContain('captured, the way a test run records it');
  });

  it('an android scene with --png saves the screen to the path before the device is put back', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-png-out-'));
    const png = path.join(dir, 'chat.png');
    try {
      const { screen, events } = await captureOneScene(
        A_SCENE,
        { [PNG_OPTION]: png },
        { target: ON_ANDROID }
      );

      const screencap = events.indexOf('adb -s emulator-5554 exec-out screencap -p');
      expect(screencap).toBeGreaterThan(events.indexOf('the app answered'));
      // Cleaning the device stops the app first too; the put-back is the stop that comes last.
      const stops = events.filter((line) => line.includes('force-stop'));
      expect(events.lastIndexOf(stops[stops.length - 1])).toBeGreaterThan(screencap);
      expect(fs.readFileSync(png, 'utf8')).toBe('bytes');
      expect(screen).toContain(`Picture saved to ${png}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a failed android save leaves no file and the scene captured', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-png-out-'));
    const png = path.join(dir, 'chat.png');
    try {
      const { screen } = await captureOneScene(
        A_SCENE,
        { [PNG_OPTION]: png },
        { target: ON_ANDROID, failScreenshot: true }
      );

      expect(fs.existsSync(png)).toBe(false);
      expect(screen).toContain('No picture saved: screenshot failed');
      expect(screen).toContain('captured, the way a test run records it');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--json carries png when the save worked and leaves it out when it failed', async () => {
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
      written.push(String(text));
      return true;
    }) as never);
    let saved: string;
    let failed: string;
    try {
      await captureOneScene(A_SCENE, { [PNG_OPTION]: CHAT_PNG, [JSON_OPTION]: true });
      saved = written.join('');
      written.length = 0;
      await captureOneScene(
        A_SCENE,
        { [PNG_OPTION]: CHAT_PNG, [JSON_OPTION]: true },
        { failScreenshot: true }
      );
      failed = written.join('');
    } finally {
      write.mockRestore();
    }

    expect(JSON.parse(saved).png).toBe(CHAT_PNG);
    expect(JSON.parse(failed)).not.toHaveProperty('png');
  });

  /** A project folder with one scene file, `chat.scenes.tsx`, whose scene `Open` is given `device`. */
  function projectWithScene(device: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-scene-device-'));
    const field = device ? `given: [{ device: ${device} }],` : '';
    fs.writeFileSync(
      path.join(root, 'chat.scenes.tsx'),
      `export default scenes({ scenes: { Open: { ${field} } } });\n`
    );
    return root;
  }

  /** Capture the scene with `--json`: the record it printed and the device calls around it. */
  async function jsonOfScene(
    root: string,
    target: SceneTarget,
    answer: SceneCaptureResult = A_SCENE
  ) {
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
      written.push(String(text));
      return true;
    }) as never);
    try {
      const { events } = await captureOneScene(
        answer,
        { [JSON_OPTION]: true },
        { target, projectRoot: root }
      );
      return { events, record: JSON.parse(written.join('')) };
    } finally {
      write.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it('a scene with no device field is captured exactly as today', async () => {
    const { events, record } = await jsonOfScene(projectWithScene(''), ON_ONE_PHONE);

    const changes = events.filter((line) =>
      /privacy|simctl location|pm grant|pm revoke|geo fix/.test(line)
    );
    expect(changes).toEqual([]);
    expect(record).not.toHaveProperty('phoneNotApplied');
  });

  it("capture reads the scene's device from the scene file before launching", async () => {
    const root = projectWithScene(
      "{ permissions: { camera: 'denied' }, location: { latitude: 52.5, longitude: 13.4 } }"
    );
    const { events } = await jsonOfScene(root, ON_ONE_PHONE);

    const revoked = events.indexOf('xcrun simctl privacy SIM-1 revoke camera com.example.app');
    expect(revoked).toBeGreaterThan(-1);
    expect(events).toContain('xcrun simctl location SIM-1 set 52.5,13.4');
    expect(revoked).toBeLessThan(events.indexOf('the app answered'));
    // Both are put back once the capture ends.
    expect(events.lastIndexOf('xcrun simctl location SIM-1 clear')).toBeGreaterThan(
      events.indexOf('the app answered')
    );
  });

  it('an android scene with no device field is captured exactly as today', async () => {
    const { events, record } = await jsonOfScene(projectWithScene(''), ON_ANDROID);

    const changes = events.filter((line) => /pm revoke|geo fix|dumpsys location/.test(line));
    expect(changes).toEqual([]);
    expect(record).not.toHaveProperty('phoneNotApplied');
  });

  it('a location the phone cannot take is listed in the json record as not applied', async () => {
    const aRealPhone: SceneTarget = {
      device: { platform: 'android', serial: 'R58M123ABC' },
      app: { id: 'com.example.app' },
    };
    const root = projectWithScene('{ location: { latitude: 52.5, longitude: 13.4 } }');
    const { events, record } = await jsonOfScene(root, aRealPhone);

    expect(record.phoneNotApplied).toEqual([
      { setting: 'location', wanted: '52.5,13.4', why: 'phone-refused' },
    ]);
    expect(events.filter((line) => line.includes('geo fix'))).toEqual([]);
  });

  it('a crashed-mid-capture ending keeps the settings the phone did not take', async () => {
    const aRealPhone: SceneTarget = {
      device: { platform: 'android', serial: 'R58M123ABC' },
      app: { id: 'com.example.app' },
    };
    const crashed: SceneCaptureResult = { kind: 'crashed-mid-capture', sceneId: 'chat--open' };
    const root = projectWithScene('{ location: { latitude: 52.5, longitude: 13.4 } }');
    const { record } = await jsonOfScene(root, aRealPhone, crashed);

    expect(record.phoneNotApplied).toEqual([
      { setting: 'location', wanted: '52.5,13.4', why: 'phone-refused' },
    ]);
  });

  const NEVER_READY: SceneCaptureResult = {
    kind: 'never-reached',
    sceneId: 'chat--open',
    ready: 'chat-ready',
    stayedOn: ['Chat'],
    likelyCause: ['unanswered-requests'],
    readyTooEarly: { atStep: 1, of: 2 },
    answerFindings: [{ kind: 'no-query-text', operation: 'Chat' }],
    unanswered: [
      {
        method: 'POST',
        url: '/graphql',
        contentType: 'application/json',
        operation: 'Chat',
        bodyExcerpt: '{"query":"***"}',
      },
    ],
  };

  it('discover is refused without a scene', async () => {
    await expect(capture({ [DISCOVER_OPTION]: true, [STORY_OPTION]: STORY })).rejects.toThrow(
      '`npx sherlo capture --discover` needs `--scene` and cannot be combined with `--png`.'
    );
    await expect(
      capture({ [DISCOVER_OPTION]: true, [SCENE_OPTION]: 'chat--open', [PNG_OPTION]: CHAT_PNG })
    ).rejects.toThrow('needs `--scene` and cannot be combined');
  });

  it('a discover capture whose scene never got ready leaves with zero and takes no picture', async () => {
    const { screen, exitedWith, events, kept } = await captureOneScene(NEVER_READY, {
      [DISCOVER_OPTION]: true,
    });

    expect(exitedWith).toBeUndefined();
    expect(screen).toContain("mockRequest({ method: 'POST', operationName: 'Chat' }");
    // No picture of the scene: the only frame taken is the one the app ended on, kept beside the record.
    const screenshots = events.filter((line) => /screenshot|screencap/.test(line));
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toContain('ended-on.png');
    expect(kept[0].screenPath).toBeUndefined();
    expect(kept[0].endedPath).toBeDefined();
  });

  it('a scene whose only refused request came through the emulator proxy ends as incomplete and the run exits 1', async () => {
    proxyRefusals.now = [
      {
        method: 'GET',
        url: 'https://api.example.com/chat',
        rule: 'emulator-proxy',
        scope: 'background',
      },
    ];
    try {
      const { exitedWith, screen } = await captureOneScene(A_SCENE, { [JSON_OPTION]: false });

      expect(exitedWith).toBe(EXIT_BLOCK);
      expect(screen).toContain('api.example.com');
    } finally {
      proxyRefusals.now = [];
    }
  });

  it('a scene that never got ready without discover still leaves with the block code', async () => {
    const { exitedWith } = await captureOneScene(NEVER_READY, {});

    expect(exitedWith).toBe(EXIT_BLOCK);
  });

  it("a scene's json record carries the early ready view, likely cause, answer findings and each unanswered request's details unchanged", async () => {
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
      written.push(String(text));
      return true;
    }) as never);
    try {
      await captureOneScene(NEVER_READY, { [JSON_OPTION]: true, [DISCOVER_OPTION]: true });
    } finally {
      write.mockRestore();
    }

    expect(JSON.parse(written.join(''))).toEqual({ ...NEVER_READY, discover: true });
  });

  it('--png with --story is refused the way --scene with --story is', async () => {
    await expect(capture({ [STORY_OPTION]: STORY, [PNG_OPTION]: CHAT_PNG })).rejects.toThrow(
      '`npx sherlo capture` takes `--png` only with `--scene`.'
    );
  });
});

describe('only a scene is given a clean device', () => {
  // A story capture now also keeps the picture and the device (see keptCaptures.test.ts), so it looks at
  // the device; what it still never does is clean it - wiping the app's data would be a loss for nothing.
  it("a story capture only looks at the developer's device and never cleans it", async () => {
    const ran: string[] = [];
    const uninstall = installDeviceState({
      ...posedDeviceState(),
      sceneTarget: async () => ({
        device: { platform: 'ios', udid: 'SIM-1' },
        app: { id: 'com.example.app' },
      }),
      run: async (tool, args) => {
        ran.push(`${tool} ${args.join(' ')}`);
        return '{}';
      },
    });

    try {
      await captureOneStory({ kind: 'captured', storyId: STORY, settled: SETTLED, tree: ONE_VIEW });
    } finally {
      uninstall();
    }

    expect(ran.length).toBeGreaterThan(0);
    expect(ran.every((line) => /screenshot|simctl list/.test(line))).toBe(true);
  });
});

describe('what a capture says went wrong or stayed real reaches the screen', () => {
  it("a story whose mock did not take effect ends with the module's name and no tree", async () => {
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      threw: { name: 'MockedModuleError', message: 'react-native-camera was never imported' },
      tree: ONE_VIEW,
    });

    expect(screen).toContain('failed - a module it mocks was not mocked');
    expect(screen).toContain('react-native-camera was never imported');
    expect(screen).not.toContain('<Button>');
    expect(screen).not.toContain('views · --json prints the record');
  });

  it('a captured story prints the modules that ran as real code, then the requests no mock answered', async () => {
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      stillReal: ['src/theme.ts', 'src/format.ts'],
      unanswered: [{ method: 'GET', url: 'https://api.example.com/me' }],
      tree: ONE_VIEW,
    });

    const modules = screen.indexOf("2 of the app's own modules ran as real code:");
    const requests = screen.indexOf('1 request had no mock');
    expect(modules).toBeGreaterThan(-1);
    expect(requests).toBeGreaterThan(modules);
    expect(screen).toContain('src/format.ts');
    expect(screen).toContain('GET https://api.example.com/me');
    expect(screen.indexOf('<Button>')).toBeGreaterThan(requests);
  });
});

describe("the app's own log lines never reach the drawn screen unasked, and `--logs` is the one door that puts them there", () => {
  const WITH_LOGS: CaptureResult = {
    kind: 'captured',
    storyId: STORY,
    settled: SETTLED,
    tree: ONE_VIEW,
    logs: ['12:00:00: storybook style : {"style":"dark"}'],
  };

  it('the default screen never shows a log line, even when the answer carries some', async () => {
    const { screen } = await captureOneStory(WITH_LOGS);

    expect(screen).not.toContain('storybook style');
  });

  it('`--logs` prints them after the story, with a count line first', async () => {
    const { screen } = await captureOneStory(WITH_LOGS, { [LOGS_OPTION]: true });

    expect(screen).toContain('captured, the way a test run records it');
    expect(screen).toContain("Sherlo's log from the app - 1 new line:");
    expect(screen).toContain('12:00:00: storybook style : {"style":"dark"}');
  });

  it('`--logs` says so plainly when the app logged nothing, rather than printing an empty block', async () => {
    const { screen } = await captureOneStory(
      { kind: 'captured', storyId: STORY, settled: SETTLED, tree: ONE_VIEW },
      { [LOGS_OPTION]: true }
    );

    expect(screen).toContain('Sherlo has logged nothing new from the app.');
  });

  it('`--logs` prints nothing extra for an ending that never reached an app - there is no log to have asked for', async () => {
    const { screen } = await captureOneStory(
      { kind: 'no-such-story', known: ['foundation-typography--scales'] },
      { [LOGS_OPTION]: true }
    );

    expect(screen).not.toContain("Sherlo's log from the app");
    expect(screen).not.toContain('logged nothing');
  });

  it('`--json` carries the log lines regardless of `--logs`', async () => {
    // `--json` writes straight to process.stdout, not through the emit() sink captureOneStory
    // otherwise reads - so this reads that stream directly instead.
    let written = '';
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      written += chunk;
      return true;
    }) as never);

    try {
      await captureOneStory(WITH_LOGS, { [JSON_OPTION]: true });
    } finally {
      write.mockRestore();
    }

    expect(JSON.parse(written)).toEqual(WITH_LOGS);
  });
});

/* ========================================================================== */

/**
 * Run the real command against one answer and read the screen it prints.
 *
 * The app is stood up as a socket that answers with `answer` and remembers what it was asked, so
 * what the cases read is the command's own output - not a renderer called by hand.
 */
async function captureOneStory(
  answer: CaptureResult,
  extraOptions: Partial<Record<typeof JSON_OPTION | typeof LOGS_OPTION, boolean>> = {}
): Promise<{ screen: string; exitCode: number | undefined; asked: unknown }> {
  let asked: unknown;
  const socket: CaptureSocket = {
    captureStory: async (params) => {
      asked = { storyId: params.storyId, settings: params.settings };
      return answer;
    },
    captureScene: async () => {
      throw new Error('a story capture asked about a scene');
    },
  };

  let exitCode: number | undefined;

  const uninstall = installCaptureSocket(socket);
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new LeftTheProcess(`process.exit(${code})`);
  }) as never);

  try {
    const { stdout } = await captureTranscript(async () => {
      try {
        await capture({ [STORY_OPTION]: STORY, ...extraOptions });
      } catch (error) {
        // A refusal ends the process, which this case has stubbed to throw so it can read on.
        if (!(error instanceof LeftTheProcess)) throw error;
      }
    });

    return { screen: stdout, exitCode, asked };
  } finally {
    exit.mockRestore();
    uninstall();
  }
}

/* ========================================================================== */
/*
 * THE SCREEN IS THE RECORD DRAWN THE WAY THE INSPECTOR DRAWS IT.
 */

describe("the screen draws every view of the record, the way the build page's inspector draws it", () => {
  it('prints every view of a two-hundred-view record, and counts them on the last line', async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: [],
      // One root plus 199 leaves - a two-hundred-view record - each leaf marked with its own size
      // so a hole in the middle of the tree would show up as a missing number, not just a short count.
      children: Array.from({ length: 199 }, (_, index) => ({
        primitive: 'View',
        components: [],
        size: { width: index, height: 1 },
        children: [],
      })),
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('   200 views · --json prints the record');
    expect(screen).toContain('(0 x 1)');
    expect(screen).toContain('(198 x 1)');
    // None left out: every one of the 199 leaves printed its own self-closing tag.
    expect(screen.match(/<View \/>/g)).toHaveLength(199);
  });

  it('opens a tag over several lines when the view has a style or a prop, and on one line when it has neither', async () => {
    const bare: CapturedView = { primitive: 'View', components: [], children: [] };
    const { screen: oneLine } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree: bare,
    });
    expect(oneLine).toContain('\n   <View />\n');

    // A string prop and a boolean prop, and no style at all - the case the pose examples never
    // draw on their own: a tag opened over several lines by props alone.
    const withProps: CapturedView = {
      primitive: 'View',
      components: [],
      props: { testID: 'button', disabled: true },
      children: [],
    };
    const { screen: multiLine } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree: withProps,
    });
    expect(multiLine).toContain('<View\n     testID="button"\n     disabled={true}\n   />');
  });

  it("prints a view's size in points after its opening tag", async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: [],
      size: { width: 100, height: 40 },
      children: [],
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('<View /> (100 x 40)');
  });

  it('prints a colour in itself, as the upper-case hex the inspector shows', async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: [],
      style: { backgroundColor: '#f00' },
      children: [],
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('backgroundColor: "#FF0000"');
  });
});

describe('the words a text view draws print between its tags', () => {
  it('puts the words on their own line between the opening and the closing tag', async () => {
    const tree: CapturedView = { primitive: 'Text', components: [], text: 'Hello', children: [] };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('<Text>\n     Hello\n   </Text>');
  });

  it('prints a placeholder as the prop it is, on the opening tag', async () => {
    const tree: CapturedView = {
      primitive: 'TextInput',
      components: [],
      props: { placeholder: 'Email' },
      children: [],
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('<TextInput\n     placeholder="Email"\n   />');
  });
});

describe("the app's components print as tags around the view they render", () => {
  it("wraps the view in one tag per component, outermost first, in the components' own colour", async () => {
    const tree: CapturedView = { primitive: 'View', components: ['Outer', 'Inner'], children: [] };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('<Outer>\n     <Inner>\n       <View />\n     </Inner>\n   </Outer>');
  });

  it('prints no component tag for a view the app did not name', async () => {
    const tree: CapturedView = { primitive: 'View', components: [], children: [] };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    // The view's own tag sits directly between the blank line that opens the tree and the blank
    // line before the count - nothing wraps it.
    expect(screen).toContain('\n\n   <View />\n\n   1 views');
  });
});

describe('`--json` prints the record and nothing else', () => {
  it('prints the record as JSON with the size, style and props of every view, and no screen', async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: ['Card'],
      size: { width: 100, height: 40 },
      style: { backgroundColor: '#FF0000' },
      props: { testID: 'card' },
      children: [],
    };
    const answer: CaptureResult = { kind: 'captured', storyId: STORY, settled: SETTLED, tree };

    // `--json` writes straight to process.stdout, not through the emit() sink captureOneStory
    // otherwise reads - see the log-lines case below for the same pattern.
    let written = '';
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      written += chunk;
      return true;
    }) as never);

    let screen = '';
    try {
      screen = (await captureOneStory(answer, { [JSON_OPTION]: true })).screen;
    } finally {
      write.mockRestore();
    }

    expect(JSON.parse(written)).toEqual(answer);
    expect(screen).toBe('');
  });
});

describe("the style block follows the inspector's property order and shorthands", () => {
  it('orders the keys layout first, then box, then typography, then effects, the way the inspector does', async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: [],
      // Written out of order on purpose: typography and effects keys ahead of the layout and
      // sizing ones they must print after.
      style: { shadowOpacity: 0.5, fontSize: 12, width: 100, position: 'absolute' },
      children: [],
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain(
      'style={{\n       position: "absolute",\n       width: 100,\n       fontSize: 12,\n       shadowOpacity: 0.5\n     }}'
    );
  });

  it('folds four equal paddings, margins or corners into the one key the inspector prints', async () => {
    const tree: CapturedView = {
      primitive: 'View',
      components: [],
      style: {
        paddingTop: 8,
        paddingRight: 8,
        paddingBottom: 8,
        paddingLeft: 8,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: 4,
      },
      children: [],
    };
    const { screen } = await captureOneStory({
      kind: 'captured',
      storyId: STORY,
      settled: SETTLED,
      tree,
    });

    expect(screen).toContain('style={{\n       padding: 8,\n       borderRadius: 4\n     }}');
    expect(screen).not.toContain('paddingTop');
    expect(screen).not.toContain('borderTopLeftRadius');
  });
});

describe('a capture leaves no mark behind and prints plain data on request', () => {
  const capturingMarks = () => {
    const captures = path.join(keptIn, '.sherlo', 'captures');
    if (!fs.existsSync(captures)) return [];
    return fs
      .readdirSync(captures)
      .filter((name) => fs.existsSync(path.join(captures, name, 'capturing')));
  };

  it('a capture that throws leaves no capturing mark', async () => {
    const uninstall = installCaptureSocket({
      captureStory: async () => {
        throw new Error('the socket broke');
      },
      captureScene: async () => {
        throw new Error('a story capture asked about a scene');
      },
    });
    try {
      await expect(capture({ [STORY_OPTION]: STORY })).rejects.toThrow('the socket broke');
    } finally {
      uninstall();
    }
    expect(capturingMarks()).toEqual([]);
  });

  it('a scene capture that throws leaves no capturing mark and no folder', async () => {
    const uninstall = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async () => {
        throw new Error('the scene socket broke');
      },
    });
    try {
      await expect(capture({ [SCENE_OPTION]: 'chat--open' })).rejects.toThrow(
        'the scene socket broke'
      );
    } finally {
      uninstall();
    }
    const captures = path.join(keptIn, '.sherlo', 'captures');
    expect(fs.readdirSync(captures)).toEqual([]);
  });

  it('capturing every scene with --json prints one document', async () => {
    fs.writeFileSync(
      path.join(keptIn, 'chat.scenes.tsx'),
      'export default scenes({ scenes: { Open: {}, Closed: {} } });\n'
    );
    const uninstall = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async ({ sceneId }) => ({
        kind: 'scene',
        sceneId,
        bootMs: 900,
        reached: { route: ['Chat'], ms: 300 },
        play: [],
        settled: SETTLED,
        tree: ONE_VIEW,
      }),
    });
    const written: string[] = [];
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
      written.push(String(text));
      return true;
    }) as never);
    try {
      await capture({ [ALL_SCENES_OPTION]: true, [JSON_OPTION]: true });
    } finally {
      write.mockRestore();
      uninstall();
    }
    const { scenes } = JSON.parse(written.join(''));
    expect(scenes).toHaveLength(2);
    for (const scene of scenes) {
      expect(scene.record).toMatchObject({ kind: 'scene', sceneId: scene.sceneId });
    }
  });
});

describe('a run of every scene', () => {
  const FIVE_SCENES = 'export default scenes({ scenes: { A: {}, B: {}, C: {}, D: {}, E: {} } });\n';

  /** Capture every scene, each answered by `answerFor`; the screen it drew and the code it left with. */
  async function captureEveryScene(
    sceneFile: string,
    answerFor: (sceneId: string) => SceneCaptureResult,
    options: Record<string, boolean> = {}
  ) {
    fs.writeFileSync(path.join(keptIn, 'chat.scenes.tsx'), sceneFile);
    const uninstall = installCaptureSocket({
      captureStory: async () => {
        throw new Error('a scene capture asked about a story');
      },
      captureScene: async ({ sceneId }) => answerFor(sceneId),
    });
    let exitCode: number | undefined;
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCode = code;
      throw new LeftTheProcess(`process.exit(${code})`);
    }) as never);
    try {
      const { stdout } = await captureTranscript(async () => {
        try {
          await capture({ [ALL_SCENES_OPTION]: true, ...options });
        } catch (error) {
          if (!(error instanceof LeftTheProcess)) throw error;
        }
      });
      return { screen: stdout, exitCode };
    } finally {
      exit.mockRestore();
      uninstall();
    }
  }

  const STUCK_ON_CHAT = (sceneId: string): SceneCaptureResult => ({
    kind: 'never-reached',
    sceneId,
    ready: 'chat-ready',
    stayedOn: ['Chat'],
  });

  it('capture --all-scenes warns once after 2 scenes in a row end with one cause and carries on', async () => {
    const { screen, exitCode } = await captureEveryScene(FIVE_SCENES, STUCK_ON_CHAT);

    expect(screen.match(/may fail the same way/g)).toHaveLength(1);
    expect(screen).toContain('ready view never showed on Chat');
    for (const sceneId of ['chat--a', 'chat--b', 'chat--c', 'chat--d', 'chat--e']) {
      expect(screen).toContain(sceneId);
    }
    expect(screen).toContain('5 scenes: 0 captured, 0 never settled, 5 never reached, 0 failed');
    expect(exitCode).toBe(EXIT_BLOCK);
  });

  it('capture --all-scenes --stop-on-repeat stops after 2 scenes in a row end with one cause', async () => {
    const { screen, exitCode } = await captureEveryScene(FIVE_SCENES, STUCK_ON_CHAT, {
      [STOP_ON_REPEAT_OPTION]: true,
    });

    expect(screen).toContain('3 more scenes not run, same cause: ready view never showed on Chat');
    expect(screen).toContain('2 scenes: 0 captured, 0 never settled, 2 never reached, 0 failed');
    expect(exitCode).toBe(EXIT_BLOCK);
  });

  it('each captured line shows launch, ready and settle times and the summary counts each ending', async () => {
    const { screen } = await captureEveryScene(
      'export default scenes({ scenes: { Open: {}, Stuck: {} } });\n',
      (sceneId) =>
        sceneId === 'chat--open'
          ? {
              kind: 'scene',
              sceneId,
              bootMs: 900,
              reached: { route: ['Chat'], ms: 300 },
              play: [],
              settled: SETTLED,
              tree: ONE_VIEW,
            }
          : STUCK_ON_CHAT(sceneId)
    );

    expect(screen).toContain('launched in 0.9s · ready in 0.3s · settled in 1.4s');
    expect(screen).toContain('2 scenes: 1 captured, 0 never settled, 1 never reached, 0 failed');
  });
});
