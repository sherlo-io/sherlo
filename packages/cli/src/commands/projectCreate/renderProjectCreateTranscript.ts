/**
 * The PRODUCER for a posed `sherlo project create` transcript - the same shape
 * `renderViewPoseTranscript` has, so both pose roads publish through one gate.
 *
 * IT RENDERS THROUGH THE SHIPPED SEGMENT, not through a copy of it. The bytes come
 * from the `project-created` segment, which is the same one the real command emits
 * and whose exact output is pinned by `render/__tests__/renderLayerLiterals.test.ts`.
 * That is the whole point: a transcript rendered here cannot drift from the product
 * without the pin going red in the same commit.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, emit, type CapturedTranscript } from '../../helpers/transcriptSink';
import type { ProjectCreateTranscriptPose } from './projectCreatePose';

export async function renderProjectCreatePoseTranscript(
  pose: ProjectCreateTranscriptPose
): Promise<CapturedTranscript> {
  // Declared rather than inherited, exactly as the view producer does it, so
  // `printSherloIntro` takes its own real branch instead of being bypassed - and
  // restored afterwards, because the byte-identity gate renders twice in one
  // process and one render's ambient must not reach the next.
  const previous = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = pose.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();
      emit({ kind: 'project-created', project: pose.project });
    });
  } finally {
    if (previous === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previous;
  }
}

/**
 * How the run a pose depicts ENDED, and which streams its transcript is made of.
 * A successful create prints to stdout and exits 0; there is no posable failure
 * shape yet, because a refusal is the API's answer rather than a state a caller
 * can declare.
 */
export function projectCreatePoseOutcome(): { exitCode: number; capture: 'stdout' } {
  return { exitCode: 0, capture: 'stdout' };
}
