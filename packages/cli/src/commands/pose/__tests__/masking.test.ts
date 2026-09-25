/**
 * ONE MASKER, THE TOOL'S OWN (sherlo / Drawing for a plan, "What the tool folds on its own").
 *
 * A screen carries values no plan can state and no fixture should pin. The tool folds each of
 * them to a placeholder by CLASS, on every screen `sherlo pose` prints, and the same folding is
 * reachable from outside through a hidden devtool verb so the test repository applies it to a real
 * run's screen. Written as a skeleton in plan (epic pose-road-hardening, task pose-road-masker);
 * the worker fills the bodies and never renames a case.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CLASSES_THE_TOOL_FOLDS, maskScreen } from '../maskScreen';
import { applyMasks } from '../pose';
import { POSES_ROOT, catalogue } from '../catalogue';
import { readPoseDocument } from '../readPose';

/** The escape byte a styled screen is full of, named so this file carries none of them raw. */
const ESC = String.fromCharCode(27);

/**
 * How long a case that starts a REAL process is given.
 *
 * The three verb cases below spawn the CLI through ts-node, which transpiles the whole command
 * graph before the verb has read a byte - seconds, not milliseconds, and more of them on a loaded
 * machine running the rest of this suite in parallel. A default five-second budget makes those
 * cases a coin toss on CI, which is worse than no case at all.
 */
const A_REAL_PROCESS = 60_000;

/** The one pose whose committed screen these cases read, and the pose that rendered it. */
const WAITED_PUSH = path.join(POSES_ROOT, 'test', 'push-android-wait-names-the-screens');

/**
 * ONE RUN, TWICE: the screen a pose rendered for it, and the screen a live run printed.
 *
 * Every line here is the same run said twice. What the SCENARIO declares - which test this is,
 * how many devices it runs on, the deadline the wait was given, the verdict - is identical in
 * both, because that is what a pose states and what a reader checks. Everything else differs the
 * way two real runs of one scenario differ: another binary size, another address, another
 * fingerprint, another number of polls, and the spinner and diagnostic litter a live terminal
 * leaves behind.
 */
const POSED_SCREEN = [
  'Test 4 will run on 1 device (1 Android)',
  '➜  uploading build... (48.12 MB)',
  '✔  reusing unchanged build (Test 1, 7 minutes ago)',
  `base-fingerprint=${'a0'.repeat(32)}`,
  '🔗 https://app.sherlo.io/build?t=tm000001&p=7&b=4',
  '⏳ Waiting for build results (timeout: 45min)...',
  '   🟢 Finished',
  '',
  '✅ All stories passed - no visual changes require review.',
].join('\n');

const LIVE_SCREEN = [
  'Test 4 will run on 1 device (1 Android)',
  '➜  uploading build... (51.7 MB)',
  '✔  reusing unchanged build (Test 1, 3 hours ago)',
  `base-fingerprint=${'b3'.repeat(32)}`,
  '🔗 https://app.test.sherlo.io/build?t=tm913377&p=2&b=91',
  '⏳ Waiting for build results (timeout: 45min)...',
  '   🟡 Queued',
  '   🔵 Running',
  '   still running... (5m elapsed)',
  '   🟢 Finished',
  '',
  '[Sherlo] TurboSnap: 14 of 61 stories reachable from the changed files',
  `✅ All stories passed - no visual changes require review.${ESC}[?25h`,
].join('\n');

