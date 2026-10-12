/**
 * A STEP STILL RUNNING - its words, in one place (epic sherlo-test-builds-apps, the output rebuilt
 * on init's grammar).
 *
 * A long step is said in the present tense with `...` while it runs, and the same words serve both
 * readers: in a terminal they are the text of a spinner that the step's `✔` line replaces (or that
 * simply goes, when the step ends in no line of its own); anywhere else - a CI log, an agent's
 * shell - they are one plain line, printed once when the step starts, and kept. Which of the two a
 * run shows is decided by ONE check (../commands/shared/terminal), never here: this module only
 * says the words.
 *
 * Plain text, no colour: a spinner draws its own frame beside it, and a log has no colour to give.
 *
 * Pure, like everything under ./: state in, words out. The words are drafts for the content
 * department.
 */
import type { Platform } from '@sherlo/api-types';
import { PLATFORM_LABEL } from '../constants';
import type { TranscriptSegment } from './segments';
import { platformWithEmoji } from './testSteps';

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

/** The words a running step shows: `Building the Android app with Gradle...`. */
export function renderStepInProgress(step: StepInProgress): string {
  switch (step.kind) {
    case 'app-build-generating':
      return `Generating the ${PLATFORM_LABEL[step.platform]} folder with expo prebuild...`;

    case 'app-build-compiling':
      return `Building the ${PLATFORM_LABEL[step.platform]} app with ${BUILD_TOOL[step.platform]}...`;

    case 'platform-bundle-start':
      return `Bundling the JavaScript for ${platformWithEmoji(step.platform)}...`;

    case 'binary-uploading':
      return step.platform
        ? `Uploading the ${platformWithEmoji(step.platform)} app build (${step.sizeMb} MB)...`
        : `Uploading the app build (${step.sizeMb} MB)...`;

    case 'eas-builds-starting':
      return step.platforms.length > 1 ? 'Starting EAS builds...' : 'Starting an EAS build...';

    case 'wait-header': {
      const theTest = step.testIndex !== undefined ? `Test ${step.testIndex}` : 'the test';
      return `Waiting for ${theTest} to finish (up to ${step.timeoutMinutes} min)...`;
    }
  }
}
