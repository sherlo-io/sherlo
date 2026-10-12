/**
 * THE PULL REQUEST NEXT STEP (operator, 2026-10-12, with epic init-for-agents): setup no longer asks
 * for CI, so a test a PERSON started, on a project with no CI token, ends on a second next step -
 * run Sherlo on every pull request, with the project's page linked. A log never shows it, and a
 * project whose CI token is unknown gets nothing extra.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { POSES_ROOT } from '../catalogue';
import { runPose } from '../pose';
import { readPoseDocument } from '../readPose';
import type { CommandPose } from '../../../seams/commandPose';

const THE_SECOND_STEP = 'Run Sherlo on every pull request';
const THE_PROJECT_PAGE = 'https://app.sherlo.io/project?t=tm000001&p=7';

function poseNamed(name: string): CommandPose {
  return readPoseDocument(
    fs.readFileSync(path.join(POSES_ROOT, 'test', `${name}.pose.json`), 'utf8')
  );
}

describe('a test a person started, on a project with no CI token', () => {
  it('ends on two next steps in a terminal: review the test, and run Sherlo on every pull request', async () => {
    const { screen } = await runPose(poseNamed('staged-suggests-pull-requests'), {
      terminal: true,
    });

    expect(screen).toContain('Next steps');
    expect(screen).toContain(THE_SECOND_STEP);
    expect(screen).toContain(THE_PROJECT_PAGE);
  });

  it('prints nothing extra in a log', async () => {
    const { screen } = await runPose(poseNamed('staged-suggests-pull-requests'), {
      terminal: false,
    });

    expect(screen).toContain('Next step');
    expect(screen).not.toContain(THE_SECOND_STEP);
    expect(screen).not.toContain(THE_PROJECT_PAGE);
  });

  it('prints nothing extra when the server does not say whether the project has a CI token', async () => {
    const { screen } = await runPose(poseNamed('staged-reuses-no-wait'), { terminal: true });

    expect(screen).not.toContain(THE_SECOND_STEP);
  });
});
