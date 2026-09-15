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
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { applyMasks, resolvedConfigPath, runPose } from '../pose';
import { readPoseDocument, type CommandPose } from '../readPose';
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
    // The run swaps the environment, the streams, the console and four seams. A run that left any
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
 * Run the CLI in a real process attached to a real pty, in `projectRoot`, and return every byte
 * it wrote to that terminal.
 *
 * `script` is the pty: it is on macOS and on the ubuntu runner, it needs nothing installed, and
 * it gives the child a terminal rather than a pipe - which is the whole point, since the tool
 * asks whether it is talking to one. The two platforms spell the command differently and that is
 * the only thing this function branches on.
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

  const recording = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-pty-')), 'typescript');

  const [scriptCommand, scriptArgs] =
    process.platform === 'darwin'
      ? ['script', ['-q', recording, ...command]]
      : ['script', ['-q', '-c', command.map(shellQuote).join(' '), recording]];

  try {
    execFileSync(scriptCommand, scriptArgs, {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        PATH: process.env.PATH,
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
    // The scenario is a REFUSAL, so the child exits non-zero and `execFileSync` throws. That is
    // the expected ending; anything that stopped `script` itself from running is not.
    if ((error as { status?: number }).status === undefined) throw error;
  }

  // TWO BYTES OF THE RECORDING BELONG TO THE RECORDER, NOT TO THE TOOL, and both are undone here
  // rather than tolerated in the comparison - everything else is compared exactly.
  //
  //   - A pty turns every newline into a carriage return and a newline. The screen a person reads
  //     is the same either way, and the transcript this is compared against is written with
  //     newlines.
  //   - `script` gives the child a terminal with no keyboard behind it, and the terminal ECHOES
  //     the end-of-input it is handed - the two characters `^D`, then two backspaces to rub them
  //     out again - before the child has printed anything at all. That is the recorder typing,
  //     not the tool printing.
  return fs
    .readFileSync(recording, 'utf8')
    .replace(/^\^D\x08\x08/, '')
    .replace(/\r\n/g, '\n');
}

/** One word of a shell command line, quoted so a path with a space in it survives. */
function shellQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}
