/**
 * THE POSE `sherlo project create` RENDERS FROM - the same road `view` has, for
 * the command that makes a project.
 *
 * WHY IT EXISTS (operator ruling 2026-09-06). Every `sherlo-cli` beat in the
 * tester's planned report must show the bytes the command prints, and it must get
 * them from the SHIPPED CLI rather than composing them itself - a second renderer
 * drifts from the product the day someone edits the real one. Before this file
 * the `project-create` beats had no road to a pane at all: `--render-transcript-state`
 * decoded every document as a `view` pose, so a project-create beat could only
 * quote a claim it never proved. Ten chapters shipped that way and the operator
 * read the empty panes as a regression, which is exactly what they were.
 *
 * WHAT A POSE HOLDS is the whole of what the command needed in order to print what
 * it printed: the three named facts the renderer takes, and nothing else. The
 * personal token is deliberately ABSENT - it is the caller's own credential, it is
 * never printed, and a pose that carried it would put a live secret in a file the
 * tester commits.
 */
import type { ProjectCreated } from '../../render/projectCreated';

/** The whole of what one `sherlo project create` run needed in order to print. */
export type ProjectCreateTranscriptPose = {
  family: 'project-create';
  ambient: { skipIntro: boolean };
  /** The three facts the renderer prints, and the only three it can. */
  project: ProjectCreated;
};

/**
 * Read one project-create pose out of a parsed JSON document, or throw naming
 * every field that made it un-renderable.
 *
 * Hand-checked rather than schema-driven, because the shape is three scalars and
 * a family tag: the refusal a caller needs is "which field", and a list of them
 * in one throw is what lets a prototyping loop fix them all in one pass.
 */
export function decodeProjectCreatePose(document: unknown): ProjectCreateTranscriptPose {
  const refusals: string[] = [];
  const doc = (document ?? {}) as Record<string, unknown>;

  if (doc.family !== 'project-create') {
    refusals.push(`family: expected 'project-create', got ${JSON.stringify(doc.family)}`);
  }

  const project = (doc.project ?? {}) as Record<string, unknown>;
  if (typeof project.name !== 'string' || project.name.length === 0) {
    refusals.push('project.name: expected a non-empty string');
  }
  if (typeof project.index !== 'number' || !Number.isInteger(project.index)) {
    refusals.push('project.index: expected an integer');
  }
  if (typeof project.projectToken !== 'string' || project.projectToken.length === 0) {
    refusals.push(
      'project.projectToken: expected a non-empty string (mask it in the pose - the bytes are what is rendered, and a real token in a committed pose is a leaked token)'
    );
  }

  const ambient = (doc.ambient ?? {}) as Record<string, unknown>;
  if (typeof ambient.skipIntro !== 'boolean') {
    refusals.push('ambient.skipIntro: expected a boolean');
  }

  if (refusals.length > 0) {
    throw new Error(
      `REFUSING TO RENDER (un-renderable project-create pose):\n  ${refusals.join('\n  ')}`
    );
  }

  return {
    family: 'project-create',
    ambient: { skipIntro: ambient.skipIntro as boolean },
    project: {
      name: project.name as string,
      index: project.index as number,
      projectToken: project.projectToken as string,
    },
  };
}
