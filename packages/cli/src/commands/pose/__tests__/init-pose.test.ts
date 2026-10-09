/**
 * THE SIXTH SEAM - `sherlo init` posed. The command installs a package, reports its progress to the
 * server and waits for a key; a pose answers the install and the key from `workstation`, the
 * reports from `api`, and the screen is the shipped tool's own.
 *
 * ------------------------------------------------------------------------
 * WHAT THESE CASES PROVE THAT THE CATALOGUE LAW CANNOT.
 *
 * ./catalogue.test.ts re-renders every committed pose and compares bytes, so it already guards
 * what the three init screens SAY. What it cannot see is what a run REACHED on its way there: a
 * posed init that quietly started a real package manager, talked to the real backend or put a real
 * terminal into raw mode would render exactly the same bytes on the machine that had all three.
 * So the cases below watch the three doors themselves - the shell runner the install goes through,
 * the pose's own script of server answers, and `process.stdin` - and only then check the screen.
 */
import fs from 'fs';
import path from 'path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { liveWorkstation, type PosedWorkstation } from '../../../seams/workstation';
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

const THE_THREE_SETUPS = ['first-setup', 'second-setup', 'abandoned-setup'];

describe('init through the sixth seam', () => {
  it("init runs against a pose: the install, the reports to the server and the key press are answered by the pose, and the screen is the shipped tool's own", async () => {
    for (const name of THE_THREE_SETUPS) {
      const { screen, exitCode, refusals, unusedCalls } = await runPose(poseNamed(name));

      // Nothing the pose could not answer, and nothing it answered that the run never asked:
      // together these say every install, every progress report and the key came from the pose.
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

  it('a first setup on a stock project prints the files it created and changed, from a pose that says Enter was pressed', async () => {
    const { screen, exitCode } = await runPose(poseNamed('first-setup'));

    expect(plain(screen)).toContain('Updated: <PROJECT_ROOT>/metro.config.js');
    expect(plain(screen)).toContain('Created: sherlo.config.json');
    // The prompt was shown and answered: the tool printed it, and the run walked past it into the
    // steps that only a pressed Enter reaches.
    expect(plain(screen)).toContain('Ready to move on? Press Enter...');
    expect(plain(screen)).toContain('To test your app run:');
    expect(exitCode).toBe(0);
  });

  it('a second setup on a project already set up prints Already updated and writes nothing', async () => {
    const { screen, exitCode } = await runPose(poseNamed('second-setup'));

    expect(plain(screen)).toContain('Already updated: <PROJECT_ROOT>/metro.config.js');
    expect(plain(screen)).toContain('Already created: sherlo.config.json');
    // The mirror, and the whole claim of this screen: a project found in place is left as found,
    // so neither of the first setup's two "I wrote this" lines may appear.
    expect(plain(screen)).not.toContain('Updated: <PROJECT_ROOT>/metro.config.js');
    expect(plain(screen)).not.toContain('Created: sherlo.config.json');
    expect(exitCode).toBe(0);
  });

  it('a pose with no workstation is a terminal nobody sits at: the prompt is refused and the screen ends with Setup cancelled', async () => {
    const { screen, exitCode, refusals } = await runPose(withNoWorkstation());

    expect(refusals.map(({ call }) => call)).toContain('somebodyIsAtTheKeyboard');
    // The tool's OWN cancel branch printed it - the seam supplies no words, only the refusal.
    expect(plain(screen)).toContain('ERROR: Setup cancelled');
    expect(plain(screen)).not.toContain('Created: sherlo.config.json');
    expect(exitCode).toBe(1);
  });

  // An agent or a CI job runs setup with no keyboard behind it.
  it('a pose that says nobody is at the keyboard skips the prompt and the setup finishes with the config file written', async () => {
    const { screen, exitCode, refusals } = await runPose(
      withWorkstation('first-setup', { enter: 'nobody' })
    );

    expect(refusals).toEqual([]);
    // Never asked: no question on the screen, and no keyboard read.
    expect(plain(screen)).not.toContain('Ready to move on? Press Enter...');
    expect(rawModeSet).toBe(false);
    // And the run went on past where the question would have been, to the config file.
    expect(configFilesWritten).toEqual([expect.stringMatching(/[/\\]sherlo\.config\.json$/)]);
    expect(plain(screen)).toContain('Created: sherlo.config.json');
    expect(plain(screen)).toContain('To test your app run:');
    expect(exitCode).toBe(0);
  });

  it('a project with an iOS Podfile has its pods answered by the pose, never by a real pod install', async () => {
    const { screen, exitCode, refusals } = await runPose(
      withWorkstation(
        'first-setup',
        { pods: 'installed' },
        { 'ios/Podfile': "platform :ios, '15.1'" }
      )
    );

    expect(refusals).toEqual([]);
    expect(packageManagerRuns).toEqual([]);
    expect(plain(screen)).toContain('Installed Pods');
    expect(exitCode).toBe(0);
  });

  it('a pod install the pose did not answer is a refusal of the pose, never a real pod install', async () => {
    const { refusals } = await runPose(
      withWorkstation('first-setup', {}, { 'ios/Podfile': "platform :ios, '15.1'" })
    );

    expect(refusals.map(({ call }) => call)).toEqual(['installPods']);
    expect(packageManagerRuns).toEqual([]);
  });

  it('pods stated for a project with no Podfile are a refusal of the pose, an answer to a pod install the command never ran', async () => {
    const { refusals } = await runPose(withWorkstation('first-setup', { pods: 'installed' }));

    expect(refusals.map(({ call }) => call)).toEqual(['installPods']);
    expect(packageManagerRuns).toEqual([]);
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
 * The abandoned setup with its `workstation` taken away - a terminal nobody sits at.
 *
 * Built from a committed pose rather than written out here, so it can never drift into describing
 * a project the catalogue does not. The ABANDONED one is the right parent: a run refused at the
 * prompt reports exactly as far as a cancelled one does, so its `api` is already the right length.
 */
function withNoWorkstation(): CommandPose {
  const terminalNobodySitsAt: CommandPose = { ...poseNamed('abandoned-setup') };
  delete terminalNobodySitsAt.workstation;

  return terminalNobodySitsAt;
}

/**
 * A committed init pose with its `workstation` answers changed and, optionally, files added to its
 * project - built from the committed pose for the same reason as {@link withNoWorkstation}.
 */
function withWorkstation(
  name: string,
  answers: Partial<PosedWorkstation>,
  addedFiles: Record<string, string> = {}
): CommandPose {
  const committed = poseNamed(name);

  return {
    ...committed,
    files: { ...committed.files, ...addedFiles },
    workstation: { ...committed.workstation!, ...answers },
  };
}

/** A screen with its colour taken off, for a case that is about words rather than styling. */
function plain(screen: string): string {
  // eslint-disable-next-line no-control-regex
  return screen.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}
