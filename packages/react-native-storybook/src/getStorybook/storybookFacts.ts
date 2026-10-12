/**
 * STORYBOOK'S FACTS: what Storybook's start() was handed, kept as plain data (../sealedCore/seam).
 *
 * Sherlo's start wrapper records them as Storybook starts, and the host hands them to the sealed
 * core (../sealedCore/loadSealedCore), so the core reads the stories, their parameters and their
 * mocks without ever reaching Storybook's view. A launch where Storybook has not started has none.
 */
import type { StorybookFacts } from '../sealedCore/seam';

let recordedFacts: StorybookFacts | null = null;

/** Keep what Storybook's start() was handed in this launch. */
export function recordStorybookFacts(facts: StorybookFacts): void {
  recordedFacts = facts;
}

/** What Storybook's start() was handed in this launch, or null when it has not started. */
export function readStorybookFacts(): StorybookFacts | null {
  return recordedFacts;
}
