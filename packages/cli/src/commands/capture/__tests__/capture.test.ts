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
import { describe, expect, it, vi } from 'vitest';
import capture from '../capture';
import { EXIT_BLOCK } from '../../../helpers/exitCodes';
import { captureTranscript } from '../../../helpers/transcriptSink';
import { STABILIZATION_SETTINGS, installCaptureSocket } from '../../../seams/captureSocket';
import type { CaptureResult, CaptureSocket } from '../../../seams/captureSocket';
import type { CapturedView } from '../../../render/capturedStory';
import { STORY_OPTION } from '../../../constants';

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
      'Button › ',
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

/* ========================================================================== */

/**
 * Run the real command against one answer and read the screen it prints.
 *
 * The app is stood up as a socket that answers with `answer` and remembers what it was asked, so
 * what the cases read is the command's own output - not a renderer called by hand.
 */
async function captureOneStory(
  answer: CaptureResult
): Promise<{ screen: string; exitCode: number | undefined; asked: unknown }> {
  let asked: unknown;
  const socket: CaptureSocket = {
    captureStory: async (params) => {
      asked = { storyId: params.storyId, settings: params.settings };
      return answer;
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
        await capture({ [STORY_OPTION]: STORY });
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
