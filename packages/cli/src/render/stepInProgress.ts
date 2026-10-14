/**
 * A STEP STILL RUNNING - its words, in one place, in the same grammar `sherlo init` prints.
 *
 * A long step is said in the present tense with `...` while it runs, and the same words serve both
 * readers: in a terminal they are the text of a spinner that the step's `✔` line replaces (or that
 * simply goes, when the step ends in no line of its own); anywhere else - a CI log, an agent's
 * shell - they are one plain line, printed once when the step starts, and kept. Which of the two a
 * run shows is decided by ONE check (../commands/shared/terminal), never here: this module only
 * says the words.
 *
 * A step of one platform starts with that platform's label, padded to the column its row's mark
 * stands in (./runRows), so a log reads down each platform: `🤖 Android  Building the app with
 * Gradle...`, then `🤖 Android  ✔ Built in 4m 12s`.
 *
 * Plain text, no colour: a spinner draws its own frame beside it, and a log has no colour to give.
 *
 * Pure, like everything under ./: state in, words out.
 */
import type { Platform } from '@sherlo/api-types';
import type { TranscriptSegment } from './segments';
import { platformLabelColumn } from './runRows';

/** Every step that shows while it runs (./segments says what each one is). */
export type StepInProgress = Extract<
  TranscriptSegment,
  {
    kind:
      | 'app-build-generating'
      | 'app-build-compiling'
      | 'platform-bundle-start'
      | 'binary-uploading'
      | 'eas-builds-starting'
      | 'wait-header';
  }
>;

const BUILD_TOOL: Record<Platform, string> = { android: 'Gradle', ios: 'Xcode' };

/** The words a running step shows: `🤖 Android  Building the app with Gradle...`. */
export function renderStepInProgress(step: StepInProgress): string {
  switch (step.kind) {
    case 'app-build-generating':
      return `${platformLabelColumn(
        step.platform
      )}Generating the native folder with expo prebuild...`;

    case 'app-build-compiling':
      return `${platformLabelColumn(step.platform)}Building the app with ${
        BUILD_TOOL[step.platform]
      }...`;

    case 'platform-bundle-start':
      return `${platformLabelColumn(step.platform)}Bundling the JavaScript...`;

    case 'binary-uploading': {
      const uploading = `Uploading the app build (${step.sizeMb} MB)...`;
      return step.platform ? `${platformLabelColumn(step.platform)}${uploading}` : uploading;
    }

    case 'eas-builds-starting':
      return step.platforms.length > 1 ? 'Starting EAS builds...' : 'Starting an EAS build...';

    case 'wait-header': {
      const theTest = step.testIndex !== undefined ? `Test ${step.testIndex}` : 'the test';
      return `Waiting for ${theTest} to finish (up to ${step.timeoutMinutes} min)...`;
    }
  }
}
