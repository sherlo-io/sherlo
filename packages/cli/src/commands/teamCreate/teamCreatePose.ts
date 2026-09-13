/**
 * THE POSE `sherlo team create` RENDERS FROM - the sibling of
 * ../projectCreate/projectCreatePose, for the command that makes a team.
 *
 * PLAN-LAYER FIRST (2026-09-07). This family exists before the command does: the
 * transcript is the page the operator signs, and it is rendered from a declared
 * state through the shipped segment (../../render/teamCreated), so the bytes the
 * plan shows are the bytes the command will print once it is built. The API
 * call, the verb registration and its options are build work.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, emit, type CapturedTranscript } from '../../helpers/transcriptSink';
import type { TeamCreated } from '../../render/teamCreated';

/** The whole of what one `sherlo team create` run needed in order to print. */
export type TeamCreateTranscriptPose = {
  family: 'team-create';
  ambient: { skipIntro: boolean };
  team: TeamCreated;
};

/** Read one team-create pose out of a parsed JSON document, or throw naming every field that made it un-renderable. */
export function decodeTeamCreatePose(document: unknown): TeamCreateTranscriptPose {
  const refusals: string[] = [];
  const doc = (document ?? {}) as Record<string, unknown>;

  if (doc.family !== 'team-create') {
    refusals.push(`family: expected 'team-create', got ${JSON.stringify(doc.family)}`);
  }

  const team = (doc.team ?? {}) as Record<string, unknown>;
  if (typeof team.name !== 'string' || team.name.length === 0) {
    refusals.push('team.name: expected a non-empty string');
  }
  if (typeof team.id !== 'string' || team.id.length === 0) {
    refusals.push('team.id: expected a non-empty string');
  }

  const ambient = (doc.ambient ?? {}) as Record<string, unknown>;
  if (typeof ambient.skipIntro !== 'boolean') {
    refusals.push('ambient.skipIntro: expected a boolean');
  }

  if (refusals.length > 0) {
    throw new Error(
      `REFUSING TO RENDER (un-renderable team-create pose):\n  ${refusals.join('\n  ')}`
    );
  }

  return {
    family: 'team-create',
    ambient: { skipIntro: ambient.skipIntro as boolean },
    team: { name: team.name as string, id: team.id as string },
  };
}

/**
 * The PRODUCER for a posed `sherlo team create` transcript - the same shape
 * ../projectCreate/renderProjectCreateTranscript has, rendering through the shipped
 * `team-created` segment so the plan's bytes cannot drift from the product's once the
 * command exists. It lives beside the decoder rather than in its own file because the
 * pose files and command files are maintained under different rules in this repo.
 */
export async function renderTeamCreatePoseTranscript(
  pose: TeamCreateTranscriptPose
): Promise<CapturedTranscript> {
  const previous = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = pose.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();
      emit({ kind: 'team-created', team: pose.team });
    });
  } finally {
    if (previous === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previous;
  }
}

/** A successful create prints to stdout and exits 0. */
export function teamCreatePoseOutcome(): { exitCode: number; capture: 'stdout' } {
  return { exitCode: 0, capture: 'stdout' };
}
