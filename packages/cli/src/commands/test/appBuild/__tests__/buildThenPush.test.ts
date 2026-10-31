/**
 * `sherlo test` BUILDS WHAT THE STAGED GATE REFUSED, THEN PUSHES.
 *
 * Each case runs a catalogued build pose (`poses/test/build-*`), or one changed for the case, end to
 * end: the posed server, machine and app builder answer every call, and record what each was asked
 * - which is the question here, because a pose's `with` never states a whole request.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ASYNC_UPLOAD_S3_KEY_PLACEHOLDER } from '@sherlo/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScriptedCall, ServerCalls } from '../../../../seams/serverCalls';

/** What the posed seams were asked, in order. */
const { sentRequests, builderCalls, binaryPuts, fingerprintsOnTheMachine } = vi.hoisted(() => ({
  sentRequests: [] as Array<{ operation: string; request: Record<string, any> }>,
  builderCalls: [] as Array<{ call: string; platform: string }>,
  binaryPuts: [] as string[],
  /** Each fingerprint the posed machine computed: what a fingerprint taken after the build reads. */
  fingerprintsOnTheMachine: [] as string[],
}));

vi.mock('../../../../seams/serverCalls', async (importActual) => {
  const actual = await importActual<typeof import('../../../../seams/serverCalls')>();

  return {
    ...actual,
    // The pose's own server, unchanged, with every operation recording what it was sent first.
    posedServerCalls: (script: ScriptedCall[]) => {
      const posedServer = actual.posedServerCalls(script);
      const recordingServer = { ...posedServer };

      for (const operation of Object.keys(actual.liveServerCalls) as Array<keyof ServerCalls>) {
        const answer = posedServer[operation] as (request: Record<string, unknown>) => unknown;
        (recordingServer as Record<string, unknown>)[operation] = (
          request: Record<string, any>
        ) => {
          sentRequests.push({ operation, request });
          return answer(request);
        };
      }

      return recordingServer;
    },
  };
});

vi.mock('../../../../seams/appBuilder', async (importActual) => {
  const actual = await importActual<typeof import('../../../../seams/appBuilder')>();

  return {
    ...actual,
    // The pose's own builder, recording which platform it compiled here or started on EAS.
    posedAppBuilder: (posed: Parameters<typeof actual.posedAppBuilder>[0]) => {
      const builder = actual.posedAppBuilder(posed);
      return {
        ...builder,
        compile: (params: Parameters<typeof builder.compile>[0]) => {
          builderCalls.push({ call: 'compile', platform: params.platform });
          return builder.compile(params);
        },
        startEasBuild: (params: Parameters<typeof builder.startEasBuild>[0]) => {
          builderCalls.push({ call: 'startEasBuild', platform: params.platform });
          return builder.startEasBuild(params);
        },
      };
    },
  };
});

vi.mock('../../../../seams/nativeBuild', async (importActual) => {
  const actual = await importActual<typeof import('../../../../seams/nativeBuild')>();

  return {
    ...actual,
    // The pose's own machine, recording every app build it uploaded and every fingerprint it took.
    posedNativeBuild: (push: Parameters<typeof actual.posedNativeBuild>[0]) => {
      const machine = actual.posedNativeBuild(push);
      return {
        ...machine,
        computeFingerprint: (projectRoot: string, command: string) => {
          fingerprintsOnTheMachine.push(projectRoot);
          return machine.computeFingerprint(projectRoot, command);
        },
        putBinary: (uploadUrl: string, data: Parameters<typeof machine.putBinary>[1]) => {
          binaryPuts.push(uploadUrl);
          return machine.putBinary(uploadUrl, data);
        },
      };
    },
  };
});

import stripAnsi from '../../../../helpers/stripAnsi';
import { POSES_ROOT } from '../../../pose/catalogue';
import { runPose } from '../../../pose/pose';
import { readPoseDocument } from '../../../pose/readPose';

