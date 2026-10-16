/**
 * `sherlo test` in EAS mode: each case lays a project out on disk,
 * fakes the service through the server seam and `eas` through the app builder seam, and runs
 * `easRun` - the part of the test that takes over when the staged gate refused a platform.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  installAppBuilder,
  makeLiveAppBuilder,
  type AppBuilder,
} from '../../../../seams/appBuilder';
import { installServerCalls, type ServerCalls } from '../../../../seams/serverCalls';
import type { Platform } from '@sherlo/api-types';
import type { BaseFingerprints } from '../../../../helpers/fingerprint';
import type { CommandParams, PushCredential } from '../../../../types';
import type { THIS_COMMAND } from '../../constants';
import { easRun } from '../easRun';

const mocks = vi.hoisted(() => ({
  closeTheRun: vi.fn().mockResolvedValue(undefined),
}));

// How the run ends on screen, and whether it waits, is the closer's (../../closeTheRun).
vi.mock('../../closeTheRun', () => ({ closeTheRun: mocks.closeTheRun }));

// What git says and the config's capture plan are not this file's question.
vi.mock('../../../../helpers', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGitInfo: async () => ({ branchName: 'feature/checkout', commitHash: 'abc', commitName: 'c' }),
  getBuildRunConfig: () => ({ android: { devices: [] }, ios: { devices: [] } }),
}));

// Starting the EAS builds is only a wait: its spinner is not asked about here.
vi.mock('../../../shared/terminal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  whileShowing: async (_kind: unknown, work: () => Promise<unknown>) => work(),
}));

/** The project token a CI push spends. */
const PROJECT_TOKEN: PushCredential = {
  kind: 'projectToken',
  token: 'posetokenposetokenposetokenpose1tm0000017',
  apiToken: 'posetokenposetokenposetokenpose1',
  teamId: 'tm000001',
  projectIndex: 7,
  fromSavedLogin: false,
};

/** A person's `sherlo login`, on a laptop. */
const SAVED_LOGIN: PushCredential = {
  kind: 'person',
  token: 'sht_thelogintokenofaperson',
  teamId: 'tm000001',
  projectIndex: 7,
  fromSavedLogin: true,
};

const TICKET = 'sbt_theticketoftest1';

/** A project set up for EAS mode, every piece in place. */
const HOOK_SCRIPTS = {
  'eas-build-on-complete': 'sherlo eas-build-on-complete',
  'eas-build-on-cancel': 'sherlo eas-build-on-complete',
};
const SHERLO_PROFILE = {
  distribution: 'internal',
  env: { SHERLO_BUILD: 'storybook' },
  android: { buildType: 'apk' },
  ios: { simulator: true },
};

let projectRoot: string;
let openBuild: ReturnType<typeof vi.fn>;
let startEasBuild: Mock<AppBuilder['startEasBuild']>;
/** What `.sherlo/data.json` held when the first EAS build started, or undefined when it was not there. */
let handOverWhenTheFirstBuildStarted: Record<string, unknown> | undefined;
let undoSeams: Array<() => void>;
/** Whether the machine has the `eas` program. */
let hasEasProgram: boolean;
let savedApiUrl: string | undefined;

function write(relativePath: string, content: unknown) {
  const full = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
}

