/**
 * `sherlo pose` (sherlo / Drawing for a plan).
 *
 * Two rules live here, and the second is the proof the emit road never had.
 *
 * A POSE CAN NEVER PASS ON A ROAD IT DID NOT DESCRIBE. A call the command makes that the pose did
 * not script is refused, with the screen so far printed under it - because a screen that stopped
 * because the world could not answer is still worth reading: it is the evidence that says which
 * call to add.
 *
 * AND THE SCREEN IS THE SCREEN A TERMINAL SHOWS. `sherlo pose` runs the routing in this process,
 * with the seams replaced; the ratchet at the bottom runs the SAME scenario in a real process
 * attached to a real pty, against a scratch project laid out from the same pose, and compares the
 * bytes. Every previous road in this repository compared a renderer against its own output; this
 * one compares it against a terminal.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { applyMasks, resolvedConfigPath, runPose } from '../pose';
import type { CommandPose } from '../../../seams/commandPose';
import { readPoseDocument } from '../readPose';
import { installProjectFiles, posedProjectFiles } from '../../../seams/projectFiles';
import { POSES_ROOT } from '../catalogue';

/** The one scenario the pty ratchet drives - a refusal that reaches no seam but the project folder. */
const PTY_SCENARIO = path.join(POSES_ROOT, 'test', 'refusal-token-malformed.pose.json');

function poseFrom(posePath: string): CommandPose {
  return readPoseDocument(fs.readFileSync(posePath, 'utf8'));
}