/** A catalogued `sherlo test` pose, read fresh so a case may change it. */
function testPose(name: string) {
  return readPoseDocument(
    fs.readFileSync(path.join(POSES_ROOT, 'test', `${name}.pose.json`), 'utf8')
  );
}

type PoseDocument = ReturnType<typeof testPose>;

/**
 * The gate's calls ask about any base fingerprint: a case that changes the posed project's files
 * changes the fingerprint the run computes, and what the gate answers is the case, not the hash.
 */
function gateForAnyFingerprint(pose: PoseDocument): PoseDocument {
  for (const call of pose.api as Array<{ call: string; with?: Record<string, unknown> }>) {
    if (call.call === 'checkStagedGate' && call.with) delete call.with.baseFingerprint;
  }
  return pose;
}

function operationsSent(): string[] {
  return sentRequests.map(({ operation }) => operation);
}

function requestOf(operation: string): Record<string, any> | undefined {
  return sentRequests.find((sent) => sent.operation === operation)?.request;
}

function platformsCalled(call: string): string[] {
  return builderCalls.filter((entry) => entry.call === call).map(({ platform }) => platform);
}

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  sentRequests.length = 0;
  builderCalls.length = 0;
  binaryPuts.length = 0;
  fingerprintsOnTheMachine.length = 0;
});

