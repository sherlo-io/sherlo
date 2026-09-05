/**
 * THE VERDICT FAMILY'S EXPECTATION PRODUCER (F4) - the fourth family on the
 * render road, and the first one with anything to say about a build that has
 * already finished.
 *
 * MINT CAPTURES FROM A WORLD; RENDER COMPUTES FROM A SCENARIO. This takes a
 * scenario's scripted POLL ANSWER, runs a verdict decider over it, and returns
 * what that decider printed.
 *
 * WHAT IT SUBSTITUTES, AND WHAT IT DOES NOT. A `--wait` run performs exactly one
 * effect - it asks the backend, repeatedly, what state the build is in - and
 * this supplies that one and nothing else. {@link waitForBuildResult} is the
 * shipped function `stagedRun` itself calls: its deadline check, its status
 * dedupe, its terminal switch, its gate read and every literal it reaches are
 * the live ones. That is why these transcripts are evidence about the CLI and
 * not about this file.
 *
 * ------------------------------------------------------------------------
 * ONE RENDERER, FOR EVERY SCENARIO IN THE FAMILY - INCLUDING THE SPARSE ONES.
 *
 * This file used to have two. The three sparse-verdict transcripts were drawn by
 * calling `decideSparseBuildVerdict` directly and re-emitting the loop's frame
 * around it by hand, because at the time nothing in the product called that
 * function: they were a proposal, rendered so the redesign could be reviewed
 * before it was built.
 *
 * The redesign has now been built, so that second path is gone. All six
 * scenarios run the SAME shipped loop over their scripted poll answer, and the
 * only thing that differs between a sparse transcript and a present one is what
 * that answer says - specifically whether the server set
 * `showsOnlyBranchChanges` on the build. That is the strongest form this proof
 * can take: the bytes reviewed as a drawing and the bytes a user gets are now
 * produced by one function, and if the wiring were removed these transcripts
 * would change, loudly, instead of continuing to render from a function nothing
 * calls.
 *
 * WHAT THEY STILL DO NOT CLAIM. These are gated bytes. A project that has not
 * opted in never reaches them, and the scenarios say so: `groundedBy.kind` is
 * `gated-shipped` and names the wire field, and `--render-transcript list`
 * prints that grounding beside the id.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import waitForBuildResult from '../../helpers/waitForBuildResult';
import type { VerdictTranscriptScenario } from './verdict.transcripts';

/**
 * A token of the real fixed-width layout `getTokenParts` slices. Nothing in this
 * family renders it - the verdict closers carry no URL - but the shipped loop
 * parses it before polling, so a scenario that handed over a malformed one would
 * exercise a refusal instead of a verdict.
 */
const SCRIPTED_TOKEN = `${'s'.repeat(PROJECT_API_TOKEN_LENGTH)}scenteam1`;

/** One full render of a verdict scenario. */
export async function renderVerdictScenarioTranscript(
  scenario: VerdictTranscriptScenario
): Promise<CapturedTranscript> {
  // The ambient the scenario DECLARES, applied to the read the shipped code
  // makes, and restored afterwards so one scenario's ambient never reaches the
  // next - the rule the dry-run family's header states and every family keeps.
  const previousSkipIntro = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = scenario.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();

      await waitForBuildResult({
        token: SCRIPTED_TOKEN,
        buildIndex: 1,
        projectIndex: 1,
        teamId: 'scenteam',
        waitTimeoutMinutes: scenario.waitTimeoutMinutes,
        // `--metadata`, exactly as a road passes it: absent when the flag was
        // not given, `{}` from a road that has no git to report, and the git
        // facts themselves from a road that opened the build.
        metadata: scenario.metadata,
        // A scripted build is already terminal, so the loop's FIRST poll
        // returns it and no sleep, heartbeat or retry is reached. Those
        // branches are real and unrendered here; a scenario that wanted them
        // would script a sequence, which this family does not carry yet.
        pollBuildStatus: async () => scenario.build,
        // Fixed, because the loop measures its deadline against this and a
        // real clock would make the render irreproducible - which the
        // producer's two-pass check would catch, loudly, rather than quietly
        // shipping a coin toss.
        now: () => 0,
      });
    });
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}