describe('the masker folds every volatile class the tool prints', () => {
  it('every volatile class the tool prints is folded to one placeholder, by class, on a posed screen and on a live screen alike', () => {
    // THE WHOLE POINT OF THE MODULE, in one case. A test repository takes the screen a real run
    // printed, folds it here, and compares it against the screen a pose rendered folded by the
    // same rule. If those two ever came out different for one run said twice, every storyline
    // comparing them would be red for nobody's change.
    expect(maskScreen(LIVE_SCREEN, {})).toBe(maskScreen(POSED_SCREEN, {}));

    const folded = maskScreen(POSED_SCREEN, {});

    expect(folded).toContain('<SIZE> MB');
    expect(folded).toContain('<TIME_AGO>');
    expect(folded).toContain('base-fingerprint=<FINGERPRINT>');
    expect(folded).toContain('https://<APP_HOST>/build?t=<TEAM>&p=<PROJECT>&b=<BUILD>');
    expect(folded).toContain('   <build progress masked>');

    // FOLDING A FOLDED SCREEN CHANGES NOTHING, and every committed screen in the catalogue has
    // already been through this once. A class that was not idempotent would rewrite them on
    // every re-mint - a diff nobody made, in the one file a reviewer is meant to read.
    expect(maskScreen(folded, {})).toBe(folded);
    expect(maskScreen(fs.readFileSync(`${WAITED_PUSH}.txt`, 'utf8'), {})).toBe(
      fs.readFileSync(`${WAITED_PUSH}.txt`, 'utf8')
    );
  });

  it('folds a token wherever it appears - after --token, after token:, in a build url, in an Authorization header', () => {
    const projectToken = 'posetokenposetokenposetokenpose1tm0000017';
    const personalToken = 'sht_apersonaltokennobodyshouldeversee';
    const headerValue = 'YTp2ZXJ5LXNlY3JldC12YWx1ZQ';

    const folded = maskScreen(
      [
        `$ sherlo test --token ${projectToken}`,
        `$ sherlo team list --personal-token ${personalToken}`,
        `  "token": "${projectToken}",`,
        `🔗 https://app.sherlo.io/build?t=${personalToken}&p=7&b=4`,
        `Authorization: Basic ${headerValue}`,
      ].join('\n'),
      {}
    );

    expect(folded).not.toContain(projectToken);
    expect(folded).not.toContain(personalToken);
    expect(folded).not.toContain(headerValue);

    expect(folded).toContain('--token <MASKED>');
    expect(folded).toContain('--personal-token <MASKED>');
    expect(folded).toContain('"token": "<MASKED>"');
    expect(folded).toContain('Authorization: Basic <MASKED>');
    // A token that reached the team slot of a build address folds away with the address.
    expect(folded).toContain('https://<APP_HOST>/build?t=<TEAM>&p=<PROJECT>&b=<BUILD>');
  });

  it('folds a build url, a size in megabytes, a duration, the time since a build and a base fingerprint', () => {
    const folded = maskScreen(
      [
        '🔗 https://app.test.sherlo.io/build?t=tm913377&p=2&b=91',
        '➜  uploading build... (51.7 MB)',
        '  ✓ Bundle: bundle.android.js (912.40 KB, plain-js, expo)',
        '   settled in 2.3s over 4 frames · testing mode',
        '✔  reusing unchanged build (Test 1, 3 hours ago)',
        `base-fingerprint=${'b3'.repeat(32)}`,
      ].join('\n'),
      {}
    );

    expect(folded).toBe(
      [
        '🔗 https://<APP_HOST>/build?t=<TEAM>&p=<PROJECT>&b=<BUILD>',
        '➜  uploading build... (<SIZE> MB)',
        // THE UNIT FOLDS WITH THE NUMBER: the same bundle reads in kilobytes here and in
        // megabytes on a printer that scaled it differently.
        '  ✓ Bundle: bundle.android.js (<SIZE> MB, plain-js, expo)',
        '   settled in <SETTLED> over 4 frames · testing mode',
        '✔  reusing unchanged build (Test 1, <TIME_AGO>)',
        'base-fingerprint=<FINGERPRINT>',
      ].join('\n')
    );
  });

  it('folds the progress lines a wait prints to one placeholder, however many a run printed', () => {
    const waited = (progress: string[]): string =>
      [
        '⏳ Waiting for build results (timeout: 45min)...',
        ...progress,
        '',
        '✅ All stories passed - no visual changes require review.',
      ].join('\n');

    const onePoll = maskScreen(waited(['   🟢 Finished']), {});
    const manyPolls = maskScreen(
      waited([
        '   🟡 Queued',
        '   🔵 Running',
        '   still running... (5m elapsed)',
        '   Network error, retrying... (socket hang up)',
        '   🟢 Finished',
      ]),
      {}
    );

    expect(manyPolls).toBe(onePoll);
    expect(onePoll.split('\n')).toEqual([
      // THE DEADLINE IN THE HEADER IS THE SCENARIO'S OWN and survives untouched; so does the
      // closer under the region, because the region ends at the blank line that frames it.
      '⏳ Waiting for build results (timeout: 45min)...',
      '   <build progress masked>',
      '',
      '✅ All stories passed - no visual changes require review.',
    ]);
  });

  it('folds a commit id, a run namespace in a branch name, a team id and a project index', () => {
    const folded = maskScreen(
      [
        '    "sha": "4f3a9c1d2e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c",',
        '    "branch": "e2e/1758700000000-ab12/dev",',
        'teamId=tm913377',
        'projectIndex=12',
      ].join('\n'),
      {}
    );

    expect(folded).toBe(
      [
        '    "sha": "<SHA>",',
        // ONLY THE NAMESPACE. The rest of the branch is the scenario's own word.
        '    "branch": "e2e/<run>/dev",',
        'teamId=<TEAM>',
        'projectIndex=<PROJECT>',
      ].join('\n')
    );
  });

  it("folds a capture record's settle time, screenful count and measured size", () => {
    const folded = maskScreen(
      [
        '   settled in 1.4s over 6 frames · testing mode',
        '   captured in 3 screenfuls - the story scrolls past the first',
        '     <ScrollView> (360 x 800)',
        '       <Text> (328 x 16)',
      ].join('\n'),
      {}
    );

    expect(folded).toBe(
      [
        '   settled in <SETTLED> over 6 frames · testing mode',
        '   captured in <PARTS> screenfuls - the story scrolls past the first',
        // MEASURED, NOT DECLARED: one story lays out to different points on different devices.
        '     <ScrollView> (<SIZE>)',
        '       <Text> (<SIZE>)',
      ].join('\n')
    );
  });

  it('strips the terminal artifacts a live run leaves - spinner redraws and the cursor-show sequence', () => {
    const posedSpinner =
      `${ESC}[?25l${ESC}[1G${ESC}[1G⠋ Installing Sherlo${ESC}[1G${ESC}[0K${ESC}[?25h` +
      '✔ Installed Sherlo';
    const liveSpinner =
      `${ESC}[?25l${ESC}[1G⠋ Installing Sherlo${ESC}[1G${ESC}[0K` +
      `${ESC}[1G⠙ Installing Sherlo${ESC}[1G${ESC}[0K` +
      `${ESC}[1G⠹ Installing Sherlo${ESC}[1G${ESC}[0K${ESC}[?25h` +
      `✔ Installed Sherlo${ESC}[?25h`;

    // WHICH FRAME A READER ENDS UP WITH IS WHICHEVER THE MACHINE REACHED, so no frame is kept:
    // the line the spinner succeeds into says everything the frames were saying.
    expect(maskScreen(liveSpinner, {})).toBe('✔ Installed Sherlo');
    expect(maskScreen(posedSpinner, {})).toBe('✔ Installed Sherlo');
  });

  it('a class that sits right after a colour escape folds the same as one on plain text', () => {
    // A COLOUR ESCAPE ENDS IN A LETTER (`ESC[34m`), and a letter next to a digit is not a word
    // boundary - which is exactly where the tool prints its values, right after switching colour.
    // Every class below is put right there, once with the escapes on and once with them stripped,
    // and both must fold to the same placeholder.
    const withEscapes = [
      `✔  reusing unchanged build (Test 1, ${ESC}[34m1 minute ago${ESC}[39m)`,
      `➜  uploading build... (${ESC}[2m48.12 MB${ESC}[22m)`,
      `${ESC}[32m4f3a9c1d2e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c${ESC}[39m`,
      `${ESC}[32mbase-fingerprint=${'a0'.repeat(32)}${ESC}[39m`,
      `${ESC}[32mteamId=tm913377${ESC}[39m`,
      `${ESC}[32mprojectIndex=12${ESC}[39m`,
    ].join('\n');

    const withoutEscapes = [
      '✔  reusing unchanged build (Test 1, 1 minute ago)',
      '➜  uploading build... (48.12 MB)',
      '4f3a9c1d2e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9c',
      `base-fingerprint=${'a0'.repeat(32)}`,
      'teamId=tm913377',
      'projectIndex=12',
    ].join('\n');

    const foldedWithEscapes = maskScreen(withEscapes, {});
    const foldedWithoutEscapes = maskScreen(withoutEscapes, {});

    expect(foldedWithEscapes.replace(new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g'), '')).toBe(
      foldedWithoutEscapes
    );
    expect(foldedWithEscapes).toContain('<TIME_AGO>');
    expect(foldedWithEscapes).toContain('<SIZE> MB');
    expect(foldedWithEscapes).toContain('<SHA>');
    expect(foldedWithEscapes).toContain('base-fingerprint=<FINGERPRINT>');
    expect(foldedWithEscapes).toContain('teamId=<TEAM>');
    expect(foldedWithEscapes).toContain('projectIndex=<PROJECT>');
  });

  it('never folds a value the pose declares - a story count, a wait deadline, a branch name', () => {
    const declared = [
      'Test 4 will run on 1 device (1 Android)',
      '⏳ Waiting for build results (timeout: 45min)...',
      '   🟢 Finished',
      '',
      '⚠️  Build finished with changes requiring review.',
      '   unreviewed: Storefront/ProductCard - Default',
      '   3 more settled - approved, unchanged or inherited.',
      '    "branch": "feature/checkout",',
      '[exit 1]',
    ].join('\n');

    const folded = maskScreen(declared, {});

    // A story count, a deadline, a screen's name, a branch outside a run namespace, an exit code:
    // every one of them is something the scenario SAID, and the reason its screen exists.
    expect(folded).toContain('Test 4 will run on 1 device (1 Android)');
    expect(folded).toContain('(timeout: 45min)');
    expect(folded).toContain('unreviewed: Storefront/ProductCard - Default');
    expect(folded).toContain('3 more settled - approved, unchanged or inherited.');
    expect(folded).toContain('"branch": "feature/checkout",');
    expect(folded).toContain('[exit 1]');
  });
});

describe('sherlo mask - the same folding for a screen the tool did not print itself', () => {
  it(
    'reads a screen on stdin and prints it folded, byte for byte what applyMasks would have produced',
    () => {
      const scenario = readPoseDocument(fs.readFileSync(`${WAITED_PUSH}.pose.json`, 'utf8'));

      // BYTE FOR BYTE, which is the only comparison worth making: the test repository folds a live
      // screen through the verb and holds the result against a screen the pose road folded.
      expect(runMask(LIVE_SCREEN, [])).toBe(
        applyMasks(LIVE_SCREEN, scenario, { root: '', configPath: '' })
      );
    },
    A_REAL_PROCESS
  );

  it(
    'takes the project root and the config path as flags, because a live run has its own',
    () => {
      const projectRoot = '/tmp/a-live-run-12345';
      const configPath = `${projectRoot}/sherlo.config.json`;

      const folded = runMask(
        [`✔ Created: ${configPath}`, `ERROR: nothing at ${projectRoot}/builds`].join('\n'),
        ['--project-root', projectRoot, '--config-path', configPath]
      );

      expect(folded).toBe(
        ['✔ Created: <SHERLO_CONFIG_PATH>', 'ERROR: nothing at <PROJECT_ROOT>/builds'].join('\n')
      );
    },
    A_REAL_PROCESS
  );

  it(
    'is hidden unless SHERLO_DEVTOOLS=1, like sherlo pose',
    () => {
      // A user who runs `sherlo --help` has no use for a verb that folds a transcript, so the verb
      // is not there at all for them - the routing never learns it, exactly as `sherlo pose`.
      expect(() => runMask('a screen', [], { devtools: false })).toThrow(/unknown command/i);
    },
    A_REAL_PROCESS
  );
});

describe('a pose declares only a scenario literal in masks', () => {
  it('the catalogue refuses a pose whose masks entry duplicates a class the tool already folds', () => {
    const describingTheMasker = catalogue()
      .map(({ name, posePath }) => ({
        name,
        duplicated: Object.keys(readPoseDocument(fs.readFileSync(posePath, 'utf8')).masks).filter(
          (placeholder) => CLASSES_THE_TOOL_FOLDS.includes(placeholder)
        ),
      }))
      .filter(({ duplicated }) => duplicated.length > 0)
      .map(({ name, duplicated }) => `${name} - ${duplicated.join(', ')}`);

    expect(
      describingTheMasker,
      'these poses name a placeholder the tool already folds by shape. `masks` is for the one ' +
        'thing only a scenario knows: a literal the pose itself put on the screen. Drop the entry.'
    ).toEqual([]);
  });
});

/* ========================================================================== */

/**
 * Run `sherlo mask` in a REAL process with a screen on its stdin, and give back what it printed.
 *
 * A child process rather than a call into the module, because what these three cases are about is
 * the VERB: the gate it sits behind, the flags it takes, and the bytes it puts on stdout. Calling
 * the function directly would prove none of that.
 */
function runMask(
  screen: string,
  flags: string[],
  { devtools = true }: { devtools?: boolean } = {}
): string {
  try {
    return execFileSync(
      process.execPath,
      [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        path.join(__dirname, 'support', 'cliEntry.ts'),
        'mask',
        ...flags,
      ],
      {
        input: screen,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          ...(devtools ? { SHERLO_DEVTOOLS: '1' } : {}),
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({
            module: 'commonjs',
            target: 'es2021',
            esModuleInterop: true,
            resolveJsonModule: true,
          }),
        },
      }
    );
  } catch (error) {
    const failure = error as { status?: number; stderr?: string; message: string };

    throw new Error(
      `\`sherlo mask ${flags.join(' ')}\` exited ${failure.status ?? '(never started)'}: ` +
        `${failure.stderr ?? failure.message}`
    );
  }
}
