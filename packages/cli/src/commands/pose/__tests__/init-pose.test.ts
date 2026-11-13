/**
 * THE SIXTH SEAM - `sherlo init` posed. The command installs packages and reports its progress to
 * the server; a pose answers the installs from `workstation`, the reports from `api`, and the screen
 * is the shipped tool's own. Setup asks nothing, so no key is ever read.
 *
 * ------------------------------------------------------------------------
 * WHAT THESE CASES PROVE THAT THE CATALOGUE LAW CANNOT.
 *
 * ./catalogue.test.ts re-renders every committed pose and compares bytes, so it already guards
 * what the init screens SAY. What it cannot see is what a run REACHED on its way there: a posed
 * init that quietly started a real package manager, talked to the real backend or put a real
 * terminal into raw mode would render exactly the same bytes on the machine that had all three.
 * So the cases below watch the three doors themselves - the shell runner the install goes through,
 * the pose's own script of server answers, and `process.stdin` - and only then check the screen.
 */
import fs from 'fs';
import path from 'path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { liveWorkstation } from '../../../seams/workstation';
import { POSES_ROOT } from '../catalogue';
import { runPose } from '../pose';
import type { CommandPose } from '../../../seams/commandPose';
import { readPoseDocument } from '../readPose';

/**
 * Every command a real package manager run would have been started with.
 *
 * THE SHELL RUNNER IS MOCKED RATHER THAN SPIED ON, at the leaf the live workstation reaches
 * through: a spy would still let the command run, and "a posed init never installs anything" is
 * exactly the claim a suite must not verify by installing something.
 */
const { packageManagerRuns } = vi.hoisted(() => ({ packageManagerRuns: [] as string[] }));

vi.mock('../../../helpers/runShellCommand/executeCommand', () => ({
  default: ({ command }: { command: string }) => {
    packageManagerRuns.push(command);
    return Promise.resolve('');
  },
}));

/**
 * Every `sherlo.config.json` the run wrote, by path. The write still happens - into the posed
 * folder - and is only watched, because the screen's "Created" line alone could not tell a written
 * file from a printed claim.
 */
const { configFilesWritten } = vi.hoisted(() => ({ configFilesWritten: [] as string[] }));

vi.mock('fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs/promises')>();
  const writeFile: typeof real.writeFile = (file, ...rest) => {
    if (String(file).endsWith('sherlo.config.json')) configFilesWritten.push(String(file));
    return real.writeFile(file, ...rest);
  };

  return { ...real, default: { ...real, writeFile }, writeFile };
});

/** Whether the run put a real terminal into raw mode - what reading a real keyboard begins with. */
let rawModeSet = false;
const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'setRawMode');

Object.defineProperty(process.stdin, 'setRawMode', {
  value: () => {
    rawModeSet = true;
    return process.stdin;
  },
  configurable: true,
  writable: true,
});

afterEach(() => {
  packageManagerRuns.length = 0;
  configFilesWritten.length = 0;
  rawModeSet = false;
});

afterAll(() => {
  if (stdinDescriptor) Object.defineProperty(process.stdin, 'setRawMode', stdinDescriptor);
  else delete (process.stdin as unknown as Record<string, unknown>).setRawMode;
});

const THE_TWO_SETUPS = ['first-setup', 'second-setup'];

describe('init through the sixth seam', () => {
  it("init runs against a pose: the installs and the reports to the server are answered by the pose, and the screen is the shipped tool's own", async () => {
    for (const name of THE_TWO_SETUPS) {
      const { screen, exitCode, refusals, unusedCalls } = await runPose(poseNamed(name));

      // Nothing the pose could not answer, and nothing it answered that the run never asked:
      // together these say every install and every progress report came from the pose.
      expect(refusals, `${name}: the pose could not answer this run`).toEqual([]);
      expect(unusedCalls, `${name}: the pose scripts a call this run never made`).toEqual([]);

      // The three doors, watched rather than assumed.
      expect(packageManagerRuns, `${name}: a posed run started a real package manager`).toEqual([]);
      expect(rawModeSet, `${name}: a posed run read a real keyboard`).toBe(false);

      // And the screen is the one the catalogue committed - the shipped tool's own bytes, exit
      // code and all.
      expect(`${screen}\n[exit ${exitCode}]\n`).toBe(committedScreenOf(name));
    }
  });

  it('a first setup on a stock project prints the files it created and changed, and asks nothing', async () => {
    const { screen, exitCode } = await runPose(poseNamed('first-setup'));

    expect(plain(screen)).toContain('Created config');
    expect(plain(screen)).toMatch(/Updated Metro config +metro\.config\.js\n/);
    expect(plain(screen)).not.toContain('Press Enter');
    expect(configFilesWritten).toEqual([expect.stringMatching(/[/\\]sherlo\.config\.json$/)]);
    expect(plain(screen)).toContain('npx sherlo test');
    expect(exitCode).toBe(0);
  });

  it('a second setup on a project already set up says each step was already done and writes no config', async () => {
    const { screen, exitCode } = await runPose(poseNamed('second-setup'));

    // A project found in place is left as found: the config and Metro lines both say so.
    expect(plain(screen)).toMatch(/Created config +sherlo\.config\.json \(already done\)/);
    expect(plain(screen)).toMatch(/Updated Metro config +metro\.config\.js \(already done\)/);
    expect(configFilesWritten).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('CONTROL: the watched door IS the one a live pod install goes through', async () => {
    await liveWorkstation.installPods({
      command: 'cd ios && pod install',
      projectRoot: '/nowhere',
    });

    expect(packageManagerRuns).toEqual(['cd ios && pod install']);
  });

  it('CONTROL: the watched door IS the one a live install goes through', async () => {
    // Without this, a mock aimed at a path nothing imports any more would leave every "no real
    // package manager ran" assertion above passing while watching nothing at all.
    await liveWorkstation.addPackage({
      packageSpec: '@sherlo/react-native-storybook',
      command: 'yarn add @sherlo/react-native-storybook',
      projectRoot: '/nowhere',
    });

    expect(packageManagerRuns).toEqual(['yarn add @sherlo/react-native-storybook']);
  });

  it('an install the pose did not answer is a refusal of the pose, never a real package manager run', async () => {
    const { refusals } = await runPose(withNoWorkstation());

    expect(refusals.map(({ call }) => call)).toContain('addPackage');
    expect(packageManagerRuns).toEqual([]);
  });
});

/* ========================================================================== */

/** One of the committed init poses, read the way `sherlo pose` reads it. */
function poseNamed(name: string): CommandPose {
  return readPoseDocument(fs.readFileSync(posePathOf(name), 'utf8'));
}

/** The bytes the catalogue committed for that pose: the whole screen, then its exit code. */
function committedScreenOf(name: string): string {
  return fs.readFileSync(path.join(POSES_ROOT, 'init', `${name}.txt`), 'utf8');
}

function posePathOf(name: string): string {
  return path.join(POSES_ROOT, 'init', `${name}.pose.json`);
}

/**
 * The first setup with its `workstation` taken away, so nothing answers its installs. Built from a
 * committed pose rather than written out here, so it can never drift into describing a project the
 * catalogue does not.
 */
function withNoWorkstation(): CommandPose {
  const nothingAnswersTheInstalls: CommandPose = { ...poseNamed('first-setup') };
  delete nothingAnswersTheInstalls.workstation;

  return nothingAnswersTheInstalls;
}

/** A screen with its colour taken off, for a case that is about words rather than styling. */
function plain(screen: string): string {
  // eslint-disable-next-line no-control-regex
  return screen.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
