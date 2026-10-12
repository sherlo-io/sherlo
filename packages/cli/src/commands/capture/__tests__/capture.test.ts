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
import { JSON_OPTION, LOGS_OPTION, STORY_OPTION } from '../../../constants';

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
    expect(screen).toContain('1 line recorded during this capture');
    expect(screen).toContain('12:00:00: storybook style : {"style":"dark"}');
  });

  it('`--logs` says so plainly when the app logged nothing, rather than printing an empty block', async () => {
    const { screen } = await captureOneStory(
      { kind: 'captured', storyId: STORY, settled: SETTLED, tree: ONE_VIEW },
      { [LOGS_OPTION]: true }
    );

    expect(screen).toContain('The app logged nothing during this capture.');
  });

  it('`--logs` prints nothing extra for an ending that never reached an app - there is no log to have asked for', async () => {
    const { screen } = await captureOneStory(
      { kind: 'no-such-story', known: ['foundation-typography--scales'] },
      { [LOGS_OPTION]: true }
    );

    expect(screen).not.toContain('recorded during this capture');
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
 * THE SCREEN IS THE RECORD DRAWN THE WAY THE INSPECTOR DRAWS IT (sherlo book, What a capture
 * records). The shells below are the rules that page marks; the task that makes them true fills
 * them in and never renames one.
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
