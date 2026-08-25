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
 * this supplies that one and nothing else. For a `shipped-wait-loop` scenario
 * {@link waitForBuildResult} is the shipped function `stagedRun` itself calls:
 * its deadline check, its status dedupe, its terminal switch and every literal
 * it reaches are the live ones. That is why those transcripts are evidence about
 * the CLI and not about this file.
 *
 * ------------------------------------------------------------------------
 * ⚠⚠ AND WHAT IT DELIBERATELY DOES NOT PROVE.
 *
 * A `sparse-verdict-proposal` scenario is rendered by
 * {@link decideSparseBuildVerdict}, which NO shipped code path calls. Its
 * transcripts are a DRAWING of behaviour that does not exist - the redesign's
 * CLI half, rendered so it can be reviewed before it is built. Three things say
 * so at once, and any one of them is enough for a reader:
 *
 *   1. the scenario's `groundedBy.kind` is `depicts-future`, and it carries an
 *      `implies` sentence naming what would have to be built;
 *   2. `--render-transcript list` prints that grounding beside the id, so the
 *      distinction survives into the catalog a consumer reads;
 *   3. every literal such a scenario reaches carries a `DEPICTS FUTURE` banner
 *      in render/verdictCloser.ts.
 *
 * A transcript that merely LOOKED like the others would be a specification
 * wearing the costume of a description, which is the one failure this family
 * must not commit: these renders exist for a product design to be approved off,
 * and approving a drawing believing it is a photograph is exactly the mistake
 * that would cost most.
 */
import { PROJECT_API_TOKEN_LENGTH } from '@sherlo/shared';
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import { emit } from '../../helpers/transcriptSink';
import waitForBuildResult from '../../helpers/waitForBuildResult';
import { decideSparseBuildVerdict } from '../../helpers/sparseBuildVerdict';
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

      if (scenario.renderer === 'shipped-wait-loop') {
        await waitForBuildResult({
          token: SCRIPTED_TOKEN,
          buildIndex: 1,
          projectIndex: 1,
          teamId: 'scenteam',
          waitTimeoutMinutes: scenario.waitTimeoutMinutes,
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
        return;
      }

      renderSparseVerdict(scenario);
    });
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}

/* ========================================================================== */

/**
 * ⚠⚠ DEPICTS FUTURE. The shape `waitForBuildResult`'s finished branch WOULD have
 * if it routed through the sparse decider - the wait header, then the closer
 * inside its two framing blank lines.
 *
 * The frame is spelled out here rather than folded into the decider because it
 * is the LOOP's, not the verdict's: every closer in this family, present and
 * proposed, sits between the same two bare `console.log()` calls, and the
 * proposal changes what is said, not how it is framed.
 */
function renderSparseVerdict(scenario: VerdictTranscriptScenario): void {
  emit({ kind: 'wait-header', timeoutMinutes: scenario.waitTimeoutMinutes });
  emit({ kind: 'wait-progress', runStatus: scenario.build.runStatus });

  const verdict = decideSparseBuildVerdict(scenario.build);
  if (!verdict) {
    throw new Error(
      'REFUSING TO RENDER (not terminal): the scripted build is not finished, or finished with no ' +
        'viewStatusesCount. The sparse decider answers null for both - deliberately, so a build ' +
        'whose counts have not been written yet can never be rendered as a verdict.'
    );
  }

  emit({ kind: 'blank-line' });
  for (const segment of verdict.segments) emit(segment);
  emit({ kind: 'blank-line' });
}
