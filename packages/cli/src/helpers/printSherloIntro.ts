import { emit } from './transcriptSink';

/**
 * Print the sherlo wordmark and tagline.
 *
 * The banner's bytes live in the render layer (../render/renderSegment); what
 * stays here is the one thing that is NOT rendering - the ambient read that
 * decides whether the intro happens at all. An expectation producer declares
 * that decision in its scenario instead of inheriting this process's env, which
 * is what turns `SKIP_INTRO` from an invisible knob into a stated input.
 */
function printSherloIntro(): void {
  // Skip if already printed (prevents double printing in test command)
  if (process.env.SKIP_INTRO === 'true') {
    return;
  }

  emit({ kind: 'intro' });
}

export default printSherloIntro;
