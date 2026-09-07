/**
 * THE POSE `sherlo project list` RENDERS FROM - the read-side sibling of
 * ../teamCreate/teamCreatePose, for the command that lists a team's projects.
 *
 * PLAN-LAYER FIRST (2026-09-07). This family exists before the command does: the
 * transcript is the page the operator signs, and it is rendered from a declared
 * state through the shipped segment (../../render/projectList), so the bytes the
 * plan shows are the bytes the command will print once it is built. The API
 * query, the verb registration and its options are build work.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, emit, type CapturedTranscript } from '../../helpers/transcriptSink';
import type { ProjectList, ProjectListed } from '../../render/projectList';

/** The whole of what one `sherlo project list` run needed in order to print. */
export type ProjectListTranscriptPose = {
  family: 'project-list';
  ambient: { skipIntro: boolean };
  list: ProjectList;
};

/** Read one project-list pose out of a parsed JSON document, or throw naming every field that made it un-renderable. */
export function decodeProjectListPose(document: unknown): ProjectListTranscriptPose {
  const refusals: string[] = [];
  const doc = (document ?? {}) as Record<string, unknown>;

  if (doc.family !== 'project-list') {
    refusals.push(`family: expected 'project-list', got ${JSON.stringify(doc.family)}`);
  }

  const team = (doc.team ?? {}) as Record<string, unknown>;
  if (typeof team.name !== 'string' || team.name.length === 0) refusals.push('team.name: expected a non-empty string');
  if (typeof team.id !== 'string' || team.id.length === 0) refusals.push('team.id: expected a non-empty string');

  const projects: ProjectListed[] = [];
  if (!Array.isArray(doc.projects)) {
    refusals.push('projects: expected an array (empty for a team with no projects)');
  } else {
    doc.projects.forEach((entry, at) => {
      const project = (entry ?? {}) as Record<string, unknown>;
      if (!Number.isInteger(project.index) || (project.index as number) < 1) refusals.push(`projects[${at}].index: expected a positive integer`);
      if (typeof project.name !== 'string' || project.name.length === 0) refusals.push(`projects[${at}].name: expected a non-empty string`);
      if (!Number.isInteger(project.buildCount) || (project.buildCount as number) < 0) refusals.push(`projects[${at}].buildCount: expected a non-negative integer`);
      if (project.mainBranch !== null && typeof project.mainBranch !== 'string') refusals.push(`projects[${at}].mainBranch: expected a string or null`);
      projects.push({
        index: project.index as number,
        name: project.name as string,
        buildCount: project.buildCount as number,
        mainBranch: (project.mainBranch as string | null) ?? null,
      });
    });
  }

  const ambient = (doc.ambient ?? {}) as Record<string, unknown>;
  if (typeof ambient.skipIntro !== 'boolean') refusals.push('ambient.skipIntro: expected a boolean');

  if (refusals.length > 0) {
    throw new Error(`REFUSING TO RENDER (un-renderable project-list pose):\n  ${refusals.join('\n  ')}`);
  }

  return {
    family: 'project-list',
    ambient: { skipIntro: ambient.skipIntro as boolean },
    list: { team: { name: team.name as string, id: team.id as string }, projects },
  };
}

/** The PRODUCER for a posed `sherlo project list` transcript, through the shipped `project-list` segment. */
export async function renderProjectListPoseTranscript(pose: ProjectListTranscriptPose): Promise<CapturedTranscript> {
  const previous = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = pose.ambient.skipIntro ? 'true' : 'false';
  try {
    return await captureTranscript(async () => {
      printSherloIntro();
      emit({ kind: 'project-list', list: pose.list });
    });
  } finally {
    if (previous === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previous;
  }
}

/** A list prints to stdout and exits 0 - an empty team is an answer, not a failure. */
export function projectListPoseOutcome(): { exitCode: number; capture: 'stdout' } {
  return { exitCode: 0, capture: 'stdout' };
}
