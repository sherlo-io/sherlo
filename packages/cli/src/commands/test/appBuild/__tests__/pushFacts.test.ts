/**
 * WHAT THE PUSH REPORTS ABOUT ITSELF (sherlo / After a push / The record), and what it reads back.
 *
 * Each case runs a catalogued `sherlo test` pose, or one changed for the case, end to end: the posed
 * server answers every call and records what it was sent, which is the question here.
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScriptedCall, ServerCalls } from '../../../../seams/serverCalls';

/** What the posed server was asked, in order. */
const { sentRequests } = vi.hoisted(() => ({
  sentRequests: [] as Array<{ operation: string; request: Record<string, any> }>,
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

import { pushFactsPlatformOf } from '../pushFacts';
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

function requestOf(operation: string): Record<string, any> {
  return sentRequests.find((sent) => sent.operation === operation)!.request;
}

beforeEach(() => {
  sentRequests.length = 0;
});

describe('what a push tells the service about itself', () => {
  it("a push reports how each platform's app build was made", async () => {
    // Android needed a build because native code changed since Test 12; the CI service names its run.
    const compiled = testPose('build-android-then-push');
    compiled.api[0].answer = { outcome: 'full-build-needed', diff: [], storedBuildIndex: 12 };
    compiled.env = {
      ...compiled.env,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_RUN_ID: '123',
    };

    await runPose(compiled);

    expect(requestOf('openBuild').pushFacts).toEqual({
      platforms: {
        android: {
          madeBy: 'compiled',
          why: 'native-changed',
          storiesInBundle: 5,
        },
      },
      ciRun: { provider: 'github', runId: 'acme/app/123' },
    });

    // What changed natively since the stored app build goes as lines of words.
    expect(
      pushFactsPlatformOf({
        appBuild: {
          madeBy: 'compiled',
          why: {
            reason: 'native-changed',
            changesSince: {
              storedBuildIndex: 12,
              changes: [
                { change: 'changed', file: 'android/app/build.gradle' },
                { change: 'changed', module: 'react-native-svg', from: '14.0.0', to: '15.0.0' },
                { change: 'added', module: 'react-native-maps', version: '1.8.0' },
              ],
            },
          },
        },
      }).nativeChanges
    ).toEqual([
      'android/app/build.gradle',
      'react-native-svg 14.0.0 → 15.0.0',
      'react-native-maps 1.8.0',
    ]);

    // An app build found in the local build cache, with nothing stored for the platform yet.
    sentRequests.length = 0;
    await runPose(testPose('build-android-from-cache'));

    expect(requestOf('openBuild').pushFacts.platforms.android).toMatchObject({
      madeBy: 'build-cache',
      why: 'nothing-stored',
    });
    expect(requestOf('openBuild').pushFacts.ciRun).toBeUndefined();
  });

  it("the job that brings the last platform in prints the started row from the service's own answer", async () => {
    const { screen } = await runPose(testPose('build-split-second-job'));

    // The job reports its own platform's facts and the run it joins by its key.
    expect(requestOf('joinBuild').pushFacts).toMatchObject({ madeBy: 'compiled' });
    // Its row is the whole test's: both devices and the counts are the service's, not this job's.
    expect(stripAnsi(screen)).toContain('Started: all 5 stories on 2 devices (Pixel 7, iPhone 15)');
  });
});
