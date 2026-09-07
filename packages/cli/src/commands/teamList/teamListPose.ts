/**
 * THE POSE `sherlo team list` RENDERS FROM - the sibling of
 * ../projectList/projectListPose, for the command that lists the caller's teams.
 *
 * PLAN-LAYER FIRST (2026-09-07). This family exists before the command does: the
 * transcript is the page the operator signs, rendered from a declared state through
 * the shipped segment (../../render/teamList). The API query and the verb are build work.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, emit, type CapturedTranscript } from '../../helpers/transcriptSink';
import type { TeamList, TeamListed } from '../../render/teamList';

/** The whole of what one `sherlo team list` run needed in order to print. */
export type TeamListTranscriptPose = {
  family: 'team-list';
  ambient: { skipIntro: boolean };
  list: TeamList;
};

/** Read one team-list pose out of a parsed JSON document, or throw naming every field that made it un-renderable. */
export function decodeTeamListPose(document: unknown): TeamListTranscriptPose {
  const refusals: string[] = [];
  const doc = (document ?? {}) as Record<string, unknown>;

  if (doc.family !== 'team-list') refusals.push(`family: expected 'team-list', got ${JSON.stringify(doc.family)}`);

  const teams: TeamListed[] = [];
  if (!Array.isArray(doc.teams)) {
    refusals.push('teams: expected an array (empty when the caller belongs to no team)');
  } else {
    doc.teams.forEach((entry, at) => {
      const team = (entry ?? {}) as Record<string, unknown>;
      if (typeof team.id !== 'string' || team.id.length === 0) refusals.push(`teams[${at}].id: expected a non-empty string`);
      if (typeof team.name !== 'string' || team.name.length === 0) refusals.push(`teams[${at}].name: expected a non-empty string`);
      if (!Number.isInteger(team.projectCount) || (team.projectCount as number) < 0) refusals.push(`teams[${at}].projectCount: expected a non-negative integer`);
      if (team.role !== undefined && team.role !== null && typeof team.role !== 'string') refusals.push(`teams[${at}].role: expected a string or null`);
      teams.push({ id: team.id as string, name: team.name as string, projectCount: team.projectCount as number, role: (team.role as string | null | undefined) ?? null });
    });
  }

  const ambient = (doc.ambient ?? {}) as Record<string, unknown>;
  if (typeof ambient.skipIntro !== 'boolean') refusals.push('ambient.skipIntro: expected a boolean');

  if (refusals.length > 0) throw new Error(`REFUSING TO RENDER (un-renderable team-list pose):\n  ${refusals.join('\n  ')}`);

  return { family: 'team-list', ambient: { skipIntro: ambient.skipIntro as boolean }, list: { teams } };
}

/** The PRODUCER for a posed `sherlo team list` transcript, through the shipped `team-list` segment. */
export async function renderTeamListPoseTranscript(pose: TeamListTranscriptPose): Promise<CapturedTranscript> {
  const previous = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = pose.ambient.skipIntro ? 'true' : 'false';
  try {
    return await captureTranscript(async () => {
      printSherloIntro();
      emit({ kind: 'team-list', list: pose.list });
    });
  } finally {
    if (previous === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previous;
  }
}

/** A list prints to stdout and exits 0 - no teams is an answer, not a failure. */
export function teamListPoseOutcome(): { exitCode: number; capture: 'stdout' } {
  return { exitCode: 0, capture: 'stdout' };
}
