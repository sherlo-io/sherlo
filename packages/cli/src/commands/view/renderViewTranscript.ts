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
 * The build URL is composed by the shipped url helper over SCRIPTED team and
 * project ids, for the same reason the token is scripted in the verdict family:
 * it is a pure function of ids nothing here renders, so no scenario needs a real
 * token to be renderable - and the shape of the url stays the product's.
 *
 * ------------------------------------------------------------------------
 * TWO CALLERS, ONE RENDER. `--render-transcript <id>` arrives here with a catalog
 * scenario and `--render-transcript-state` with a caller-declared pose, and both
 * land on {@link renderViewScenarioTranscript} - a pose IS a scenario once its
 * catalog metadata is set aside (see ./viewPose). The only thing the pose road
 * adds is the state the catalog cannot hold: a read that answered `null`.
 */
import printSherloIntro from '../../helpers/printSherloIntro';
import { captureTranscript, type CapturedTranscript } from '../../helpers/transcriptSink';
import { buildNotFoundRefusal, printBuildView } from './printBuildView';
import { scenarioBuildUrl, type ViewTranscriptScenario } from './view.transcripts';
import { viewScenarioOfPose, type ViewTranscriptPose } from './viewPose';

/** One full render of a view scenario. */
export async function renderViewScenarioTranscript(
  scenario: ViewTranscriptScenario
): Promise<CapturedTranscript> {
  return withDeclaredAmbient(scenario.ambient, () =>
    captureTranscript(async () => {
      printSherloIntro();

      printBuildView({
        build: scenario.build,
        buildIndex: scenario.buildIndex,
        url: scenarioBuildUrl(scenario.buildIndex),
        showDetails: scenario.showDetails,
      });
    })
  );
}

/**
 * One full render of a declared pose, and the exit code the depicted run ended
 * under.
 *
 * A pose whose read answered `null` is depicting a build that does not exist,
 * which is not a transcript `printBuildView` can produce: the command refuses
 * before it prints anything about a build. So that pose renders what the command
 * itself renders on that path - the intro it had already printed, then the
 * command's OWN refusal text, from the CLI's own error formatter
 * ({@link buildNotFoundRefusal}), on stderr.
 *
 * ONE THING IS DELIBERATELY MISSING FROM IT, and a reader should not have to
 * discover that: the "Need Help?" epilogue with the community links. That block
 * belongs to the process wrapper in ../../start, which prints it under EVERY
 * command's failure - it is not something `view` says, so a producer for the view
 * family must not be the place it is reproduced.
 */
export async function renderViewPoseTranscript(
  pose: ViewTranscriptPose
): Promise<CapturedTranscript> {
  const scenario = viewScenarioOfPose(pose);

  if (scenario) {
    return renderViewScenarioTranscript(scenario);
  }

  const transcript = await withDeclaredAmbient(pose.ambient, () =>
    captureTranscript(async () => {
      printSherloIntro();
    })
  );

  return { ...transcript, stderr: transcript.stderr + buildNotFoundRefusal(pose.buildIndex) };
}

/**
 * How the run a pose depicts ENDED, and which streams its transcript is made of.
 *
 * Both answers turn on the same single fact - whether the read found a build - so
 * they are computed in one place rather than re-derived at each use site.
 */
export function viewPoseOutcome(pose: ViewTranscriptPose): {
  exitCode: number;
  capture: 'stdout' | 'stdout+stderr';
} {
  return viewScenarioOfPose(pose) === null
    ? { exitCode: 1, capture: 'stdout+stderr' }
    : { exitCode: 0, capture: 'stdout' };
}

/* ========================================================================== */

/**
 * Run `body` under the ambient a scenario or pose DECLARES, and restore what was
 * there afterwards.
 *
 * Declared rather than inherited, so `printSherloIntro` takes its own real branch
 * instead of being bypassed - the rule the dry-run family's header states and
 * every family keeps. Restored afterwards, because a caller that renders several
 * transcripts in one process (the byte-identity gate does) must not have one
 * render's ambient reach the next.
 */
async function withDeclaredAmbient<T>(
  ambient: { skipIntro: boolean },
  body: () => Promise<T>
): Promise<T> {
  const previousSkipIntro = process.env.SKIP_INTRO;
  process.env.SKIP_INTRO = ambient.skipIntro ? 'true' : 'false';

  try {
    return await body();
  } finally {
    if (previousSkipIntro === undefined) delete process.env.SKIP_INTRO;
    else process.env.SKIP_INTRO = previousSkipIntro;
  }
}