describe('sherlo pose runs one command against a declared world', () => {
  it('a call the command makes that the pose did not script is refused, and the screen so far is printed with it', async () => {
    // `sherlo view 7` reads one build. This pose scripts NOTHING, so that read is the call it
    // cannot answer - and the intro the command already printed is the screen so far.
    const { screen, exitCode, refusals } = await runPose({
      pose: 1,
      argv: ['view', '7'],
      files: {
        'sherlo.config.json': {
          token: 'posetokenposetokenposetokenpose1tm0000017',
          devices: [{ id: 'pixel.7', osVersion: '13' }],
        },
      },
      env: {},
      git: 'none',
      bundles: {},
      api: [],
      masks: {},
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0].call).toBe('getBuildStatus');
    expect(refusals[0].problem).toContain('scripts no further calls');

    // THE SCREEN SO FAR. The command printed its wordmark before it asked, and that is what a
    // person would have been looking at when the run stopped.
    expect(screen).toContain('Make sure your mobile app looks perfect on every device');
    // And nothing the command prints AFTER the read it never got.
    expect(screen).not.toContain('Build #7');
    expect(exitCode).toBe(1);
  });

  it('a push that reaches the machine with no `push` is refused before any binary on this machine is read', async () => {
    const { push: _unstated, ...withoutPush } = poseFrom(
      path.join(POSES_ROOT, 'test', 'push-android-first-build-review-required.pose.json')
    );
    const { refusals, screen } = await runPose(withoutPush);

    expect(refusals.map((refusal) => refusal.call)).toEqual(['readBinary']);
    expect(refusals[0].problem).toContain('states no `push`');
    // The run stopped at its first read of the machine: no upload line, no build address.
    expect(screen).not.toContain('uploading build');
  });

  it('a call scripted with different arguments than the command made it with is refused too', async () => {
    const { refusals } = await runPose({
      ...poseFrom(path.join(POSES_ROOT, 'view', 'finished-no-changes.pose.json')),
      // The command line says build 7; the script answers for build 8.
      api: [
        {
          call: 'getBuildStatus',
          with: { buildIndex: 8 },
          answer: { runStatus: 'finished' },
        },
      ],
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0].problem).toContain('`buildIndex` = 8');
  });

  it('leaves this process exactly as it found it', async () => {
    // The run swaps the environment, the streams, the console and six seams. A run that left any
    // of them swapped would make the NEXT thing in this process - another pose, another test -
    // read the world through a pose it never asked for.
    const environmentBefore = { ...process.env };
    const consoleBefore = globalThis.console;
    const writeBefore = process.stdout.write;

    await runPose(poseFrom(PTY_SCENARIO));

    expect(process.env).toEqual(environmentBefore);
    expect(globalThis.console).toBe(consoleBefore);
    expect(process.stdout.write).toBe(writeBefore);
  });

  it('is hidden unless SHERLO_DEVTOOLS=1', async () => {
    // The same gate `--diagnostics` sits behind. A user running `sherlo --help` has no use for a
    // verb that takes a JSON document describing a run they are not making, and a verb that is
    // only ALMOST hidden is one somebody finds by accident and files a bug about.
    const helpFor = async (devtools: string | undefined): Promise<string> => {
      const { screen } = await runPose({
        pose: 1,
        argv: ['--help'],
        files: {},
        env: devtools === undefined ? {} : { SHERLO_DEVTOOLS: devtools },
        git: 'none',
        bundles: {},
        api: [],
        masks: {},
      });

      return screen;
    };

    expect(await helpFor(undefined)).not.toContain('pose');
    expect(await helpFor('1')).toContain('pose');
  });

  /* ------------------------------------------------------------------------ *
   * THE RECORDER'S OWN BYTES, pinned without needing the platform that makes  *
   * each. The case above runs the real `script`, so on any one machine it     *
   * exercises one of the two shapes; these hold both.                        *
   * ------------------------------------------------------------------------ */

  it('undoes the two things the recorder typed, on either platform, and nothing else', () => {
    const screen = 'ERROR: something\r\n\r\nNeed Help?\r\n';

    // BSD `script` hands the pty an end-of-input, and the terminal echoes it before the child has
    // printed anything.
    expect(stripRecorderKeystrokes(`^D\x08\x08${screen}`)).toBe('ERROR: something\n\nNeed Help?\n');

    // util-linux echoes nothing; the same screen comes back the same way.
    expect(stripRecorderKeystrokes(screen)).toBe('ERROR: something\n\nNeed Help?\n');
  });

  it("does NOT strip the recorder's framing prose - the recording must never carry any", () => {
    // util-linux writes `Script started on <date>` and `Script done on <date>` into the FILE it
    // is given, and `-q` silences the terminal rather than the file. That is why the file is
    // `/dev/null` and the bytes come off `script`'s stdout (see `recordThroughAPty`).
    //
    // Stripping that prose back out would mean pattern-matching it, and the blank line util-linux
    // puts after its header is indistinguishable from the blank line the sherlo intro itself
    // opens with - a strip that guessed wrong would eat a line of the product's screen and the
    // ratchet would go green having compared the wrong thing. So it is NOT stripped: if framing
    // ever reaches the recording, the byte comparison says so instead of quietly absorbing it.
    const framed = 'Script started on 2026-09-15 10:01:03+00:00 [COMMAND="x"]\r\nERROR: x\r\n';

    expect(stripRecorderKeystrokes(framed)).toContain('Script started on');
  });

  it('the bytes sherlo pose prints for a scenario equal the bytes a real terminal records for the same scenario', () => {
    const pose = poseFrom(PTY_SCENARIO);

    // The SAME pose, laid out as a real project on disk, with a real process run inside it.
    const scratch = posedProjectFiles(pose.files);
    const restoreFiles = installProjectFiles(scratch);
    const configPath = resolvedConfigPath(pose.argv);
    restoreFiles();

    try {
      const recorded = recordThroughAPty(pose.argv, scratch.root());

      const fromTheTerminal = applyMasks(recorded, pose, { root: scratch.root(), configPath });
      const fromThePose = fs.readFileSync(PTY_SCENARIO.replace(/\.pose\.json$/, '.txt'), 'utf8');

      // The committed screen carries the exit code on a line of its own; a terminal recording
      // carries only the bytes, so it is compared against the bytes.
      expect(fromTheTerminal).toBe(fromThePose.replace(/\n\[exit \d+\]\n$/, ''));
    } finally {
      scratch.remove();
    }
  });
});

/* ========================================================================== */

