/**
 * A PUSH ON A PERSON'S CREDENTIAL (sherlo / The credential and the project of a push, "Which
 * project does a push go to?").
 *
 * The catalogued staged push (`poses/test/staged-borrows-the-base`) is run again with its project
 * token taken away: the config names the project instead, and the person's token is in
 * SHERLO_PERSONAL_TOKEN. The posed server answers every call as before, and records what each was
 * sent with - which is the whole question here, because a pose's `with` never states the team, the
 * project or the token.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { ScriptedCall, ServerCalls } from '../../../seams/serverCalls';

/** Every request the posed server was sent, in order: which operation, and its arguments. */
const { sentRequests } = vi.hoisted(() => ({
  sentRequests: [] as Array<{ operation: string; request: Record<string, unknown> }>,
}));

vi.mock('../../../seams/serverCalls', async (importActual) => {
  const actual = await importActual<typeof import('../../../seams/serverCalls')>();

  return {
    ...actual,
    // The pose's own server, unchanged, with every operation recording what it was sent first.
    posedServerCalls: (script: ScriptedCall[]) => {
      const posedServer = actual.posedServerCalls(script);
      const recordingServer = { ...posedServer };

      for (const operation of Object.keys(actual.liveServerCalls) as Array<keyof ServerCalls>) {
        const answer = posedServer[operation] as (request: Record<string, unknown>) => unknown;
        (recordingServer as Record<string, unknown>)[operation] = (
          request: Record<string, unknown>
        ) => {
          sentRequests.push({ operation, request });
          return answer(request);
        };
      }

      return recordingServer;
    },
  };
});

import { POSES_ROOT } from '../../pose/catalogue';
import { runPose } from '../../pose/pose';
import { readPoseDocument } from '../../pose/readPose';

const PERSONAL_TOKEN = 'sht_posepersonaltoken000000000000';

describe("a push on a person's credential", () => {
  it("sends a push on a person's credential to the team and project the config's project names", async () => {
    const posePath = path.join(POSES_ROOT, 'test', 'staged-borrows-the-base.pose.json');
    const document = readPoseDocument(fs.readFileSync(posePath, 'utf8'));

    const config = { ...(document.files['sherlo.config.json'] as Record<string, unknown>) };
    delete config.token;
    config.project = 'k3j9x2ab/4';
    document.files['sherlo.config.json'] = config;
    document.env = { ...document.env, SHERLO_PERSONAL_TOKEN: PERSONAL_TOKEN };

    const { refusals, exitCode } = await runPose(document);

    expect(refusals).toEqual([]);
    expect(exitCode).toBe(0);

    // The gate twice, the upload slots, the build, and the wait's read - every one of them sent
    // to the config's team and project, on the person's token as it was given.
    expect(sentRequests.map(({ operation }) => operation)).toEqual([
      'checkStagedGate',
      'checkStagedGate',
      'getStagedUploadUrls',
      'openBuild',
      'getBuildStatus',
    ]);
    for (const { operation, request } of sentRequests) {
      expect(request, operation).toMatchObject({
        token: PERSONAL_TOKEN,
        teamId: 'k3j9x2ab',
        projectIndex: 4,
      });
    }
  });
});