function readHandOver(): Record<string, unknown> | undefined {
  const file = path.join(projectRoot, '.sherlo', 'data.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

/** The fingerprints the push's gate was asked with, taken before anything was built. */
const PUSH_FINGERPRINTS: BaseFingerprints = {
  android: {
    hash: 'android-fingerprint-of-the-push',
    nativeFingerprint: 'native-fingerprint-of-the-push',
    preimage: {
      workflow: 'managed',
      nativeSources: [],
      lockfiles: [{ file: 'package.json', digest: 'digest-of-package-json' }],
      autolinkedModules: ['expo-camera@1.0.0'],
      nativeFolderFiles: [],
    },
  },
  ios: {
    hash: 'ios-fingerprint-of-the-push',
    nativeFingerprint: 'native-fingerprint-of-the-push',
  },
};

function runEas({
  credential = PROJECT_TOKEN,
  easProfile,
  wait,
  appFolder = projectRoot,
  platforms = ['android', 'ios'],
}: {
  credential?: PushCredential;
  easProfile?: string;
  wait?: boolean;
  appFolder?: string;
  platforms?: Platform[];
} = {}) {
  const commandParams = {
    projectRoot: appFolder,
    credential,
    message: undefined,
    gitBranch: undefined,
    wait,
  } as unknown as CommandParams<THIS_COMMAND>;

  return easRun({
    commandParams,
    platforms,
    settings: { tool: 'eas', ...(easProfile ? { easProfile } : {}) },
    fingerprints: PUSH_FINGERPRINTS,
  });
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-eas-run-'));
  fs.mkdirSync(path.join(projectRoot, '.git'));
  write('package.json', {
    name: 'storefront',
    scripts: HOOK_SCRIPTS,
    devDependencies: { sherlo: '^3.0.0' },
  });
  write('eas.json', { build: { sherlo: SHERLO_PROFILE } });

  savedApiUrl = process.env.SHERLO_API_URL;
  delete process.env.SHERLO_API_URL;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  hasEasProgram = true;
  handOverWhenTheFirstBuildStarted = undefined;
  openBuild = vi.fn().mockResolvedValue({ build: { index: 1 }, buildTicket: TICKET });
  startEasBuild = vi.fn<AppBuilder['startEasBuild']>(async ({ platform }) => {
    if (!handOverWhenTheFirstBuildStarted) handOverWhenTheFirstBuildStarted = readHandOver();
    return { buildId: `eas-${platform}` };
  });

  undoSeams = [
    installServerCalls({ openBuild } as unknown as ServerCalls),
    installAppBuilder({
      ...makeLiveAppBuilder(async () => {
        throw new Error('nothing runs a process in these tests');
      }),
      hasEasProgram: async () => hasEasProgram,
      startEasBuild,
    }),
  ];
});

afterEach(() => {
  for (const undo of undoSeams) undo();
  if (savedApiUrl === undefined) delete process.env.SHERLO_API_URL;
  else process.env.SHERLO_API_URL = savedApiUrl;
  fs.rmSync(projectRoot, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('sherlo test in EAS mode refuses a project whose EAS builds could not report back', () => {
  it('refuses EAS mode when package.json lacks the eas-build-on-complete or eas-build-on-cancel script, naming each one missing, before opening a run', async () => {
    write('package.json', {
      scripts: { 'eas-build-on-complete': HOOK_SCRIPTS['eas-build-on-complete'] },
    });
    await expect(runEas()).rejects.toThrow(
      /package\.json has no "eas-build-on-cancel" script[\s\S]*"eas-build-on-cancel": "sherlo eas-build-on-complete"/
    );

    write('package.json', { scripts: {} });
    await expect(runEas()).rejects.toThrow(
      /no "eas-build-on-complete" or "eas-build-on-cancel" script/
    );

    expect(openBuild).not.toHaveBeenCalled();
    expect(startEasBuild).not.toHaveBeenCalled();
  });

  it('an EAS push is refused when the eas program is not installed', async () => {
    hasEasProgram = false;

    await expect(runEas()).rejects.toThrow(
      /the eas program isn't installed on this machine[\s\S]*npm install --global eas-cli/
    );

    expect(openBuild).not.toHaveBeenCalled();
    expect(startEasBuild).not.toHaveBeenCalled();
  });

  it('an EAS push is refused when the app does not depend on the sherlo package', async () => {
    write('package.json', { name: 'storefront', scripts: HOOK_SCRIPTS });

    await expect(runEas()).rejects.toThrow(
      /package\.json doesn't list "sherlo" as a dependency[\s\S]*npm install --save-dev sherlo/
    );

    expect(openBuild).not.toHaveBeenCalled();
  });

  it('an EAS push is refused when a hook script does not call sherlo eas-build-on-complete', async () => {
    write('package.json', {
      name: 'storefront',
      scripts: { ...HOOK_SCRIPTS, 'eas-build-on-cancel': 'echo cancelled' },
      devDependencies: { sherlo: '^3.0.0' },
    });

    await expect(runEas()).rejects.toThrow(
      /the "eas-build-on-cancel" script in package\.json doesn't run Sherlo[\s\S]*"eas-build-on-cancel": "sherlo eas-build-on-complete"/
    );

    expect(openBuild).not.toHaveBeenCalled();
  });

  it('an EAS push passes with the dependency at the monorepo root and npx sherlo in the scripts', async () => {
    write('apps/shop/package.json', {
      name: 'shop',
      scripts: {
        'eas-build-on-complete': 'npx sherlo eas-build-on-complete',
        'eas-build-on-cancel': 'yarn sherlo eas-build-on-complete',
      },
    });
    write('apps/shop/eas.json', { build: { sherlo: SHERLO_PROFILE } });

    await runEas({ appFolder: path.join(projectRoot, 'apps/shop') });

    expect(startEasBuild).toHaveBeenCalledTimes(2);
  });

  it('refuses EAS mode when eas.json has no profile build.easProfile names, showing the profile to add, before opening a run', async () => {
    await expect(runEas({ easProfile: 'storybook-ci' })).rejects.toThrow(
      /eas\.json has no "storybook-ci" build profile[\s\S]*"storybook-ci": \{[\s\S]*"env": \{ "SHERLO_BUILD": "storybook" \}/
    );

    expect(openBuild).not.toHaveBeenCalled();
  });

  it("refuses EAS mode when the profile's env does not set SHERLO_BUILD to storybook, showing the line to add, before opening a run", async () => {
    write('eas.json', { build: { sherlo: { ...SHERLO_PROFILE, env: { SHERLO_BUILD: 'off' } } } });

    await expect(runEas()).rejects.toThrow(
      /the "sherlo" profile in eas\.json doesn't set SHERLO_BUILD[\s\S]*"SHERLO_BUILD": "storybook"/
    );

    expect(openBuild).not.toHaveBeenCalled();
  });

  it('refuses EAS mode when the upload would leave out .sherlo/data.json, before opening a run', async () => {
    write('.gitignore', 'node_modules/\n.sherlo/\n');

    await expect(runEas()).rejects.toThrow(/EAS would leave \.sherlo\/data\.json out/);

    expect(openBuild).not.toHaveBeenCalled();
    expect(readHandOver()).toBeUndefined();
  });
});

describe('sherlo test in EAS mode opens a run and lets EAS build', () => {
  it('opens the run with an empty slot per platform and writes .sherlo/data.json before the EAS builds start', async () => {
    await runEas();

    // Both platforms' slots, and no app build in any of them: each EAS build fills its own.
    const request = openBuild.mock.calls[0][0];
    expect(request.asyncUpload).toBe(true);
    expect(Object.keys(request.buildRunConfig)).toEqual(['android', 'ios']);
    for (const binaryField of ['binaryHashes', 'binaryFileNames', 'androidS3Key', 'iosS3Key']) {
      expect(request).not.toHaveProperty(binaryField);
    }

    // The record says both app builds were made on EAS.
    expect(request.pushFacts.platforms).toEqual({
      android: { madeBy: 'eas' },
      ios: { madeBy: 'eas' },
    });

    expect(handOverWhenTheFirstBuildStarted).toMatchObject({ buildIndex: 1, profile: 'sherlo' });
    // Written through the project's one `.sherlo/` writer, which keeps it in EAS's upload.
    expect(fs.readFileSync(path.join(projectRoot, '.sherlo', '.gitignore'), 'utf8')).toContain(
      '!data.json'
    );
  });

  it('starts one EAS build per refused platform with build.easProfile, without waiting', async () => {
    write('eas.json', { build: { 'storybook-ci': SHERLO_PROFILE } });

    const { url } = await runEas({ easProfile: 'storybook-ci' });

    expect(startEasBuild.mock.calls.map(([build]) => build)).toEqual([
      { platform: 'android', profile: 'storybook-ci', projectRoot },
      { platform: 'ios', profile: 'storybook-ci', projectRoot },
    ]);
    expect(url).toContain('b=1');
  });

  it('EAS mode spends a sherlo login like any push', async () => {
    await runEas({ credential: SAVED_LOGIN });

    expect(openBuild.mock.calls[0][0]).toMatchObject({
      token: SAVED_LOGIN.token,
      teamId: 'tm000001',
      projectIndex: 7,
    });
    expect(startEasBuild).toHaveBeenCalledTimes(2);
    // The person's login stays on this machine: Expo's machine gets the run's ticket.
    expect(JSON.stringify(readHandOver())).not.toContain(SAVED_LOGIN.token);
    expect(readHandOver()).toMatchObject({ ticket: TICKET, teamId: 'tm000001', projectIndex: 7 });
  });

  it("with --wait, EAS mode waits through the EAS builds and the run, under the wait's own exit codes", async () => {
    await runEas({ wait: true });

    // The one wait every road ends on, entered once both EAS builds have started.
    expect(mocks.closeTheRun).toHaveBeenCalledTimes(1);
    const close = mocks.closeTheRun.mock.calls[0][0];
    expect(close.commandParams.wait).toBe(true);
    expect(close.buildIndex).toBe(1);
    expect(startEasBuild.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.closeTheRun.mock.invocationCallOrder[0]
    );
  });

  it('writes the Sherlo address the run was opened on into .sherlo/data.json when SHERLO_API_URL set it', async () => {
    await runEas();
    expect(readHandOver()).not.toHaveProperty('apiUrl');

    process.env.SHERLO_API_URL = 'https://api.a-test-copy-of-sherlo.example';
    await runEas();
    expect(readHandOver()).toMatchObject({ apiUrl: 'https://api.a-test-copy-of-sherlo.example' });
  });

  it("writes the run's one-build ticket into .sherlo/data.json and never a project token", async () => {
    await runEas();

    const handOver = readHandOver();
    expect(handOver).toMatchObject({ ticket: TICKET });
    expect(JSON.stringify(handOver)).not.toContain(PROJECT_TOKEN.token);
    expect(JSON.stringify(handOver)).not.toContain(PROJECT_TOKEN.apiToken);
  });

  it("the hand-over file carries the push's pre-build fingerprints", async () => {
    // The EAS hook registers the base with these, not with one taken on Expo's machine after
    // prebuild and the build, so the next code-only push matches the stored app build.
    await runEas();
    expect(handOverWhenTheFirstBuildStarted).toMatchObject({ fingerprints: PUSH_FINGERPRINTS });

    // Only the platforms EAS builds: a platform on its stored app build registers no base.
    await runEas({ platforms: ['ios'] });
    expect(readHandOver()?.fingerprints).toEqual({ ios: PUSH_FINGERPRINTS.ios });
  });
});