/**
 * Run the CLI in a real process attached to a real pty, in `projectRoot`, and return every byte it
 * wrote to that terminal.
 *
 * `script` is the pty: it is on macOS and on the ubuntu runner, it needs nothing installed, and it
 * gives the child a terminal rather than a pipe - which is the whole point, since the tool asks
 * whether it is talking to one. The two platforms spell the command differently and that is the
 * only thing this function branches on.
 *
 * THE TYPESCRIPT FILE IS `/dev/null` AND THE BYTES ARE TAKEN OFF `script`'s OWN STDOUT, and that
 * is load-bearing rather than a style choice. util-linux's `script` writes framing of its own into
 * the file it is given - `Script started on <date>` as the first line and `Script done on <date>`
 * as the last - and `-q` silences the TERMINAL, not the FILE. Stripping those back out means
 * pattern-matching the recorder's prose, and the header's trailing blank line is indistinguishable
 * from the blank line the sherlo intro itself opens with: a strip that guessed wrong would eat a
 * line of the product's screen and the ratchet would go green having compared the wrong thing.
 * Sending the framing to `/dev/null` and reading the terminal copy leaves nothing to guess.
 *
 * If `script` is not there, this FAILS - loudly, saying so. A ratchet that skipped itself on a
 * machine without a pty would be green on exactly the machine that could not prove anything.
 */
function recordThroughAPty(argv: string[], projectRoot: string): string {
  const command = [
    process.execPath,
    '-r',
    require.resolve('ts-node/register/transpile-only'),
    path.join(__dirname, 'support', 'cliEntry.ts'),
    ...argv,
  ];

  const [scriptCommand, scriptArgs] =
    process.platform === 'darwin'
      ? ['script', ['-q', '/dev/null', ...command]]
      : ['script', ['-q', '-c', command.map(shellQuote).join(' '), '/dev/null']];

  let recorded: string;
  try {
    recorded = execFileSync(scriptCommand, scriptArgs, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: {
        PATH: process.env.PATH,
        // `script -c` runs the command through `/bin/sh` on Linux, and node resolves a few
        // defaults against a home. Neither reaches the screen.
        HOME: process.env.HOME,
        // A terminal of the width the posed screen is drawn at, and colour at the one level the
        // posed screen forces. Everything else this run reads, it reads from the project folder.
        TERM: 'xterm',
        COLUMNS: '80',
        LINES: '24',
        FORCE_COLOR: '1',
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({
          module: 'commonjs',
          target: 'es2021',
          esModuleInterop: true,
          resolveJsonModule: true,
        }),
      },
    });
  } catch (error) {
    // The scenario is a REFUSAL, so the child exits non-zero and `execFileSync` throws - that is
    // the expected ending, and the output it captured before throwing is the recording.
    //
    // Anything that stopped `script` ITSELF - not installed, or it does not take these options -
    // carries no exit status, and is re-thrown saying so: a ratchet that quietly recorded nothing
    // would compare two empty strings and look exactly as green as a real proof.
    const failure = error as { status?: number; stdout?: string; message: string };

    if (failure.status === undefined) {
      throw new Error(
        `\`${scriptCommand} ${scriptArgs.join(' ')}\` could not be run, so no terminal ` +
          `recording was made: ${failure.message}`
      );
    }

    recorded = failure.stdout ?? '';
  }

  if (recorded.trim() === '') {
    throw new Error(
      `the terminal recording is empty - \`${scriptCommand} ${scriptArgs.join(' ')}\` produced ` +
        'no output at all, so the CLI it was asked to start never printed. Run that command by ' +
        'hand in the scratch project to see why.'
    );
  }

  return stripRecorderKeystrokes(recorded);
}

/**
 * Undo the two things the RECORDER put on the screen, and nothing else.
 *
 * A pty turns every newline into a carriage return and a newline; the screen a person reads is the
 * same either way, and the transcript this is compared against is written with newlines.
 *
 * And `script` gives the child a terminal with no keyboard behind it, so the terminal ECHOES the
 * end-of-input it is handed - the two characters `^D`, then two backspaces to rub them out again -
 * before the child has printed anything at all. That is the recorder typing, not the tool
 * printing.
 *
 * Exported so the cases at the bottom of this file can hold it to both recorders' shapes
 * without needing the platform that produces each.
 */
export function stripRecorderKeystrokes(recorded: string): string {
  // eslint-disable-next-line no-control-regex
  const endOfInputEcho = /^\^D\x08\x08/;

  return recorded.replace(endOfInputEcho, '').replace(/\r\n/g, '\n');
}

/** One word of a shell command line, quoted so a path with a space in it survives. */
function shellQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}