describe('sherlo test builds what the gate refused, then pushes', () => {
  it('builds every platform the staged gate refused, then pushes the builds on the standard road', async () => {
    const { refusals, unusedCalls, exitCode } = await runPose(testPose('build-both-then-push'));

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(exitCode).toBe(0);
    expect(platformsCalled('compile')).toEqual(['android', 'ios']);
    expect(binaryPuts).toHaveLength(2);
    expect(operationsSent()).toEqual([
      'checkStagedGate',
      'checkStagedGate',
      'getNextBuildInfo',
      'getStagedUploadUrls',
      'openBuild',
    ]);
    expect(requestOf('openBuild')?.binaryHashes).toEqual({
      android: expect.any(String),
      ios: expect.any(String),
    });
  });

  // A build writes into the project (pods, prebuilt frameworks inside node_modules), so a
  // fingerprint taken after it reads other files than the gate was asked about. The pose's
  // machine answers every fingerprint it is asked for with a hash other than the one the project's
  // files give before the build: the stored base must be the one taken before.
  it('the build road stores the fingerprint taken before the build', async () => {
    const pose = testPose('build-android-then-push');
    const takenAfterTheBuild = (pose.push as { fingerprint: { hash: string } }).fingerprint.hash;

    const { refusals, unusedCalls } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    const takenBeforeTheBuild = requestOf('checkStagedGate')!.baseFingerprint;
    expect(takenBeforeTheBuild).not.toBe(takenAfterTheBuild);
    expect(fingerprintsOnTheMachine).toEqual([]);
    expect(requestOf('openBuild')!.baseFingerprints).toEqual({ android: takenBeforeTheBuild });
  });

  it('a mixed run builds only the refused platform and stages the other onto its stored app build, in one test', async () => {
    const { refusals, unusedCalls, exitCode } = await runPose(
      testPose('build-mixed-android-built-ios-stored')
    );

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(exitCode).toBe(0);
    expect(platformsCalled('compile')).toEqual(['android']);
    expect(binaryPuts).toHaveLength(1);
    // One test: one openBuild carrying both platforms, the stored one named by the placeholder its
    // stored app build stands behind, with its fresh bundle on it.
    expect(operationsSent().filter((operation) => operation === 'openBuild')).toHaveLength(1);
    const { buildRunConfig, binaryHashes } = requestOf('openBuild')!;
    expect(binaryHashes.ios).toBeUndefined();
    expect(buildRunConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
    expect(buildRunConfig.android.s3Key).not.toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
    expect(requestOf('getStagedUploadUrls')?.platforms).toEqual(['android', 'ios']);
  });

  it('names why a platform needed a new app build only when native code changed', async () => {
    const nativeChanged = testPose('build-android-then-push');
    nativeChanged.api[0].answer = { outcome: 'full-build-needed', diff: [], storedBuildIndex: 12 };
    const nothingStored = testPose('build-android-then-push');
    nothingStored.api[0].answer = { outcome: 'full-build-needed', diff: [] };

    const changedScreen = stripAnsi((await runPose(nativeChanged)).screen);
    const firstScreen = stripAnsi((await runPose(nothingStored)).screen);

    expect(changedScreen).toContain(
      '🤖 Android  ✔ Built in <DURATION>, native code changed since Test 12'
    );
    expect(firstScreen).toContain(
      '🤖 Android  ✔ Built in <DURATION> (log: .sherlo/build-android.log)'
    );
    expect(firstScreen).not.toContain('native code changed');
    expect(firstScreen).not.toContain('stored');
  });

  it('a platform that needs no build reuses its stored app build and its row says which test it came from', async () => {
    const { screen } = await runPose(testPose('build-mixed-android-built-ios-stored'));

    expect(stripAnsi(screen)).toContain('🍎 iOS      ✔ Reused from Test 3');
    expect(platformsCalled('compile')).not.toContain('ios');
  });

  it('in EAS mode, a refused platform is built on EAS and nothing is compiled on this machine', async () => {
    const { refusals, exitCode } = await runPose(testPose('build-on-eas'));

    expect(refusals).toEqual([]);
    expect(exitCode).toBe(0);
    expect(platformsCalled('startEasBuild')).toEqual(['android', 'ios']);
    expect(platformsCalled('compile')).toEqual([]);
    expect(binaryPuts).toEqual([]);
  });

  it('in EAS mode, a JavaScript-only change starts no EAS build and takes the staged road', async () => {
    const pose = gateForAnyFingerprint(testPose('staged-borrows-the-base'));
    const config = pose.files['sherlo.config.json'] as Record<string, unknown>;
    pose.files['sherlo.config.json'] = { ...config, build: { tool: 'eas' } };

    const { refusals, unusedCalls, exitCode } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(exitCode).toBe(0);
    expect(builderCalls).toEqual([]);
    expect(operationsSent()).toEqual([
      'checkStagedGate',
      'checkStagedGate',
      'getStagedUploadUrls',
      'openBuild',
      'getBuildStatus',
    ]);
  });

  it("warns once when the eas.json profile keeps variables on Expo's servers, and builds anyway", async () => {
    const pose = gateForAnyFingerprint(testPose('build-android-then-push'));
    pose.files['eas.json'] = { build: { sherlo: { environment: 'preview' } } };

    const { screen, refusals, unusedCalls } = await runPose(pose);

    const warning = `! eas.json profile "sherlo" uses variables stored on Expo's servers (environment: preview).`;
    expect(stripAnsi(screen).split(warning)).toHaveLength(2);
    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(platformsCalled('compile')).toEqual(['android']);
    expect(stripAnsi(screen)).toContain('Test 13     ✔ Started');
  });

  it('refuses a bundle that holds no stories, naming build.env, before anything is uploaded', async () => {
    const pose = testPose('build-android-then-push');
    const bundle = (pose.bundles as Record<string, Record<string, unknown>>).android;
    bundle.storyClosureKeys = [];
    delete bundle.storyTitles;

    const { screen, refusals, exitCode } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(exitCode).toBe(1);
    expect(stripAnsi(screen)).toContain(
      "ERROR: The app's bundle has no stories, so there's nothing to test"
    );
    expect(screen).toContain('"build": { "env"');
    expect(binaryPuts).toEqual([]);
    expect(operationsSent()).not.toContain('getStagedUploadUrls');
    expect(operationsSent()).not.toContain('openBuild');
  });

  it('a push that builds its app hands --bundle-dir to the standard road', async () => {
    const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sherlo-bundle-dir-'));
    tempDirs.push(bundleDir);
    const pose = gateForAnyFingerprint(testPose('build-android-then-push'));
    pose.argv = [...pose.argv, '--bundle-dir', bundleDir];

    // The directory is empty, so the standard road refuses it - after the app was built, and in
    // place of bundling: it was handed the directory. What it checks in one is suppliedBundle's.
    const { screen, exitCode } = await runPose(pose, { terminal: false });

    const log = stripAnsi(screen);
    const built = log.indexOf('🤖 Android  ✔ Built in');
    const refusedTheDirectory = log.indexOf(
      'The supplied bundle directory has no complete android bundle.'
    );
    expect(exitCode).toBe(1);
    expect(built).toBeGreaterThan(-1);
    expect(refusedTheDirectory).toBeGreaterThan(built);
    expect(log).toContain(bundleDir);
    expect(platformsCalled('compile')).toEqual(['android']);
    expect(binaryPuts).toEqual([]);
  });

  it('a --platform job joins the run its CI run shares instead of opening one, whether it built or not', async () => {
    // Built: the job's platform needed a new app build.
    const built = await runPose(testPose('build-split-first-job'));

    expect(built.refusals).toEqual([]);
    expect(built.unusedCalls).toEqual([]);
    expect(platformsCalled('compile')).toEqual(['android']);
    expect(operationsSent()).toContain('joinBuild');
    expect(operationsSent()).not.toContain('openBuild');
    // The job's request names the whole test's devices: the other job's platform is waited for.
    const builtConfig = requestOf('joinBuild')!.buildRunConfig;
    expect(builtConfig.ios.devices).toHaveLength(1);
    expect(builtConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);

    // Not built: only JavaScript changed, and the job takes the staged road.
    sentRequests.length = 0;
    builderCalls.length = 0;
    const staged = gateForAnyFingerprint(testPose('staged-borrows-the-base'));
    staged.argv = ['test', '--platform', 'android', '--run-id', '7243105518'];
    const config = staged.files['sherlo.config.json'] as { devices: unknown[] };
    staged.files['sherlo.config.json'] = {
      ...config,
      devices: [...config.devices, { id: 'iphone.15', osVersion: '17' }],
    };
    staged.api = [
      ...staged.api.filter(({ call }) => call !== 'openBuild' && call !== 'getBuildStatus'),
      {
        call: 'joinBuild',
        with: { joinKey: 'run:7243105518', platform: 'android' },
        answer: { buildIndex: 2, waitingFor: ['ios'] },
      },
    ] as typeof staged.api;

    const notBuilt = await runPose(staged);

    expect(notBuilt.refusals).toEqual([]);
    expect(notBuilt.unusedCalls).toEqual([]);
    expect(builderCalls).toEqual([]);
    expect(operationsSent()).toContain('joinBuild');
    expect(operationsSent()).not.toContain('openBuild');
    const stagedConfig = requestOf('joinBuild')!.buildRunConfig;
    expect(stagedConfig.ios.devices).toHaveLength(1);
    expect(stagedConfig.ios.s3Key).toBe(ASYNC_UPLOAD_S3_KEY_PLACEHOLDER);
  });

  it('a --platform job with no CI run id warns and runs as a test of its own', async () => {
    const pose = testPose('build-split-first-job');
    pose.argv = ['test', '--platform', 'android'];
    const openBuild = testPose('build-android-then-push').api.find(
      ({ call }) => call === 'openBuild'
    )!;
    pose.api = [
      ...pose.api.filter(({ call }) => call !== 'joinBuild'),
      openBuild,
    ] as typeof pose.api;

    const { screen, refusals, unusedCalls, exitCode } = await runPose(pose);

    expect(refusals).toEqual([]);
    expect(unusedCalls).toEqual([]);
    expect(exitCode).toBe(0);
    expect(stripAnsi(screen)).toContain(
      'No CI run ID was found, so this job runs as a test of its own.'
    );
    expect(operationsSent()).toContain('openBuild');
    expect(operationsSent()).not.toContain('joinBuild');
  });
});
