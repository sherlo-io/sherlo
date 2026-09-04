/**
 * THE VIEW FAMILY'S EXPECTATION PRODUCER (F5).
 *
 * MINT CAPTURES FROM A WORLD; RENDER COMPUTES FROM A SCENARIO. This takes a
 * scenario's scripted BUILD READ and returns the bytes the shipped print path
 * turned it into.
 *
 * WHAT IT SUBSTITUTES, AND WHAT IT DOES NOT. A `sherlo view` run performs
 * exactly one effect - it asks the backend for one build's status - and this
 * supplies that one and nothing else. {@link printBuildView} is the function the
 * command itself calls once the read has answered: its tally guard, its status
 * branch, its details branch and every literal it reaches are the live ones.
 * That is why these transcripts are evidence about the CLI and not about this
 * file.
 *
 * The build URL is scripted rather than computed for the same reason the token
 * is in the verdict family: it is a pure function of ids nothing here renders,
 * so a scenario supplies it and no scenario needs a real token to be renderable.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import { printBuildView } from './printBuildView';
import { SCENARIO_BUILD_URL, type ViewTranscriptScenario } from './view.transcripts';

/** One full render of a view scenario. */
export async function renderViewScenarioTranscript(
  scenario: ViewTranscriptScenario
): Promise<CapturedTranscript> {
  // The ambient the scenario DECLARES, applied to the read the shipped code
  // makes, and restored afterwards so one scenario's ambient never reaches the
  // next - the rule the dry-run family's header states and every family keeps.
  const previousSkipIntro = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = scenario.ambient.skipIntro ? 'true' : 'false';

  try {
    return await captureTranscript(async () => {
      printSherloIntro();

      printBuildView({
        build: scenario.build,
        buildIndex: scenario.buildIndex,
        url: SCENARIO_BUILD_URL,
        showDetails: scenario.showDetails,
      });
    });
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}
